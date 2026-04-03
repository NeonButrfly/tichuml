import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import {
  heuristicsV1Policy,
  type ChosenDecision
} from "@tichuml/ai-heuristics";
import {
  applyEngineAction,
  createInitialGameState,
  SYSTEM_ACTOR,
  type ActorId,
  type EngineAction,
  type EngineResult,
  type LegalAction,
  type SeatId,
  type StandardRank,
  type TrickEntry
} from "@tichuml/engine";
import {
  LOCAL_SEAT,
  PASS_TARGETS,
  areAllExchangeSelectionsSubmitted,
  buildPlayVariantKey,
  collectLocalLegalCardIds,
  createRoundSeed,
  findMatchingPlayActions,
  getExchangeFlowState,
  getPassTargetSeat,
  getPrimaryActorFromResult,
  isExchangePhase,
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
  NormalGameTableView,
  describeAction,
  formatActorLabel,
  formatEvent,
  parseNormalTableLayoutConfigText,
  type NormalTableLayoutConfig,
  type NormalTableLayout,
  type NormalTableLayoutTokens,
  type SeatVisualPosition
} from "./game-table-views";
import defaultLayoutXml from "./layout.xml?raw";

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
}) {
  return (
    !config.autoplayLocal &&
    config.localHasOptionalAction &&
    !config.forceAiEndgameContinuation &&
    !config.openingLeadPending &&
    !config.exchangePhaseActive
  );
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

function collectStagedPassCardIds(
  selection?: Partial<Record<PassTarget, string>>
) {
  return new Set(
    PASS_TARGETS.map((target) => selection?.[target]).filter(
      (value): value is string => Boolean(value)
    )
  );
}

const INITIAL_NORMAL_TABLE_LAYOUT_CONFIG =
  parseNormalTableLayoutConfigText(defaultLayoutXml) ??
  DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG;

export function App() {
  const [seedIndex, setSeedIndex] = useState(INITIAL_SEED_INDEX);
  const [round, setRound] = useState<EngineResult>(() =>
    createInitialGameState(createRoundSeed(INITIAL_SEED_INDEX))
  );
  const [decisionCount, setDecisionCount] = useState(0);
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
    createInitialGameState(createRoundSeed(INITIAL_SEED_INDEX)).events.map(
      formatEvent
    )
  );
  const [sortMode, setSortMode] = useState<HandSortMode>("rank");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(
    null
  );
  const [selectedWishRank, setSelectedWishRank] = useState<StandardRank | null>(
    null
  );
  const [selectedPassTarget, setSelectedPassTarget] =
    useState<PassTarget>("left");
  const [passDraft, setPassDraft] = useState<
    Partial<Record<PassTarget, string>>
  >({});
  const [stagedTrick, setStagedTrick] = useState<
    EngineResult["derivedView"]["currentTrick"] | null
  >(null);
  const [normalTableLayout, setNormalTableLayout] = useState<NormalTableLayout>(
    () => INITIAL_NORMAL_TABLE_LAYOUT_CONFIG.elements
  );
  const [normalTableLayoutTokens, setNormalTableLayoutTokens] =
    useState<NormalTableLayoutTokens>(
      () => INITIAL_NORMAL_TABLE_LAYOUT_CONFIG.tokens
    );

  const state = round.nextState;
  const derived = round.derivedView;
  const primaryActor = getPrimaryActorFromResult(round);
  const roundSeed = createRoundSeed(seedIndex);
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
  const localLegalCardIds = collectLocalLegalCardIds(localActions);
  const matchingPlayActions = findMatchingPlayActions(
    localPlayActions,
    selectedCardIds
  );
  const activePlayVariant =
    matchingPlayActions.find(
      (action) => buildPlayVariantKey(action) === selectedVariantKey
    ) ??
    matchingPlayActions[0] ??
    null;
  const resolvedWishRank = activePlayVariant?.availableWishRanks?.includes(
    selectedWishRank ?? -1
  )
    ? selectedWishRank
    : (activePlayVariant?.availableWishRanks?.at(-1) ?? null);
  const localIsPrimaryActor = primaryActor === LOCAL_SEAT;
  const localHasOptionalAction =
    primaryActor !== LOCAL_SEAT && localActions.length > 0;
  const exchangePhaseActive = isExchangePhase(state.phase);
  const exchangeFlowState = getExchangeFlowState(state);
  const forceAiEndgameContinuation = shouldAllowAiEndgameContinuation(
    state,
    primaryActor
  );
  const openingLeadPending = isMandatoryOpeningLead(state, primaryActor);
  const localExchangeValidation = validateExchangeDraft(
    passDraft,
    localPassSelection?.availableCardIds ?? [],
    localPassSelection?.requiredTargets ?? PASS_TARGETS
  );
  const previousLocalExchangeReadyRef = useRef(localExchangeValidation.isValid);
  const localCanInteract =
    autoplayLocal ||
    localIsPrimaryActor ||
    Boolean(localPassSelection) ||
    (!exchangePhaseActive && localHasOptionalAction);
  const localActionSummary = localActions.map(describeAction);
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
    state.phase === "finished"
      ? "Round complete"
      : exchangePhaseActive
        ? localPassSelection
          ? "Select 3 cards and assign one to each destination"
          : exchangeFlowState === "exchange_waiting_for_ai"
            ? "Waiting for the other players to exchange"
            : exchangeFlowState === "exchange_resolving"
              ? "Resolving exchanges"
              : exchangeFlowState === "exchange_complete"
                ? "Exchange complete"
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
  const stagedSelectionBySeat = Object.fromEntries(
    SEAT_LAYOUT.map(({ seat }) => [
      seat,
      state.revealedPasses[seat] ??
        state.passSelections[seat] ??
        (seat === LOCAL_SEAT ? passDraft : undefined)
    ])
  ) as Record<SeatId, Partial<Record<PassTarget, string>> | undefined>;
  const visibleHandsBySeat = Object.fromEntries(
    SEAT_LAYOUT.map(({ seat }) => {
      const stagedCardIds =
        state.phase === "pass_select" ||
        state.phase === "pass_reveal" ||
        state.phase === "exchange_complete"
          ? collectStagedPassCardIds(stagedSelectionBySeat[seat])
          : new Set<string>();

      return [
        seat,
        state.hands[seat].filter((card) => !stagedCardIds.has(card.id))
      ];
    })
  ) as Record<SeatId, (typeof state.hands)[SeatId]>;
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
    const cardIds = PASS_TARGETS.map((target) => selection?.[target]).filter(
      (value): value is string => Boolean(value)
    );

    return { seat, position, label: title, cardIds };
  }).filter((group) => group.cardIds.length > 0);
  const passRouteViews =
    state.phase === "pass_select" ||
    state.phase === "pass_reveal" ||
    state.phase === "exchange_complete"
      ? SEAT_LAYOUT.flatMap(({ seat, position }) =>
          PASS_TARGETS.map((target) => {
            const targetSeat =
              getPassTargetSeat(seat, target);
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
              occupied: Boolean(stagedCardId),
              visibleCardId,
              faceDown: Boolean(stagedCardId) && !visibleCardId,
              interactive: seat === LOCAL_SEAT && state.phase === "pass_select"
            };
          })
        )
      : [];
  const passLaneViews = PASS_TARGETS.map((target) => ({
    target,
    targetSeat: getPassTargetSeat(LOCAL_SEAT, target),
    assignedCardId: passDraft[target] ?? null
  }));
  const normalActionRail = createNormalActionRail({
    phase: state.phase,
    nextEnabled: Boolean(localDeclineGrandTichuAction),
    grandTichuEnabled: Boolean(localGrandTichuAction),
    tichuEnabled: Boolean(localCallTichuAction),
    passEnabled: Boolean(localPassAction && localIsPrimaryActor),
    exchangeEnabled: passSelectionReady,
    pickupEnabled: Boolean(systemAdvanceAction),
    playEnabled: Boolean(activePlayVariant)
  });
  const executeUiHotkeyCommand = useEffectEvent((commandId: UiCommandId) => {
    executeUiCommand(commandId);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) {
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
  }, [activeDialog, executeUiHotkeyCommand, layoutEditorActive, mainMenuOpen]);

  useEffect(() => {
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
        exchangePhaseActive
      })
    ) {
      setThinkingActor(null);
      return;
    }

    const delay =
      primaryActor === SYSTEM_ACTOR ? SYSTEM_STEP_DELAY_MS : AI_STEP_DELAY_MS;
    setThinkingActor(primaryActor);

    const timeout = window.setTimeout(() => {
      const chosen = autoplayLocal
        ? heuristicsV1Policy.chooseAction({
            state: round.nextState,
            legalActions: round.legalActions
          })
        : heuristicsV1Policy.chooseAction({
            state: round.nextState,
            legalActions: createActorOnlyLegalActions(round, primaryActor)
          });

      let nextResult = applyEngineAction(round.nextState, chosen.action);
      let decisionDelta = 1;
      let recordedDecision: ChosenDecision | null =
        chosen.actor !== SYSTEM_ACTOR ? chosen : null;
      const nextEvents = [...nextResult.events];

      if (
        isMandatoryOpeningLead(round.nextState, primaryActor) &&
        isMandatoryOpeningLead(nextResult.nextState, primaryActor)
      ) {
        const playOnlyLegalActions = createActorPlayOnlyLegalActions(
          nextResult,
          primaryActor
        );

        if ((playOnlyLegalActions[primaryActor] ?? []).length > 0) {
          const forcedOpeningPlay = heuristicsV1Policy.chooseAction({
            state: nextResult.nextState,
            legalActions: playOnlyLegalActions
          });

          nextResult = applyEngineAction(
            nextResult.nextState,
            forcedOpeningPlay.action
          );
          nextEvents.push(...nextResult.events);
          decisionDelta += 1;
          recordedDecision =
            forcedOpeningPlay.actor !== SYSTEM_ACTOR
              ? forcedOpeningPlay
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
        if (recordedDecision) {
          setLastAiDecision(recordedDecision);
        }
        if (nextResult.nextState.phase !== "pass_select") {
          setPassDraft({});
          setSelectedPassTarget("left");
        }
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [
    autoplayLocal,
    exchangePhaseActive,
    forceAiEndgameContinuation,
    localHasOptionalAction,
    localIsPrimaryActor,
    openingLeadPending,
    primaryActor,
    round,
    state.phase
  ]);

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
    setPassDraft({});
    setSelectedPassTarget("left");
  }

  function applyClientAction(action: EngineAction, chosen?: ChosenDecision) {
    const nextResult = applyEngineAction(state, action);

    startTransition(() => {
      setRound(nextResult);
      setDecisionCount((current) => current + 1);
      setRecentEvents((current) =>
        [...current, ...nextResult.events.map(formatEvent)].slice(-14)
      );
      if (chosen && chosen.actor !== SYSTEM_ACTOR) {
        setLastAiDecision(chosen);
      }
      resetInteractionState();
    });
  }

  function startNextRound() {
    const nextSeedIndex = seedIndex + 1;
    const nextRound = createInitialGameState(createRoundSeed(nextSeedIndex));

    startTransition(() => {
      setSeedIndex(nextSeedIndex);
      setRound(nextRound);
      setDecisionCount(0);
      setThinkingActor(null);
      setLastAiDecision(null);
      setRecentEvents(nextRound.events.map(formatEvent));
      setSortMode("rank");
      setStagedTrick(null);
      resetInteractionState();
    });
  }

  function exportCurrentNormalTableLayout() {
    const payload = {
      version: DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG.version,
      surface: DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG.surface,
      elements: normalTableLayout,
      tokens: normalTableLayoutTokens
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
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
    switch (commandId) {
      case "new_game":
        closeActiveOverlay();
        startNextRound();
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
      case "open_hotkeys_dialog":
        setMainMenuOpen(false);
        setActiveDialog("hotkeys");
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
    if (!primaryActor || primaryActor === LOCAL_SEAT) {
      return;
    }

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: createActorOnlyLegalActions(round, primaryActor)
    });

    applyClientAction(chosen.action, chosen);
  }

  function playSelectedCards() {
    if (!activePlayVariant) {
      return;
    }

    applyClientAction({
      type: "play_cards",
      seat: LOCAL_SEAT,
      cardIds: activePlayVariant.cardIds,
      ...(activePlayVariant.phoenixAsRank !== undefined
        ? { phoenixAsRank: activePlayVariant.phoenixAsRank }
        : {}),
      ...(resolvedWishRank !== null ? { wishRank: resolvedWishRank } : {})
    });
  }

  function confirmPassSelection() {
    if (
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
    if (!localPassSelection) {
      return;
    }

    setPassDraft((current) => {
      if (current[target] === cardId) {
        setSelectedPassTarget(target);
        return current;
      }

      const nextDraft: Partial<Record<PassTarget, string>> = {};

      for (const draftTarget of PASS_TARGETS) {
        const existingCardId = current[draftTarget];
        if (
          !existingCardId ||
          existingCardId === cardId ||
          draftTarget === target
        ) {
          continue;
        }

        nextDraft[draftTarget] = existingCardId;
      }

      nextDraft[target] = cardId;
      const nextEmptyTarget = findNextEmptyPassTarget(nextDraft);
      setSelectedPassTarget(nextEmptyTarget ?? target);
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
        if (localCallTichuAction) {
          applyClientAction(localCallTichuAction);
        }
        break;
      case "pass":
        if (localPassAction && localIsPrimaryActor) {
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
        startNextRound();
        break;
    }
  }

  function handlePassLaneDrop(target: PassTarget, cardId: string) {
    assignPassCard(target, cardId);
  }

  function handleDragonRecipientSelect(recipient: SeatId) {
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
    tablePassGroups,
    passRouteViews,
    passLaneViews,
    sortedLocalHand,
    localCanInteract,
    localPassInteractionEnabled: Boolean(localPassSelection),
    localLegalCardIds,
    selectedCardIds,
    selectedPassTarget,
    passSelectionReady,
    matchingPlayActions,
    activePlayVariant,
    resolvedWishRank,
    normalActionRail,
    sortMode,
    autoplayLocal,
    lastAiDecision,
    recentEvents,
    localActionSummary,
    localSummaryText,
    canContinueAi: Boolean(primaryActor && primaryActor !== LOCAL_SEAT),
    localDragonRecipients: localDragonActions.map((action) => action.recipient),
    uiMode,
    normalTableLayout,
    normalTableLayoutTokens,
    layoutEditorActive,
    mainMenuOpen,
    activeDialog,
    hotkeyDefinitions: UI_HOTKEYS,
    cardLookup,
    onAutoplayChange: setAutoplayLocal,
    onContinueAi: continueWithAi,
    onSortModeChange: setSortMode,
    onLocalCardClick: handleLocalCardClick,
    onPassTargetSelect: setSelectedPassTarget,
    onPassLaneDrop: handlePassLaneDrop,
    onVariantSelect: setSelectedVariantKey,
    onWishRankSelect: setSelectedWishRank,
    onDragonRecipientSelect: handleDragonRecipientSelect,
    onNormalAction: handleNormalAction,
    onNormalTableLayoutChange: setNormalTableLayout,
    onNormalTableLayoutImport: handleNormalTableLayoutImport,
    onExportNormalTableLayout: exportCurrentNormalTableLayout,
    onUiCommand: executeUiCommand,
    onMainMenuOpenChange: setMainMenuOpen
  };

  return uiMode === "normal" ? (
    <NormalGameTableView {...viewProps} />
  ) : (
    <DebugGameTableView {...viewProps} />
  );
}
