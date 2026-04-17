import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import { type ChosenDecision } from "@tichuml/ai-heuristics";
import {
  applyEngineAction,
  createInitialGameState,
  SYSTEM_ACTOR,
  type ActorId,
  type EngineAction,
  type EngineResult,
  type GameState,
  type InitialGameSeedConfig,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type TrickEntry
} from "@tichuml/engine";
import {
  deriveExchangeRenderModel,
  LOCAL_SEAT,
  PASS_TARGETS,
  assignPassCardToDraft,
  areAllExchangeSelectionsSubmitted,
  buildPlayVariantKey,
  collectLocalLegalCardIds,
  getExchangeFlowState,
  getPassTargetSeat,
  getPrimaryActorFromResult,
  getTurnActions,
  isExchangePhase,
  removePassCardFromDraft,
  shouldAllowAiEndgameContinuation,
  sortCardsForHand,
  validateExchangeDraft,
  type HandSortMode,
  type PassTarget,
  type PlayLegalAction
} from "./table-model";
import {
  createNormalActionRail,
  findMatchingHotkey,
  isEditableShortcutTarget,
  isDebugToggleShortcut,
  UI_HOTKEYS,
  type NormalActionSlotId,
  type UiCommandId,
  type UiDialogId,
  type UiMode
} from "./game-table-view-model";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG,
  DebugGameTableView,
  MAHJONG_WISH_RANKS,
  NormalGameTableView,
  describeAction,
  formatActorLabel,
  formatEvent,
  serializeNormalTableLayoutConfig,
  type DogLeadAnimationView,
  type NormalTableLayoutConfig,
  type NormalTableLayout,
  type NormalTableLayoutTokens,
  type SeatVisualPosition,
  type WishSelectionValue
} from "./game-table-views";
import { generateSeedWithEntropy } from "./seed/orchestrator";
import {
  type BackendRuntimeSettings,
  type DecisionRequestPayload,
  type SeedDebugSnapshot
} from "@tichuml/shared";
import {
  createUnknownBackendReachability,
  loadBackendSettings,
  persistBackendSettings,
  type BackendReachability
} from "./backend/settings";
import { resolveDecisionWithProvider } from "./backend/decision-provider";
import { emitDecisionTelemetry, emitEventTelemetry } from "./backend/telemetry";
import { testBackendHealth } from "./backend/client";
import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION
} from "@tichuml/telemetry";

const AI_STEP_DELAY_MS = 420;
const SYSTEM_STEP_DELAY_MS = 180;
const INITIAL_SEED_INDEX = 1;
const SEAT_LAYOUT: Array<{
  seat: SeatId;
  position: SeatVisualPosition;
  title: string;
  relation: string;
}> = [
  { seat: "seat-2", position: "top", title: "NORTH", relation: "Partner" },
  {
    seat: "seat-3",
    position: "left",
    title: "WEST",
    relation: "Left Opponent"
  },
  {
    seat: "seat-1",
    position: "right",
    title: "EAST",
    relation: "Right Opponent"
  },
  { seat: "seat-0", position: "bottom", title: "SOUTH", relation: "You" }
];

function createActorOnlyLegalActions(result: EngineResult, actor: ActorId) {
  const actorOnly = {} as EngineResult["legalActions"];
  actorOnly[actor] = result.legalActions[actor] ?? [];
  return actorOnly;
}

function createActorPlayOnlyLegalActions(result: EngineResult, actor: SeatId) {
  const actorOnly = createActorOnlyLegalActions(result, actor);
  actorOnly[actor] = (actorOnly[actor] ?? []).filter(
    (action): action is PlayLegalAction => action.type === "play_cards"
  );
  return actorOnly;
}

function getCurrentHandId(state: GameState): string {
  return `hand-${state.matchHistory.length + 1}`;
}

function buildDecisionRequestPayload(config: {
  matchId: string;
  state: EngineResult["nextState"];
  derived: EngineResult["derivedView"];
  legalActions: LegalActionMap;
  actorSeat: SeatId;
  decisionIndex: number;
}): DecisionRequestPayload {
  return {
    game_id: config.matchId,
    hand_id: getCurrentHandId(config.state),
    phase: config.state.phase,
    actor_seat: config.actorSeat,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    state_raw: config.state as unknown as Record<string, unknown>,
    state_norm: config.derived as unknown as Record<string, unknown>,
    legal_actions: config.legalActions as unknown as Record<string, unknown>,
    requested_provider: "server_heuristic",
    metadata: {
      decision_index: config.decisionIndex
    }
  };
}

export function isMandatoryOpeningLead(
  state: EngineResult["nextState"],
  actor: ActorId | null
): actor is SeatId {
  return (
    actor !== null &&
    actor !== SYSTEM_ACTOR &&
    state.phase === "trick_play" &&
    state.activeSeat === actor &&
    state.currentTrick === null
  );
}

export function shouldPauseForLocalOptionalAction(config: {
  autoplayLocal: boolean;
  localHasOptionalAction: boolean;
  forceAiEndgameContinuation: boolean;
  openingLeadPending: boolean;
  exchangePhaseActive?: boolean;
  activeResponseTurn?: boolean;
  pickupPending?: boolean;
}) {
  return (
    !config.autoplayLocal &&
    (Boolean(config.pickupPending) ||
      (config.localHasOptionalAction &&
        !config.forceAiEndgameContinuation &&
        !config.openingLeadPending &&
        !config.exchangePhaseActive &&
        !config.activeResponseTurn))
  );
}

type RoundCarryState = Pick<InitialGameSeedConfig, "matchHistory" | "matchScore">;

export function createNextDealCarryState(
  state: Pick<GameState, "matchComplete" | "matchHistory" | "matchScore">
): RoundCarryState {
  if (state.matchComplete) {
    throw new Error("Cannot create another deal after the match is complete.");
  }

  return {
    matchScore: { ...state.matchScore },
    matchHistory: state.matchHistory.map((entry) => ({
      handNumber: entry.handNumber,
      roundSeed: entry.roundSeed,
      teamScores: { ...entry.teamScores },
      cumulativeScores: { ...entry.cumulativeScores },
      finishOrder: [...entry.finishOrder],
      doubleVictory: entry.doubleVictory,
      tichuBonuses: entry.tichuBonuses.map((bonus) => ({ ...bonus }))
    }))
  };
}

function findNextEmptyPassTarget(
  draft: Partial<Record<PassTarget, string>>
): PassTarget | null {
  return PASS_TARGETS.find((target) => !draft[target]) ?? null;
}

function isPlayTrickEntry(
  entry: TrickEntry
): entry is Extract<TrickEntry, { type: "play" }> {
  return entry.type === "play";
}

function getDogLeadAnimationView(
  action: EngineAction,
  result: EngineResult
): DogLeadAnimationView | null {
  if (
    action.type !== "play_cards" ||
    action.cardIds.length !== 1 ||
    action.cardIds[0] !== "dog" ||
    !result.events.some((event) => event.type === "dog_led") ||
    !result.nextState.activeSeat
  ) {
    return null;
  }

  return {
    sourceSeat: action.seat,
    targetSeat: result.nextState.activeSeat
  };
}

const INITIAL_NORMAL_TABLE_LAYOUT_CONFIG = DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG;

type RoundSession = {
  roundIndex: number;
  round: EngineResult;
  entropyDebug: SeedDebugSnapshot;
};

type AppSessionProps = {
  initialSession: RoundSession;
  createRoundSession: (
    roundIndex: number,
    carryState?: RoundCarryState
  ) => Promise<RoundSession>;
};

function AppLoadingScreen({
  message,
  error,
  onRetry
}: {
  message: string;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <main className="tabletop-app tabletop-app--normal">
      <section className="normal-viewport">
        <div className="normal-viewport__board">
          <div
            style={{
              position: "relative",
              zIndex: 2,
              display: "grid",
              placeItems: "center",
              height: "100%",
              textAlign: "center",
              padding: "24px"
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "12px",
                maxWidth: "420px",
                color: "#eef6f0"
              }}
            >
              <strong style={{ fontSize: "1.2rem", letterSpacing: "0.04em" }}>
                Starting New Game
              </strong>
              <p style={{ margin: 0, color: "rgba(238, 246, 240, 0.82)" }}>
                {error ?? message}
              </p>
              {error ? (
                <div>
                  <button type="button" className="action-btn" onClick={onRetry}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const [initialSession, setInitialSession] = useState<RoundSession | null>(
    null
  );
  const [bootError, setBootError] = useState<string | null>(null);

  const createRoundSession = useEffectEvent(
    async (
      roundIndex: number,
      carryState?: RoundCarryState
    ): Promise<RoundSession> => {
      const generatedSeed = await generateSeedWithEntropy({ roundIndex });
      return {
        roundIndex,
        entropyDebug: generatedSeed.debug,
        round: createInitialGameState({
          seed: generatedSeed.shuffleSeedHex,
          seedProvenance: generatedSeed.provenance,
          ...(carryState ?? {})
        })
      };
    }
  );

  const bootstrapInitialRound = useEffectEvent(async () => {
    try {
      setBootError(null);
      const session = await createRoundSession(INITIAL_SEED_INDEX);
      startTransition(() => setInitialSession(session));
    } catch (error) {
      setBootError(
        error instanceof Error
          ? error.message
          : "Failed to create the first game seed."
      );
    }
  });

  useEffect(() => {
    if (initialSession) {
      return;
    }

    void bootstrapInitialRound();
  }, [bootstrapInitialRound, initialSession]);

  if (!initialSession) {
    return (
      <AppLoadingScreen
        message="Collecting layered entropy and deriving a deterministic shuffle seed."
        error={bootError}
        onRetry={() => {
          void bootstrapInitialRound();
        }}
      />
    );
  }

  return (
    <AppSession
      initialSession={initialSession}
      createRoundSession={createRoundSession}
    />
  );
}

function AppSession({ initialSession, createRoundSession }: AppSessionProps) {
  const [seedIndex, setSeedIndex] = useState(initialSession.roundIndex);
  const [round, setRound] = useState<EngineResult>(initialSession.round);
  const [matchId, setMatchId] = useState(initialSession.entropyDebug.gameId);
  const [decisionCount, setDecisionCount] = useState(0);
  const [backendSettings, setBackendSettings] =
    useState<BackendRuntimeSettings>(loadBackendSettings);
  const [backendStatus, setBackendStatus] = useState<BackendReachability>(
    createUnknownBackendReachability
  );
  const [uiMode, setUiMode] = useState<UiMode>("normal");
  const [layoutEditorActive, setLayoutEditorActive] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<UiDialogId | null>(null);
  const [autoplayLocal, setAutoplayLocal] = useState(false);
  const [thinkingActor, setThinkingActor] = useState<ActorId | null>(null);
  const [lastAiDecision, setLastAiDecision] = useState<ChosenDecision | null>(
    null
  );
  const [recentEvents, setRecentEvents] = useState<string[]>(() =>
    initialSession.round.events.map(formatEvent)
  );
  const [roundGenerationPending, setRoundGenerationPending] = useState(false);
  const [roundGenerationError, setRoundGenerationError] = useState<
    string | null
  >(null);
  const [latestEntropyDebug, setLatestEntropyDebug] = useState<SeedDebugSnapshot>(
    initialSession.entropyDebug
  );
  const [sortMode, setSortMode] = useState<HandSortMode>("rank");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(
    null
  );
  const [selectedWishRank, setSelectedWishRank] =
    useState<WishSelectionValue>(null);
  const [wishSubmissionPending, setWishSubmissionPending] = useState(false);
  const [selectedPassTarget, setSelectedPassTarget] =
    useState<PassTarget>("left");
  const [passDraft, setPassDraft] = useState<
    Partial<Record<PassTarget, string>>
  >({});
  const [stagedTrick, setStagedTrick] = useState<
    EngineResult["derivedView"]["currentTrick"] | null
  >(null);
  const [dogLeadAnimation, setDogLeadAnimation] =
    useState<DogLeadAnimationView | null>(null);
  const [normalTableLayout, setNormalTableLayout] = useState<NormalTableLayout>(
    () => INITIAL_NORMAL_TABLE_LAYOUT_CONFIG.elements
  );
  const [normalTableLayoutTokens, setNormalTableLayoutTokens] =
    useState<NormalTableLayoutTokens>(
      () => INITIAL_NORMAL_TABLE_LAYOUT_CONFIG.tokens
    );
  const localPassDragRef = useRef<{
    sourceTarget: PassTarget;
    cardId: string;
    completed: boolean;
  } | null>(null);

  const state = round.nextState;
  const derived = round.derivedView;
  const handId = getCurrentHandId(state);
  const primaryActor = getPrimaryActorFromResult(round);
  const roundSeed = state.seed;
  const localActions = round.legalActions[LOCAL_SEAT] ?? [];
  const localPlayActions = localActions.filter(
    (action): action is PlayLegalAction => action.type === "play_cards"
  );
  const localPassSelection = localActions.find(
    (action) => action.type === "select_pass"
  );
  const localPassAction = localActions.find(
    (action) => action.type === "pass_turn"
  );
  const localGrandTichuAction = localActions.find(
    (action) => action.type === "call_grand_tichu"
  );
  const localDeclineGrandTichuAction = localActions.find(
    (action) => action.type === "decline_grand_tichu"
  );
  const localCallTichuAction = localActions.find(
    (action) => action.type === "call_tichu"
  );
  const localDragonActions = localActions.filter(
    (action): action is Extract<LegalAction, { type: "assign_dragon_trick" }> =>
      action.type === "assign_dragon_trick"
  );
  const systemAdvanceAction =
    (round.legalActions[SYSTEM_ACTOR] ?? []).find(
      (action): action is Extract<LegalAction, { type: "advance_phase" }> =>
        action.type === "advance_phase"
    ) ?? null;
  const exchangeDebugEnabled = uiMode === "debug" || import.meta.env.DEV;
  const previousPhaseRef = useRef(state.phase);
  const previousLoggedPhaseRef = useRef(state.phase);
  const previousPassSelectionsRef = useRef({ ...state.passSelections });
  const previousAllExchangeReadyRef = useRef(
    areAllExchangeSelectionsSubmitted(state)
  );
  const previousTurnActionSnapshotRef = useRef("");
  const localLegalCardIds = collectLocalLegalCardIds(localActions);
  const localTurnActions = getTurnActions({
    state,
    legalActions: round.legalActions,
    seat: LOCAL_SEAT,
    selectedCardIds
  });
  const matchingPlayActions = localTurnActions.matchingPlayActions;
  const activePlayVariant =
    matchingPlayActions.find(
      (action) => buildPlayVariantKey(action) === selectedVariantKey
    ) ??
    matchingPlayActions[0] ??
    null;
  const wishSelectionOptions: WishSelectionValue[] =
    activePlayVariant?.availableWishRanks
      ? [
          null,
          ...MAHJONG_WISH_RANKS.filter((rank) =>
            activePlayVariant.availableWishRanks?.includes(rank)
          )
        ]
      : [];
  const resolvedWishRank =
    (selectedWishRank === null ||
      wishSelectionOptions.includes(selectedWishRank))
      ? selectedWishRank
      : null;
  const localIsPrimaryActor = primaryActor === LOCAL_SEAT;
  const wishDialogOpen =
    !roundGenerationPending &&
    !autoplayLocal &&
    localIsPrimaryActor &&
    Boolean(activePlayVariant?.availableWishRanks);
  const localHasOptionalAction =
    primaryActor !== LOCAL_SEAT && localActions.length > 0;
  const exchangePhaseActive = isExchangePhase(state.phase);
  const exchangeFlowState = getExchangeFlowState(state);
  const forceAiEndgameContinuation = shouldAllowAiEndgameContinuation(
    state,
    primaryActor
  );
  const openingLeadPending = isMandatoryOpeningLead(state, primaryActor);
  const activeResponseTurn =
    state.phase === "trick_play" &&
    state.currentTrick !== null &&
    primaryActor !== null &&
    primaryActor !== SYSTEM_ACTOR;
  const pickupPending =
    state.phase === "exchange_complete" && Boolean(systemAdvanceAction);
  const localExchangeValidation = validateExchangeDraft(
    passDraft,
    localPassSelection?.availableCardIds ?? [],
    localPassSelection?.requiredTargets ?? PASS_TARGETS
  );
  const previousLocalExchangeReadyRef = useRef(localExchangeValidation.isValid);
  const localCanInteract =
    !roundGenerationPending &&
    (autoplayLocal ||
      localIsPrimaryActor ||
      Boolean(localPassSelection) ||
      (!exchangePhaseActive && localHasOptionalAction));
  const localActionSummary = localActions.map((action) => describeAction(action));
  const localSummaryText =
    localActionSummary.length > 0
      ? localActionSummary.join(" • ")
      : "No local actions.";
  const displayedTrick = exchangePhaseActive
    ? null
    : (derived.currentTrick ?? stagedTrick);
  const trickIsResolving = !exchangePhaseActive && derived.currentTrick === null && stagedTrick !== null;
  const passSelectionReady = localExchangeValidation.isValid;
  const controlHint =
    roundGenerationPending
      ? "Starting new game"
      : roundGenerationError
        ? `New game failed: ${roundGenerationError}`
      : state.phase === "finished"
      ? state.matchComplete
        ? derived.matchWinner === "team-0"
          ? "Match complete - NS reached 1000"
          : derived.matchWinner === "team-1"
            ? "Match complete - EW reached 1000"
            : "Match complete"
        : "Round complete"
      : exchangePhaseActive
        ? localPassSelection
          ? "Select 3 cards and assign one to each destination"
          : exchangeFlowState === "exchange_waiting_for_ai"
            ? "Waiting for the other players to exchange"
            : exchangeFlowState === "exchange_resolving"
              ? "Resolving exchanges"
              : exchangeFlowState === "exchange_complete"
                ? pickupPending
                  ? "Review the received cards, then click Pickup"
                  : "Exchange complete"
            : "Exchange cards"
          : localDragonActions.length > 0
            ? "Choose who gets the Dragon"
            : localIsPrimaryActor
              ? "Your turn"
              : localHasOptionalAction && !forceAiEndgameContinuation
                ? "Interrupt available"
              : thinkingActor
                  ? `${formatActorLabel(thinkingActor)} thinking`
                  : "Auto-advancing";

  const cardLookup = new Map(state.shuffledDeck.map((card) => [card.id, card]));
  const exchangeRenderModel = deriveExchangeRenderModel({
    state,
    localSeat: LOCAL_SEAT,
    localPassDraft: passDraft,
    receivedCardsVisibleUntilPickup: pickupPending
  });
  const stagedSelectionBySeat = exchangeRenderModel.stagedSelectionBySeat;
  const visibleHandsBySeat = exchangeRenderModel.visibleHandsBySeat;
  const sortedLocalHand = sortCardsForHand(
    visibleHandsBySeat[LOCAL_SEAT],
    sortMode,
    localPlayActions
  );
  const seatViews = SEAT_LAYOUT.map(({ seat, position, title, relation }) => ({
    seat,
    position,
    title,
    relation,
    handCount: visibleHandsBySeat[seat].length,
    cards: visibleHandsBySeat[seat],
    callState: derived.calls[seat],
    passReady: Boolean(
      state.passSelections[seat] || state.revealedPasses[seat]
    ),
    finishIndex: state.finishedOrder.indexOf(seat),
    isLocalSeat: seat === LOCAL_SEAT,
    isPrimarySeat: primaryActor === seat,
    isThinkingSeat: thinkingActor === seat
  }));
  const pickupStageViews = [];
  const seatRelativePlays = SEAT_LAYOUT.map(({ seat, position, title }) => ({
    seat,
    position,
    label: title,
    plays: exchangePhaseActive
      ? []
      : (displayedTrick?.entries ?? []).filter(
      (entry): entry is Extract<TrickEntry, { type: "play" }> =>
        isPlayTrickEntry(entry) && entry.seat === seat
      )
  }));
  const tablePassGroups = SEAT_LAYOUT.map(({ seat, position, title }) => {
    const selection = stagedSelectionBySeat[seat];
    const cardIds =
      pickupPending
        ? exchangeRenderModel.receivedPendingPickupBySeat[seat]
        : PASS_TARGETS.map((target) => selection?.[target]).filter(
            (value): value is string => Boolean(value)
          );

    return {
      seat,
      position,
      label: pickupPending ? `${title} Pickup` : title,
      cardIds
    };
  }).filter((group) => group.cardIds.length > 0);
  const passRouteViews =
    state.phase === "pass_select" || state.phase === "pass_reveal"
      ? SEAT_LAYOUT.flatMap(({ seat, position }) =>
          PASS_TARGETS.map((target) => {
            const targetSeat = getPassTargetSeat(seat, target);
            const revealedSelection = state.revealedPasses[seat];
            const stagedSelection = stagedSelectionBySeat[seat];
            const stagedCardId = stagedSelection?.[target] ?? null;
            const visibleCardId =
              revealedSelection?.[target] ??
              (seat === LOCAL_SEAT ? stagedCardId : null);

            return {
              key: `${seat}-${target}`,
              sourceSeat: seat,
              sourcePosition: position,
              target,
              targetSeat,
              displayMode: "passing" as const,
              occupied: Boolean(stagedCardId),
              visibleCardId,
              faceDown: Boolean(stagedCardId) && !visibleCardId,
              interactive:
                !roundGenerationPending &&
                seat === LOCAL_SEAT &&
                state.phase === "pass_select"
            };
          })
        )
      : pickupPending
        ? SEAT_LAYOUT.flatMap(({ seat, position }) =>
            PASS_TARGETS.map((target) => {
              const visibleCardId =
                exchangeRenderModel.receivedPendingPickupByTargetBySeat[seat][
                  target
                ] ?? null;

              return {
                key: `pickup-${seat}-${target}`,
                sourceSeat: seat,
                sourcePosition: position,
                target,
                targetSeat: getPassTargetSeat(seat, target),
                displayMode: "pickup" as const,
                occupied: Boolean(visibleCardId),
                visibleCardId,
                faceDown: false,
                interactive: false
              };
            }).filter((route) => route.occupied)
          )
        : [];
  const passLaneViews = PASS_TARGETS.map((target) => ({
    target,
    targetSeat: getPassTargetSeat(LOCAL_SEAT, target),
    assignedCardId: passDraft[target] ?? null
  }));
  const normalActionRail = createNormalActionRail({
    phase: state.phase,
    nextEnabled: !roundGenerationPending && Boolean(localDeclineGrandTichuAction),
    nextDealEnabled:
      !roundGenerationPending &&
      state.phase === "finished" &&
      !state.matchComplete,
    grandTichuEnabled:
      !roundGenerationPending && Boolean(localGrandTichuAction),
    tichuEnabled: !roundGenerationPending && localTurnActions.canCallTichu,
    passEnabled: !roundGenerationPending && localTurnActions.canPass,
    exchangeEnabled: !roundGenerationPending && passSelectionReady,
    pickupEnabled: !roundGenerationPending && Boolean(systemAdvanceAction),
    playEnabled: !roundGenerationPending && localTurnActions.canPlay,
    matchComplete: state.matchComplete
  });
  const executeUiHotkeyCommand = useEffectEvent((commandId: UiCommandId) => {
    executeUiCommand(commandId);
  });

  useEffect(() => {
    persistBackendSettings(backendSettings);
  }, [backendSettings]);

  const handleBackendSettingsChange = useEffectEvent(
    (nextSettings: BackendRuntimeSettings) => {
      setBackendSettings(nextSettings);
      setBackendStatus(createUnknownBackendReachability());
    }
  );

  const testBackendConnection = useEffectEvent(async () => {
    setBackendStatus({
      state: "checking",
      detail: "Checking server health and database reachability.",
      checkedAt: null
    });

    try {
      const result = await testBackendHealth(backendSettings.backendBaseUrl);
      setBackendStatus({
        state: "reachable",
        detail: result.database
          ? `Health endpoint responded successfully and database reported '${result.database}'.`
          : "Health endpoint responded successfully.",
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      setBackendStatus({
        state: "unreachable",
        detail:
          error instanceof Error ? error.message : "Backend health check failed.",
        checkedAt: new Date().toISOString()
      });
    }
  });

  useEffect(() => {
    const turnActionSnapshot = JSON.stringify({
      seat: LOCAL_SEAT,
      phase: state.phase,
      activeSeat: state.activeSeat,
      trickType: localTurnActions.leadCombinationKind,
      leadCombo: localTurnActions.leadCombinationKey,
      selectedCards: localTurnActions.selectedCardIds,
      legalMoveCount: localTurnActions.legalPlayCount,
      canPlay: localTurnActions.canPlay,
      canPass: localTurnActions.canPass,
      canCallTichu: localTurnActions.canCallTichu,
      wish: state.currentWish,
      legalMoves: localPlayActions.map((action) => ({
        cards: action.cardIds,
        kind: action.combination.kind,
        primaryRank: action.combination.primaryRank
      }))
    });

    if (
      (uiMode === "debug" || import.meta.env.DEV) &&
      previousTurnActionSnapshotRef.current !== turnActionSnapshot
    ) {
      console.info("[turn-actions]", JSON.parse(turnActionSnapshot));
    }

    if (localTurnActions.isTichuOnlyDeadlock) {
      console.error(
        "[turn-actions] Critical turn deadlock: Tichu is the only enabled progression action.",
        JSON.parse(turnActionSnapshot)
      );
    }

    previousTurnActionSnapshotRef.current = turnActionSnapshot;
  }, [
    localPlayActions,
    localTurnActions,
    state.activeSeat,
    state.currentWish,
    state.phase,
    uiMode
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (wishDialogOpen) {
        return;
      }

      if (mainMenuOpen || activeDialog) {
        const overlayHotkey = findMatchingHotkey(event, ["dialogs"]);
        if (!overlayHotkey?.commandId) {
          return;
        }

        event.preventDefault();
        executeUiHotkeyCommand(overlayHotkey.commandId);
        return;
      }

      if (layoutEditorActive && isDebugToggleShortcut(event)) {
        return;
      }

      const globalHotkey = findMatchingHotkey(event, ["global"]);
      if (!globalHotkey?.commandId) {
        return;
      }

      event.preventDefault();
      executeUiHotkeyCommand(globalHotkey.commandId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeDialog,
    executeUiHotkeyCommand,
    layoutEditorActive,
    mainMenuOpen,
    wishDialogOpen
  ]);

  useEffect(() => {
    if (roundGenerationPending) {
      setThinkingActor(null);
      return;
    }

    if (state.phase === "finished") {
      setThinkingActor(null);
      return;
    }

    if (!primaryActor) {
      setThinkingActor(null);
      return;
    }

    if (!autoplayLocal && localIsPrimaryActor) {
      setThinkingActor(null);
      return;
    }

    if (
      shouldPauseForLocalOptionalAction({
        autoplayLocal,
        localHasOptionalAction,
        forceAiEndgameContinuation,
        openingLeadPending,
        exchangePhaseActive,
        activeResponseTurn,
        pickupPending
      })
    ) {
      setThinkingActor(null);
      return;
    }

    const delay =
      primaryActor === SYSTEM_ACTOR ? SYSTEM_STEP_DELAY_MS : AI_STEP_DELAY_MS;
    setThinkingActor(primaryActor);

    const timeout = window.setTimeout(() => {
      void (async () => {
        const legalActions = autoplayLocal
          ? round.legalActions
          : createActorOnlyLegalActions(round, primaryActor);
        const initialResolution = await resolveDecisionWithProvider({
          context: {
            state: round.nextState,
            legalActions
          },
          actor: primaryActor,
          settings: backendSettings,
          requestPayload:
            primaryActor === SYSTEM_ACTOR
              ? buildDecisionRequestPayload({
                  matchId,
                  state: round.nextState,
                  derived: round.derivedView,
                  legalActions,
                  actorSeat: LOCAL_SEAT,
                  decisionIndex: decisionCount
                })
              : buildDecisionRequestPayload({
                  matchId,
                  state: round.nextState,
                  derived: round.derivedView,
                  legalActions,
                  actorSeat: primaryActor,
                  decisionIndex: decisionCount
                })
        });

        setBackendStatus((current) => ({
          state:
            initialResolution.providerUsed === "server_heuristic"
              ? "reachable"
              : initialResolution.usedFallback
                ? "unreachable"
                : current.state,
          detail: initialResolution.providerReason,
          checkedAt: new Date().toISOString()
        }));

        if (!initialResolution.handledByServerTelemetry) {
          emitDecisionTelemetry({
            settings: backendSettings,
            action: initialResolution.chosen.action,
            phase: round.nextState.phase,
            gameId: matchId,
            handId,
            decisionIndex: decisionCount,
            stateRaw: round.nextState,
            stateNorm: round.derivedView,
            legalActions,
            policyName: initialResolution.chosen.explanation.policy,
            policySource: initialResolution.providerUsed,
            metadata: {
              provider_reason: initialResolution.providerReason
            }
          });
        }

        let nextResult = applyEngineAction(
          round.nextState,
          initialResolution.chosen.action
        );
        emitEventTelemetry({
          settings: backendSettings,
          events: nextResult.events,
          phase: round.nextState.phase,
          actorSeat:
            initialResolution.chosen.actor === SYSTEM_ACTOR
              ? SYSTEM_ACTOR
              : initialResolution.chosen.actor,
          gameId: matchId,
          handId,
          metadata: {
            action_type: initialResolution.chosen.action.type,
            provider_used: initialResolution.providerUsed
          }
        });

        let decisionDelta = 1;
        let recordedDecision: ChosenDecision | null =
          initialResolution.chosen.actor !== SYSTEM_ACTOR
            ? initialResolution.chosen
            : null;
        const nextEvents = [...nextResult.events];
        let dogAnimation = getDogLeadAnimationView(
          initialResolution.chosen.action,
          nextResult
        );

        if (
          isMandatoryOpeningLead(round.nextState, primaryActor) &&
          isMandatoryOpeningLead(nextResult.nextState, primaryActor)
        ) {
          const playOnlyLegalActions = createActorPlayOnlyLegalActions(
            nextResult,
            primaryActor
          );

          if ((playOnlyLegalActions[primaryActor] ?? []).length > 0) {
            const forcedResolution = await resolveDecisionWithProvider({
              context: {
                state: nextResult.nextState,
                legalActions: playOnlyLegalActions
              },
              actor: primaryActor,
              settings: backendSettings,
              requestPayload: buildDecisionRequestPayload({
                matchId,
                state: nextResult.nextState,
                derived: nextResult.derivedView,
                legalActions: playOnlyLegalActions,
                actorSeat: primaryActor,
                decisionIndex: decisionCount + 1
              })
            });

            if (!forcedResolution.handledByServerTelemetry) {
              emitDecisionTelemetry({
                settings: backendSettings,
                action: forcedResolution.chosen.action,
                phase: nextResult.nextState.phase,
                gameId: matchId,
                handId,
                decisionIndex: decisionCount + 1,
                stateRaw: nextResult.nextState,
                stateNorm: nextResult.derivedView,
                legalActions: playOnlyLegalActions,
                policyName: forcedResolution.chosen.explanation.policy,
                policySource: forcedResolution.providerUsed,
                metadata: {
                  provider_reason: forcedResolution.providerReason,
                  forced_opening_play: true
                }
              });
            }

            nextResult = applyEngineAction(
              nextResult.nextState,
              forcedResolution.chosen.action
            );
            emitEventTelemetry({
              settings: backendSettings,
              events: nextResult.events,
              phase: round.nextState.phase,
              actorSeat:
                forcedResolution.chosen.actor === SYSTEM_ACTOR
                  ? SYSTEM_ACTOR
                  : forcedResolution.chosen.actor,
              gameId: matchId,
              handId,
              metadata: {
                action_type: forcedResolution.chosen.action.type,
                provider_used: forcedResolution.providerUsed,
                forced_opening_play: true
              }
            });
            nextEvents.push(...nextResult.events);
            decisionDelta += 1;
            dogAnimation =
              getDogLeadAnimationView(forcedResolution.chosen.action, nextResult) ??
              dogAnimation;
            recordedDecision =
              forcedResolution.chosen.actor !== SYSTEM_ACTOR
                ? forcedResolution.chosen
                : recordedDecision;
          }
        }

        startTransition(() => {
          setRound(nextResult);
          setDecisionCount((current) => current + decisionDelta);
          setRecentEvents((current) =>
            [...current, ...nextEvents.map(formatEvent)].slice(-14)
          );
          setSelectedCardIds([]);
          setSelectedVariantKey(null);
          setSelectedWishRank(null);
          setWishSubmissionPending(false);
          if (recordedDecision) {
            setLastAiDecision(recordedDecision);
          }
          if (dogAnimation) {
            setDogLeadAnimation(dogAnimation);
          }
          if (nextResult.nextState.phase !== "pass_select") {
            setPassDraft({});
            setSelectedPassTarget("left");
          }
        });
      })().catch((error) => {
        console.error("[decision-provider] failed to resolve automated action", {
          error: error instanceof Error ? error.message : String(error),
          actor: primaryActor,
          phase: round.nextState.phase
        });
        setBackendStatus({
          state: "unreachable",
          detail:
            error instanceof Error ? error.message : "Decision provider failed.",
          checkedAt: new Date().toISOString()
        });
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [
    autoplayLocal,
    backendSettings,
    decisionCount,
    exchangePhaseActive,
    forceAiEndgameContinuation,
    handId,
    localHasOptionalAction,
    localIsPrimaryActor,
    matchId,
    activeResponseTurn,
    openingLeadPending,
    pickupPending,
    primaryActor,
    roundGenerationPending,
    round,
    state.phase
  ]);

  useEffect(() => {
    if (!dogLeadAnimation) {
      return;
    }

    const timeout = window.setTimeout(() => setDogLeadAnimation(null), 760);
    return () => window.clearTimeout(timeout);
  }, [dogLeadAnimation]);

  useEffect(() => {
    if (exchangePhaseActive) {
      if (stagedTrick !== null) {
        setStagedTrick(null);
      }
      return;
    }

    if (derived.currentTrick) {
      setStagedTrick(derived.currentTrick);
      return;
    }

    if (!stagedTrick) {
      return;
    }

    const timeout = window.setTimeout(() => setStagedTrick(null), 190);
    return () => window.clearTimeout(timeout);
  }, [derived.currentTrick, exchangePhaseActive, stagedTrick]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;

    if (!isExchangePhase(previousPhase) && exchangePhaseActive) {
      setStagedTrick(null);
      setSelectedCardIds([]);
      setSelectedVariantKey(null);
      setSelectedWishRank(null);
    }

    if (isExchangePhase(previousPhase) && !exchangePhaseActive) {
      setPassDraft({});
      setSelectedPassTarget("left");
    }

    previousPhaseRef.current = state.phase;
  }, [exchangePhaseActive, state.phase]);

  useEffect(() => {
    const previousSelections = previousPassSelectionsRef.current;
    const allReady = areAllExchangeSelectionsSubmitted(state);

    if (exchangeDebugEnabled) {
      if (
        !isExchangePhase(previousLoggedPhaseRef.current) &&
        exchangePhaseActive
      ) {
        console.info("[exchange] entered exchange phase", {
          phase: state.phase,
          flow: exchangeFlowState
        });
      }

      for (const seat of Object.keys(state.passSelections) as SeatId[]) {
        if (state.passSelections[seat] && !previousSelections[seat]) {
          console.info("[exchange] seat exchange submitted", {
            seat,
            phase: state.phase
          });
          if (seat !== LOCAL_SEAT) {
            console.info("[exchange] AI exchange submitted", {
              seat,
              phase: state.phase
            });
          }
        }
      }

      if (
        localPassSelection &&
        localExchangeValidation.isValid &&
        !previousLocalExchangeReadyRef.current
      ) {
        console.info("[exchange] seat exchange selection complete", {
          seat: LOCAL_SEAT,
          phase: state.phase
        });
      }

      if (allReady && !previousAllExchangeReadyRef.current) {
        console.info("[exchange] all exchanges ready", {
          phase: state.phase
        });
      }

      if (
        previousLoggedPhaseRef.current !== state.phase &&
        state.phase === "pass_reveal"
      ) {
        console.info("[exchange] resolving exchanges", {
          phase: state.phase
        });
      }

      if (
        previousLoggedPhaseRef.current !== state.phase &&
        state.phase === "exchange_complete"
      ) {
        console.info("[exchange] exchange complete", {
          phase: state.phase
        });
      }
    }

    previousLoggedPhaseRef.current = state.phase;
    previousPassSelectionsRef.current = { ...state.passSelections };
    previousAllExchangeReadyRef.current = allReady;
    previousLocalExchangeReadyRef.current = localExchangeValidation.isValid;
  }, [
    exchangeDebugEnabled,
    exchangeFlowState,
    exchangePhaseActive,
    localExchangeValidation.isValid,
    localPassSelection,
    state,
    state.phase
  ]);

  function resetInteractionState() {
    setSelectedCardIds([]);
    setSelectedVariantKey(null);
    setSelectedWishRank(null);
    setWishSubmissionPending(false);
    setPassDraft({});
    setSelectedPassTarget("left");
    localPassDragRef.current = null;
  }

  function applyClientAction(
    action: EngineAction,
    chosen?: ChosenDecision,
    options?: { skipDecisionTelemetry?: boolean }
  ) {
    if (roundGenerationPending) {
      return;
    }

    if (!options?.skipDecisionTelemetry) {
      emitDecisionTelemetry({
        settings: backendSettings,
        action,
        phase: state.phase,
        gameId: matchId,
        handId,
        decisionIndex: decisionCount,
        stateRaw: state,
        stateNorm: derived,
        legalActions: round.legalActions,
        policyName: chosen?.explanation.policy ?? "human-ui",
        policySource:
          chosen?.actor === SYSTEM_ACTOR
            ? "local_system"
            : chosen
              ? "local_heuristic"
              : "human_ui",
        metadata: {
          source: chosen ? "resolved-client-provider" : "direct-ui"
        }
      });
    }

    const nextResult = applyEngineAction(state, action);
    const dogAnimation = getDogLeadAnimationView(action, nextResult);
    emitEventTelemetry({
      settings: backendSettings,
      events: nextResult.events,
      phase: state.phase,
      actorSeat:
        "seat" in action ? action.seat : "actor" in action ? action.actor : null,
      gameId: matchId,
      handId,
      metadata: {
        action_type: action.type
      }
    });

    startTransition(() => {
      setRound(nextResult);
      setDecisionCount((current) => current + 1);
      setRecentEvents((current) =>
        [...current, ...nextResult.events.map(formatEvent)].slice(-14)
      );
      if (chosen && chosen.actor !== SYSTEM_ACTOR) {
        setLastAiDecision(chosen);
      }
      if (dogAnimation) {
        setDogLeadAnimation(dogAnimation);
      }
      resetInteractionState();
    });
  }

  const loadRoundSession = useEffectEvent(
    async (carryState?: RoundCarryState) => {
      if (roundGenerationPending) {
        return;
      }

      const nextSeedIndex = seedIndex + 1;
      setRoundGenerationPending(true);
      setRoundGenerationError(null);

      try {
        const nextSession = await createRoundSession(nextSeedIndex, carryState);

        startTransition(() => {
          if (!carryState) {
            setMatchId(nextSession.entropyDebug.gameId);
          }
          setSeedIndex(nextSession.roundIndex);
          setRound(nextSession.round);
          setLatestEntropyDebug(nextSession.entropyDebug);
          setDecisionCount(0);
          setThinkingActor(null);
          setLastAiDecision(null);
          setRecentEvents(nextSession.round.events.map(formatEvent));
          setSortMode("rank");
          setStagedTrick(null);
          setDogLeadAnimation(null);
          resetInteractionState();
        });
      } catch (error) {
        setRoundGenerationError(
          error instanceof Error
            ? error.message
            : "Failed to generate a new round seed."
        );
      } finally {
        setRoundGenerationPending(false);
      }
    }
  );

  const startFreshGame = useEffectEvent(async () => {
    await loadRoundSession();
  });

  const startNextDeal = useEffectEvent(async () => {
    if (roundGenerationPending) {
      return;
    }

    if (state.phase !== "finished" || state.matchComplete) {
      return;
    }

    await loadRoundSession(createNextDealCarryState(state));
  });

  function exportCurrentNormalTableLayout() {
    const payload = {
      version: DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG.version,
      surface: DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG.surface,
      elements: normalTableLayout,
      tokens: normalTableLayoutTokens
    };
    const blob = new Blob([serializeNormalTableLayoutConfig(payload)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tichu-table-layout-${Date.now()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function closeActiveOverlay() {
    setMainMenuOpen(false);
    setActiveDialog(null);
  }

  function executeUiCommand(commandId: UiCommandId) {
    if (roundGenerationPending && commandId !== "close_active_overlay") {
      return;
    }

    switch (commandId) {
      case "new_game":
        closeActiveOverlay();
        void startFreshGame();
        break;
      case "toggle_table_editor":
        closeActiveOverlay();
        if (uiMode === "debug") {
          setUiMode("normal");
          setLayoutEditorActive(true);
          break;
        }

        setLayoutEditorActive((current) => !current);
        break;
      case "toggle_debug_mode":
        closeActiveOverlay();
        setLayoutEditorActive(false);
        setUiMode((current) => (current === "normal" ? "debug" : "normal"));
        break;
      case "open_backend_settings_dialog":
        setMainMenuOpen(false);
        setActiveDialog("backend_settings");
        break;
      case "open_hotkeys_dialog":
        setMainMenuOpen(false);
        setActiveDialog("hotkeys");
        break;
      case "open_random_sources_dialog":
        setMainMenuOpen(false);
        setActiveDialog("random_sources");
        break;
      case "open_score_history_dialog":
        setMainMenuOpen(false);
        setActiveDialog("score_history");
        break;
      case "open_how_to_play_dialog":
        setMainMenuOpen(false);
        setActiveDialog("how_to_play");
        break;
      case "close_active_overlay":
        closeActiveOverlay();
        break;
    }
  }

  function handleNormalTableLayoutImport(config: NormalTableLayoutConfig) {
    setNormalTableLayout(config.elements);
    setNormalTableLayoutTokens(config.tokens);
  }

  function continueWithAi() {
    if (roundGenerationPending || !primaryActor || primaryActor === LOCAL_SEAT) {
      return;
    }

    const legalActions = createActorOnlyLegalActions(round, primaryActor);
    void resolveDecisionWithProvider({
      context: {
        state,
        legalActions
      },
      actor: primaryActor,
      settings: backendSettings,
      requestPayload:
        primaryActor === SYSTEM_ACTOR
          ? buildDecisionRequestPayload({
              matchId,
              state,
              derived,
              legalActions,
              actorSeat: LOCAL_SEAT,
              decisionIndex: decisionCount
            })
          : buildDecisionRequestPayload({
              matchId,
              state,
              derived,
              legalActions,
              actorSeat: primaryActor,
              decisionIndex: decisionCount
            })
    })
      .then((resolution) => {
        setBackendStatus({
          state:
            resolution.providerUsed === "server_heuristic"
              ? "reachable"
              : resolution.usedFallback
                ? "unreachable"
                : "unknown",
          detail: resolution.providerReason,
          checkedAt: new Date().toISOString()
        });

        if (!resolution.handledByServerTelemetry) {
          emitDecisionTelemetry({
            settings: backendSettings,
            action: resolution.chosen.action,
            phase: state.phase,
            gameId: matchId,
            handId,
            decisionIndex: decisionCount,
            stateRaw: state,
            stateNorm: derived,
            legalActions,
            policyName: resolution.chosen.explanation.policy,
            policySource: resolution.providerUsed,
            metadata: {
              provider_reason: resolution.providerReason
            }
          });
        }

        applyClientAction(resolution.chosen.action, resolution.chosen, {
          skipDecisionTelemetry: true
        });
      })
      .catch((error) => {
        setBackendStatus({
          state: "unreachable",
          detail:
            error instanceof Error ? error.message : "Decision provider failed.",
          checkedAt: new Date().toISOString()
        });
      });
  }

  function playSelectedCards() {
    if (roundGenerationPending || !localTurnActions.canPlay || !activePlayVariant) {
      return;
    }

    if (wishSelectionOptions.length > 0) {
      if (wishSubmissionPending) {
        return;
      }

      setWishSubmissionPending(true);
    }

    applyClientAction({
      type: "play_cards",
      seat: LOCAL_SEAT,
      cardIds: activePlayVariant.cardIds,
      ...(activePlayVariant.phoenixAsRank !== undefined
        ? { phoenixAsRank: activePlayVariant.phoenixAsRank }
        : {}),
      ...(wishSelectionOptions.length > 0 ? { wishRank: resolvedWishRank } : {})
    });
  }

  function cancelWishSelection() {
    if (wishSubmissionPending) {
      return;
    }

    setSelectedCardIds([]);
    setSelectedVariantKey(null);
    setSelectedWishRank(null);
    setWishSubmissionPending(false);
  }

  function confirmPassSelection() {
    if (
      roundGenerationPending ||
      !localPassSelection ||
      !passSelectionReady ||
      !passDraft.left ||
      !passDraft.partner ||
      !passDraft.right
    ) {
      return;
    }

    applyClientAction({
      type: "select_pass",
      seat: LOCAL_SEAT,
      left: passDraft.left,
      partner: passDraft.partner,
      right: passDraft.right
    });
  }

  function assignPassCard(target: PassTarget, cardId: string) {
    if (roundGenerationPending || !localPassSelection) {
      return;
    }

    setPassDraft((current) => {
      const nextDraft = assignPassCardToDraft(current, target, cardId);
      if (nextDraft === current) {
        setSelectedPassTarget(target);
        return current;
      }

      const nextEmptyTarget = findNextEmptyPassTarget(nextDraft);
      setSelectedPassTarget(nextEmptyTarget ?? target);
      return nextDraft;
    });
  }

  function removePassCard(target: PassTarget) {
    setPassDraft((current) => {
      const nextDraft = removePassCardFromDraft(current, target);
      if (nextDraft === current) {
        return current;
      }

      setSelectedPassTarget(target);
      return nextDraft;
    });
  }

  function handleLocalCardClick(cardId: string) {
    if (!localCanInteract) {
      return;
    }

    if (localPassSelection) {
      assignPassCard(selectedPassTarget, cardId);
      return;
    }

    if (exchangePhaseActive) {
      return;
    }

    setSelectedCardIds((current) => {
      const nextSelection = current.includes(cardId)
        ? current.filter((selectedId) => selectedId !== cardId)
        : [...current, cardId];

      const sortedSelection = sortedLocalHand
        .map((card) => card.id)
        .filter((candidateId) => nextSelection.includes(candidateId));

      setSelectedVariantKey(null);
      setSelectedWishRank(null);
      return sortedSelection;
    });
  }

  function handleNormalAction(slotId: NormalActionSlotId) {
    if (roundGenerationPending && slotId !== "new_round") {
      return;
    }

    switch (slotId) {
      case "next":
        if (localDeclineGrandTichuAction) {
          applyClientAction(localDeclineGrandTichuAction);
        }
        break;
      case "grand_tichu":
        if (localGrandTichuAction) {
          applyClientAction(localGrandTichuAction);
        }
        break;
      case "tichu":
        if (localTurnActions.canCallTichu && localCallTichuAction) {
          applyClientAction(localCallTichuAction);
        }
        break;
      case "pass":
        if (localTurnActions.canPass && localPassAction) {
          applyClientAction(localPassAction);
        }
        break;
      case "exchange":
        confirmPassSelection();
        break;
      case "pickup":
        if (systemAdvanceAction) {
          applyClientAction(systemAdvanceAction);
        }
        break;
      case "play":
        playSelectedCards();
        break;
      case "new_round":
        void startNextDeal();
        break;
    }
  }

  function handlePassLaneDrop(target: PassTarget, cardId: string) {
    if (roundGenerationPending) {
      return;
    }

    if (localPassDragRef.current?.cardId === cardId) {
      localPassDragRef.current.completed = true;
    }
    assignPassCard(target, cardId);
  }

  function handlePassLaneCardClick(target: PassTarget) {
    if (roundGenerationPending || !localPassSelection) {
      return;
    }

    removePassCard(target);
  }

  function handlePassLaneCardDragStart(target: PassTarget, cardId: string) {
    localPassDragRef.current = {
      sourceTarget: target,
      cardId,
      completed: false
    };
  }

  function handlePassLaneCardDragEnd(target: PassTarget, cardId: string) {
    const dragState = localPassDragRef.current;
    if (
      !dragState ||
      dragState.sourceTarget !== target ||
      dragState.cardId !== cardId
    ) {
      return;
    }

    if (!dragState.completed) {
      removePassCard(target);
    }

    localPassDragRef.current = null;
  }

  function handleDragonRecipientSelect(recipient: SeatId) {
    if (roundGenerationPending) {
      return;
    }

    const action = localDragonActions.find(
      (candidate) => candidate.recipient === recipient
    );
    if (action) {
      applyClientAction(action);
    }
  }

  const viewProps = {
    roundSeed,
    decisionCount,
    state,
    derived,
    controlHint,
    seatViews,
    seatRelativePlays,
    displayedTrick,
    trickIsResolving,
    pickupStageViews,
    dogLeadAnimation,
    tablePassGroups,
    passRouteViews,
    passLaneViews,
    sortedLocalHand,
    localCanInteract,
    localPassInteractionEnabled:
      !roundGenerationPending && Boolean(localPassSelection),
    localLegalCardIds,
    selectedCardIds,
    selectedPassTarget,
    passSelectionReady,
    matchingPlayActions,
    activePlayVariant,
    resolvedWishRank,
    wishDialogOpen,
    wishSelectionOptions,
    wishConfirmDisabled: false,
    wishSubmissionPending,
    normalActionRail,
    sortMode,
    autoplayLocal,
    lastAiDecision,
    recentEvents,
    localActionSummary,
    localSummaryText,
    canContinueAi:
      !roundGenerationPending && Boolean(primaryActor && primaryActor !== LOCAL_SEAT),
    localDragonRecipients: localDragonActions.map((action) => action.recipient),
    uiMode,
    normalTableLayout,
    normalTableLayoutTokens,
    layoutEditorActive,
    mainMenuOpen,
    activeDialog,
    latestEntropyDebug,
    backendSettings,
    backendStatus,
    hotkeyDefinitions: UI_HOTKEYS,
    cardLookup,
    onAutoplayChange: setAutoplayLocal,
    onContinueAi: continueWithAi,
    onSortModeChange: setSortMode,
    onLocalCardClick: handleLocalCardClick,
    onPassTargetSelect: setSelectedPassTarget,
    onPassLaneDrop: handlePassLaneDrop,
    onPassLaneCardClick: handlePassLaneCardClick,
    onPassLaneCardDragStart: handlePassLaneCardDragStart,
    onPassLaneCardDragEnd: handlePassLaneCardDragEnd,
    onVariantSelect: setSelectedVariantKey,
    onWishRankSelect: setSelectedWishRank,
    onWishConfirm: playSelectedCards,
    onWishCancel: cancelWishSelection,
    onDragonRecipientSelect: handleDragonRecipientSelect,
    onNormalAction: handleNormalAction,
    onNormalTableLayoutChange: setNormalTableLayout,
    onNormalTableLayoutImport: handleNormalTableLayoutImport,
    onExportNormalTableLayout: exportCurrentNormalTableLayout,
    onBackendSettingsChange: handleBackendSettingsChange,
    onTestBackend: () => {
      void testBackendConnection();
    },
    onUiCommand: executeUiCommand,
    onMainMenuOpenChange: setMainMenuOpen
  };

  return uiMode === "normal" ? (
    <NormalGameTableView {...viewProps} />
  ) : (
    <DebugGameTableView {...viewProps} />
  );
}
