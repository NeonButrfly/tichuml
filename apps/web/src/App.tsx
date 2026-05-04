import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState
} from "react";
import {
  buildServerFastPathState,
  buildHandEvaluation,
  buildHandEvaluationAfterRemovingCards,
  buildUrgencyProfile,
  type CandidateActionFeatureSnapshot,
  type ChosenDecision,
  type HandEvaluation,
  type PolicyTag
} from "@tichuml/ai-heuristics";
import {
  applyEngineAction,
  SEAT_IDS,
  createInitialGameState,
  getCanonicalActiveSeatFromState,
  getLegalActionOwner,
  getPartnerSeat,
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
  type DecisionScoringPath,
  type DecisionRequestPayload,
  type JsonObject,
  type RequestedDecisionProvider,
  type SeedDebugSnapshot,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  createUnknownBackendReachability,
  loadBackendSettings,
  persistBackendSettings,
  type BackendReachability
} from "./backend/settings";
import { resolveDecisionWithProvider } from "./backend/decision-provider";
import { emitDecisionTelemetry, emitEventTelemetry } from "./backend/telemetry";
import { postDecisionRequest, testBackendHealth } from "./backend/client";
import { isBackendRequestError } from "./backend/client";
import { SimControlDashboard } from "./SimControlDashboard";
import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION
} from "@tichuml/telemetry";
import {
  buildCollectionReadiness,
  buildHandMetricDelta,
  buildHandMetricSnapshot,
  buildPhaseTracking,
  buildProviderModeLabel,
  buildSeatDashboardRows,
  buildTelemetryCompleteness,
  buildUrgencyModeLabel,
  getTelemetryEventPhaseList,
  relationLabel,
  summarizeActionDescriptor,
  summarizeMlScores,
  type DashboardUiState,
  type EndpointDiagnostics,
  type ExchangePanelSnapshot,
  type MasterControlSnapshot,
  type TimelineEntry
} from "./master-control-model";

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

function createActorOnlyLegalActions(
  legalActions: LegalActionMap,
  actor: ActorId
) {
  const actorOnly = {} as LegalActionMap;
  actorOnly[actor] = legalActions[actor] ?? [];
  return actorOnly;
}

function isGrandTichuDecisionAction(
  action: LegalAction
): action is Extract<
  LegalAction,
  { type: "call_grand_tichu" | "decline_grand_tichu" }
> {
  return (
    action.type === "call_grand_tichu" || action.type === "decline_grand_tichu"
  );
}

function createGrandTichuDecisionLegalActions(
  legalActions: LegalActionMap,
  actorSeat: SeatId
) {
  const actorActions = legalActions[actorSeat] ?? [];
  const canCallGrandTichu = actorActions.some(
    (action) => action.type === "call_grand_tichu"
  );
  const gtActions: LegalAction[] = canCallGrandTichu
    ? [
        { type: "call_grand_tichu", seat: actorSeat },
        { type: "decline_grand_tichu", seat: actorSeat }
      ]
    : [{ type: "decline_grand_tichu", seat: actorSeat }];

  return {
    [actorSeat]: gtActions
  } as LegalActionMap;
}

function createRequiredPassSelectDecisionLegalActions(
  state: GameState,
  legalActions: LegalActionMap,
  actorSeat: SeatId
) {
  if (state.passSelections[actorSeat]) {
    return {
      [actorSeat]: []
    } as LegalActionMap;
  }

  const selectPassTemplate =
    (legalActions[actorSeat] ?? []).find(
      (
        action
      ): action is Extract<LegalAction, { type: "select_pass" }> =>
        action.type === "select_pass"
    ) ?? null;

  return {
    [actorSeat]: selectPassTemplate ? [selectPassTemplate] : []
  } as LegalActionMap;
}

function createDecisionRequestLegalActions(config: {
  state: GameState;
  legalActions: LegalActionMap;
  actor: ActorId;
}) {
  if (
    config.state.phase === "pass_select" &&
    config.actor !== SYSTEM_ACTOR
  ) {
    return createRequiredPassSelectDecisionLegalActions(
      config.state,
      config.legalActions,
      config.actor
    );
  }

  if (
    config.state.phase === "grand_tichu_window" &&
    config.actor !== SYSTEM_ACTOR
  ) {
    return createGrandTichuDecisionLegalActions(
      config.legalActions,
      config.actor
    );
  }

  return createActorOnlyLegalActions(config.legalActions, config.actor);
}

function isActorScopedRequiredPassSelection(config: {
  state: GameState;
  actorSeat: SeatId;
  actorActions: LegalAction[];
}) {
  return (
    config.state.phase === "pass_select" &&
    !config.state.passSelections[config.actorSeat] &&
    config.actorActions.length > 0 &&
    config.actorActions.every((action) => action.type === "select_pass")
  );
}

function createActorPlayOnlyLegalActions(
  legalActions: LegalActionMap,
  actor: SeatId
) {
  const actorOnly = createActorOnlyLegalActions(legalActions, actor);
  actorOnly[actor] = (actorOnly[actor] ?? []).filter(
    (action): action is PlayLegalAction => action.type === "play_cards"
  );
  return actorOnly;
}

function getCurrentHandId(state: GameState): string {
  return `hand-${state.matchHistory.length + 1}`;
}

function buildDecisionRequestStateNorm(config: {
  state: GameState;
  derived: EngineResult["derivedView"];
  actorSeat: SeatId;
  scoringPath: DecisionScoringPath;
}): Record<string, unknown> {
  return config.scoringPath === "fast_path"
    ? (buildServerFastPathState(
        config.state,
        config.actorSeat
      ) as unknown as Record<string, unknown>)
    : (config.derived as unknown as Record<string, unknown>);
}

function buildDecisionRequestPayload(config: {
  matchId: string;
  state: EngineResult["nextState"];
  derived: EngineResult["derivedView"];
  legalActions: LegalActionMap;
  actorSeat: SeatId;
  actor: ActorId;
  decisionIndex: number;
  requestedProvider: RequestedDecisionProvider;
}): DecisionRequestPayload {
  const actorScopedLegalActions = createDecisionRequestLegalActions({
    state: config.state,
    legalActions: config.legalActions,
    actor: config.actor
  });
  const actorActions = Array.isArray(actorScopedLegalActions[config.actor])
    ? actorScopedLegalActions[config.actor]
    : [];
  const legalActionPreview = actorActions
    .slice(0, 4)
    .map((action) => buildAutomationActionSignature(action));
  const isGrandTichuWindow =
    config.state.phase === "grand_tichu_window" && config.actor !== SYSTEM_ACTOR;
  const isPassSelectDecision =
    config.state.phase === "pass_select" && config.actor !== SYSTEM_ACTOR;
  const scopeIssues: string[] = [];
  let scoringPath: DecisionScoringPath = "rich_path";
  let fastPathUsed = false;
  let validationResult:
    | "scoped"
    | "pass_select_required_only"
    | "pass_select_invalid_actions"
    | "grand_tichu_only"
    | "grand_tichu_invalid_actions"
    | "rich_path_provider"
    | "system_actor"
    | "canonical_actor_mismatch"
    | "invalid_action_owner"
    | "missing_actor_actions"
    | "canonical_actor_unavailable" = "rich_path_provider";

  if (config.requestedProvider === "server_heuristic") {
    if (config.actor === SYSTEM_ACTOR) {
      validationResult = "system_actor";
    } else if (actorActions.length === 0) {
      validationResult = "missing_actor_actions";
      scopeIssues.push(`No legal actions found for ${config.actorSeat}.`);
    } else {
      let canonicalActorSeat: SeatId | null = null;
      if (isPassSelectDecision) {
        if (
          !isActorScopedRequiredPassSelection({
            state: config.state,
            actorSeat: config.actorSeat,
            actorActions
          })
        ) {
          validationResult = "pass_select_invalid_actions";
          scopeIssues.push(
            `Pass selection requests must contain only unresolved select_pass actions for ${config.actorSeat}.`
          );
        }
      } else {
        try {
          canonicalActorSeat = getCanonicalActiveSeatFromState(config.state);
        } catch (error) {
          validationResult = "canonical_actor_unavailable";
          scopeIssues.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (
        !isPassSelectDecision &&
        canonicalActorSeat !== null &&
        canonicalActorSeat !== config.actorSeat
      ) {
        validationResult = "canonical_actor_mismatch";
        scopeIssues.push(
          `Canonical actor ${canonicalActorSeat} does not match request actor ${config.actorSeat}.`
        );
      }

      for (const action of actorActions) {
        const owner = getLegalActionOwner(action);
        if (owner !== null && owner !== config.actorSeat) {
          validationResult = "invalid_action_owner";
          scopeIssues.push(
            `Action ${action.type} belongs to ${owner}; expected ${config.actorSeat}.`
          );
        }
      }

      if (isGrandTichuWindow) {
        const invalidGrandTichuActions = actorActions.filter(
          (action) => !isGrandTichuDecisionAction(action)
        );
        const hasDeclineAction = actorActions.some(
          (action) => action.type === "decline_grand_tichu"
        );
        if (invalidGrandTichuActions.length > 0 || !hasDeclineAction) {
          validationResult = "grand_tichu_invalid_actions";
          scopeIssues.push(
            `Grand Tichu requests must contain only call_grand_tichu/decline_grand_tichu for ${config.actorSeat}.`
          );
        }
      }

      if (scopeIssues.length === 0) {
        scoringPath = "fast_path";
        fastPathUsed = true;
        validationResult = isGrandTichuWindow
          ? "grand_tichu_only"
          : isPassSelectDecision
            ? "pass_select_required_only"
            : "scoped";
      }
    }
  }

  console.info("[decision-request]", {
    phase: config.state.phase,
    actor_seat: config.actorSeat,
    decision_actor: config.actor,
    legal_action_count: actorActions.length,
    legal_action_preview: legalActionPreview,
    fast_path_used: fastPathUsed,
    scoring_path: scoringPath,
    validation_result: validationResult,
    validation_issues: scopeIssues,
    ...((isGrandTichuWindow || isPassSelectDecision)
      ? { legal_actions: actorActions }
      : {})
  });

  return {
    game_id: config.matchId,
    hand_id: getCurrentHandId(config.state),
    phase: config.state.phase,
    actor_seat: config.actorSeat,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    state_raw: config.state as unknown as Record<string, unknown>,
    state_norm: buildDecisionRequestStateNorm({
      state: config.state,
      derived: config.derived,
      actorSeat: config.actorSeat,
      scoringPath
    }),
    legal_actions: (fastPathUsed
      ? actorActions
      : actorScopedLegalActions) as unknown as Record<string, unknown>,
    requested_provider: config.requestedProvider,
    metadata: {
      decision_index: config.decisionIndex,
      scoring_path: scoringPath,
      fast_path_validation: validationResult,
      ...(scopeIssues.length > 0
        ? {
            fast_path_fallback_reason: scopeIssues.join(" | ")
          }
        : {})
    }
  };
}

function buildTelemetryActionMetadata(
  action: EngineAction,
  state: EngineResult["nextState"],
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  const selectedCards =
    action.type === "play_cards"
      ? action.cardIds
      : action.type === "select_pass"
        ? [action.left, action.partner, action.right]
        : [];

  return {
    action_type: action.type,
    selected_cards: selectedCards,
    state_raw: state as unknown as Record<string, unknown>,
    ...extras
  };
}

type AutomationRequestStatus = "idle" | "scheduled" | "running";

type SuccessfulTransitionSnapshot = {
  phase: GameState["phase"];
  actor: ActorId;
  actionType: EngineAction["type"];
  nextPhase: GameState["phase"];
  nextActiveSeat: SeatId | null;
  grandTichuQueue: SeatId[];
};

function buildAutomationActionSignature(action: EngineAction | LegalAction): string {
  switch (action.type) {
    case "play_cards":
      return [
        action.type,
        action.seat,
        action.cardIds.join(","),
        String(action.phoenixAsRank ?? "none")
      ].join("|");
    case "select_pass":
      return [
        action.type,
        action.seat,
        "availableCardIds" in action
          ? action.availableCardIds.join(",")
          : [action.left, action.partner, action.right].join(",")
      ].join("|");
    case "assign_dragon_trick":
      return [action.type, action.seat, action.recipient].join("|");
    case "advance_phase":
      return `${action.type}|${action.actor}`;
    case "call_grand_tichu":
    case "decline_grand_tichu":
    case "call_tichu":
    case "pass_turn":
      return `${action.type}|${action.seat}`;
    default:
      return action.type;
  }
}

function getActionActor(action: EngineAction | LegalAction): ActorId {
  if ("seat" in action) {
    return action.seat;
  }

  if ("actor" in action) {
    return action.actor;
  }

  return SYSTEM_ACTOR;
}

function buildAutomationExecutionKey(config: {
  requestKey: string | null;
  state: GameState;
  action: EngineAction | LegalAction;
}): string {
  return JSON.stringify({
    requestKey: config.requestKey,
    seed: config.state.seed,
    hand: getCurrentHandId(config.state),
    phase: config.state.phase,
    activeSeat: config.state.activeSeat,
    grandTichuQueue: config.state.grandTichuQueue,
    action: buildAutomationActionSignature(config.action)
  });
}

function logPhaseTransition(
  event: string,
  payload: Record<string, unknown>
): void {
  console.info("[phase-transition]", {
    ts: new Date().toISOString(),
    event,
    ...payload
  });
}

function buildAutomationRequestKey(config: {
  result: EngineResult;
  primaryActor: ActorId;
  autoplayLocal: boolean;
  settings: BackendRuntimeSettings;
}): string {
  const state = config.result.nextState;
  const actorActions =
    config.primaryActor === SYSTEM_ACTOR
      ? {
          [SYSTEM_ACTOR]: config.result.legalActions[SYSTEM_ACTOR] ?? []
        }
      : state.phase === "pass_select"
        ? createDecisionRequestLegalActions({
            state,
            legalActions: config.result.legalActions,
            actor: config.primaryActor
          })
        : config.autoplayLocal && config.primaryActor === LOCAL_SEAT
          ? config.result.legalActions
          : {
          [config.primaryActor]:
            config.result.legalActions[config.primaryActor] ?? []
          };

  return JSON.stringify({
    phase: state.phase,
    activeSeat: state.activeSeat,
    primaryActor: config.primaryActor,
    grandTichuQueue: state.grandTichuQueue,
    passSelectionSeats: Object.keys(state.passSelections).sort(),
    pendingDragonGift: state.pendingDragonGift
      ? {
          winner: state.pendingDragonGift.winner,
          nextLeader: state.pendingDragonGift.nextLeader,
          roundEndsAfterGift: state.pendingDragonGift.roundEndsAfterGift
        }
      : null,
    currentTrick: state.currentTrick
      ? {
          leader: state.currentTrick.leader,
          currentWinner: state.currentTrick.currentWinner,
          combination: state.currentTrick.currentCombination.key,
          entryCount: state.currentTrick.entries.length,
          passingSeats: state.currentTrick.passingSeats
        }
      : null,
    legalActions: Object.fromEntries(
      Object.entries(actorActions).map(([actor, actions]) => [
        actor,
        (actions ?? []).map(buildAutomationActionSignature)
      ])
    ),
    autoplayLocal: config.autoplayLocal,
    decisionMode: config.settings.decisionMode,
    serverFallbackEnabled: config.settings.serverFallbackEnabled,
    backendBaseUrl: config.settings.backendBaseUrl
  });
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

type DecisionDiagnosticsState = {
  requestedProvider: RequestedDecisionProvider | "local";
  providerUsed: "local_heuristic" | RequestedDecisionProvider | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  latencyMs: number | null;
  lastResolutionAt: string | null;
  lastRequestPayload: DecisionRequestPayload | null;
  lastResponseMetadata: JsonObject | null;
  lastChosenAction: EngineAction | null;
  lastLegalActions: EngineResult["legalActions"] | null;
  lastEndpointError: string | null;
  lastSuccessfulTransition: SuccessfulTransitionSnapshot | null;
};

type TelemetryDiagnosticsState = {
  lastWriteAt: string | null;
  lastRecordedPhase: string | null;
  lastDecisionIndex: number | null;
  lastDecisionPayload: TelemetryDecisionPayload | null;
  lastEventPayload: TelemetryEventPayload | null;
  phaseHistory: string[];
  lastError: string | null;
  lastTelemetryIds: number[];
  payloadValid: boolean;
  decisionPayloadValid: boolean;
};

type MlDiagnosticsState = {
  modelLoaded: boolean | null;
  modelName: string | null;
  inferenceWorking: boolean | null;
  inferenceLatencyMs: number | null;
  candidatesScoredCount: number;
  scoreSpread: {
    max: number | null;
    min: number | null;
    chosen: number | null;
    gapToSecond: number | null;
  };
  lastError: string | null;
};

type EndpointKey = "health" | "decision" | "telemetry";

function createInitialEndpointDiagnostics(): Record<EndpointKey, EndpointDiagnostics> {
  return {
    health: {
      name: "/health",
      reachable: null,
      payloadValid: null,
      latencyMs: null,
      lastStatus: null,
      lastError: null,
      checkedAt: null,
      lastSuccessAt: null,
      lastValidationFailureReason: null
    },
    decision: {
      name: "/api/decision/request",
      reachable: null,
      payloadValid: null,
      latencyMs: null,
      lastStatus: null,
      lastError: null,
      checkedAt: null,
      lastSuccessAt: null,
      lastValidationFailureReason: null
    },
    telemetry: {
      name: "/api/telemetry/event",
      reachable: null,
      payloadValid: null,
      latencyMs: null,
      lastStatus: null,
      lastError: null,
      checkedAt: null,
      lastSuccessAt: null,
      lastValidationFailureReason: null
    }
  };
}

function createInitialDecisionDiagnostics(): DecisionDiagnosticsState {
  return {
    requestedProvider: "local",
    providerUsed: null,
    fallbackUsed: false,
    fallbackReason: null,
    latencyMs: null,
    lastResolutionAt: null,
    lastRequestPayload: null,
    lastResponseMetadata: null,
    lastChosenAction: null,
    lastLegalActions: null,
    lastEndpointError: null,
    lastSuccessfulTransition: null
  };
}

function createInitialTelemetryDiagnostics(): TelemetryDiagnosticsState {
  return {
    lastWriteAt: null,
    lastRecordedPhase: null,
    lastDecisionIndex: null,
    lastDecisionPayload: null,
    lastEventPayload: null,
    phaseHistory: [],
    lastError: null,
    lastTelemetryIds: [],
    payloadValid: false,
    decisionPayloadValid: false
  };
}

function createInitialMlDiagnostics(): MlDiagnosticsState {
  return {
    modelLoaded: null,
    modelName: null,
    inferenceWorking: null,
    inferenceLatencyMs: null,
    candidatesScoredCount: 0,
    scoreSpread: {
      max: null,
      min: null,
      chosen: null,
      gapToSecond: null
    },
    lastError: null
  };
}

function createTimelineEntry(
  kind: TimelineEntry["kind"],
  tone: TimelineEntry["tone"],
  title: string,
  detail: string
): TimelineEntry {
  const ts = new Date().toISOString();
  return {
    id: `${kind}-${ts}-${title.replace(/\s+/g, "-").toLowerCase()}`,
    ts,
    kind,
    tone,
    title,
    detail
  };
}

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
  if (
    typeof window !== "undefined" &&
    (window.location.pathname === "/admin/sim" ||
      window.location.pathname === "/sim/control")
  ) {
    return <SimControlDashboard />;
  }

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
  const [endpointDiagnostics, setEndpointDiagnostics] = useState<
    Record<EndpointKey, EndpointDiagnostics>
  >(createInitialEndpointDiagnostics);
  const [decisionDiagnostics, setDecisionDiagnostics] =
    useState<DecisionDiagnosticsState>(createInitialDecisionDiagnostics);
  const [telemetryDiagnostics, setTelemetryDiagnostics] =
    useState<TelemetryDiagnosticsState>(createInitialTelemetryDiagnostics);
  const [mlDiagnostics, setMlDiagnostics] = useState<MlDiagnosticsState>(
    createInitialMlDiagnostics
  );
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [dashboardUi, setDashboardUi] = useState<DashboardUiState>({
    verboseMode: false,
    rawJsonVisible: false,
    frozen: false,
    frozenAt: null
  });
  const [frozenSnapshot, setFrozenSnapshot] = useState<MasterControlSnapshot | null>(
    null
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
  const automationRequestRef = useRef<{
    key: string | null;
    sequence: number;
    actor: ActorId | null;
    phase: GameState["phase"] | null;
    status: AutomationRequestStatus;
    requestedAt: string | null;
  }>({
    key: null,
    sequence: 0,
    actor: null,
    phase: null,
    status: "idle",
    requestedAt: null
  });
  const lastAppliedAutomationExecutionKeyRef = useRef<string | null>(null);

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
  const automationRequestKey = primaryActor
    ? buildAutomationRequestKey({
        result: round,
        primaryActor,
        autoplayLocal,
        settings: backendSettings
      })
    : null;
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
  const manualNextRetryEnabled =
    !roundGenerationPending &&
    state.phase === "grand_tichu_window" &&
    decisionDiagnostics.lastEndpointError !== null;
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
              : decisionDiagnostics.lastEndpointError
                ? state.phase === "grand_tichu_window" &&
                    manualNextRetryEnabled
                  ? `Auto-advance failed: ${decisionDiagnostics.lastEndpointError}. Click Next to retry.`
                  : `Auto-advance failed: ${decisionDiagnostics.lastEndpointError}`
                : localHasOptionalAction && !forceAiEndgameContinuation
                  ? "Interrupt available"
                  : thinkingActor
                    ? `${formatActorLabel(thinkingActor)} thinking`
                    : "Auto-advancing";

  const cardLookup = new Map(state.shuffledDeck.map((card) => [card.id, card]));
  const seatEvaluations = useMemo(
    () =>
      Object.fromEntries(
        SEAT_IDS.map((seat) => [seat, buildHandEvaluation(state, seat)])
      ) as Record<SeatId, HandEvaluation>,
    [state]
  );
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
    nextEnabled:
      !roundGenerationPending &&
      (Boolean(localDeclineGrandTichuAction) || manualNextRetryEnabled),
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
  const activeInspectorSeat: SeatId =
    state.activeSeat && state.activeSeat !== SYSTEM_ACTOR
      ? state.activeSeat
      : LOCAL_SEAT;
  const activeInspectorEvaluation = seatEvaluations[activeInspectorSeat];
  const activeUrgency = buildUrgencyProfile(state, activeInspectorSeat);
  const chosenActionDescriptor = decisionDiagnostics.lastChosenAction
    ? summarizeActionDescriptor(
        decisionDiagnostics.lastChosenAction,
        decisionDiagnostics.lastLegalActions ?? round.legalActions,
        state.currentWish
      )
    : null;
  const chosenActionAfterEvaluation =
    decisionDiagnostics.lastChosenAction?.type === "play_cards" &&
    "seat" in decisionDiagnostics.lastChosenAction
      ? buildHandEvaluationAfterRemovingCards(
          state,
          decisionDiagnostics.lastChosenAction.seat,
          decisionDiagnostics.lastChosenAction.cardIds
        )
      : null;
  const liveMasterControlSnapshot = useMemo<MasterControlSnapshot>(() => {
    const requestPayload = decisionDiagnostics.lastRequestPayload;
    const responseMetadata = decisionDiagnostics.lastResponseMetadata;
    const lastExplanation = lastAiDecision?.explanation;
    const candidateSource =
      lastExplanation?.candidateScores.length
        ? lastExplanation.candidateScores.slice(0, 8).map((candidate) => ({
            action: candidate.action,
            score: candidate.score,
            reasons: candidate.reasons,
            tags: candidate.tags,
            teamplay: candidate.teamplay,
            features: candidate.features
          }))
        : Array.isArray(responseMetadata?.scores)
          ? (responseMetadata.scores as Array<Record<string, unknown>>)
              .slice(0, 8)
              .map((entry) => ({
                action: entry.action as EngineAction,
                score:
                  typeof entry.score === "number" ? entry.score : 0,
                reasons: ["backend model ranking"],
                tags: [] as PolicyTag[],
                teamplay: undefined,
                features: undefined as CandidateActionFeatureSnapshot | undefined
              }))
          : [];
    const selectedFeatures =
      lastExplanation?.selectedFeatures ??
      ((responseMetadata?.explanation as { selectedFeatures?: CandidateActionFeatureSnapshot } | undefined)
        ?.selectedFeatures ?? null);

    const topCandidates = candidateSource.map((candidate) => {
      const descriptor = summarizeActionDescriptor(
        candidate.action,
        decisionDiagnostics.lastLegalActions ?? round.legalActions,
        state.currentWish
      );
      const tags = candidate.tags ?? [];
      return {
        ...descriptor,
        score: Number(candidate.score.toFixed(2)),
        scoreBreakdown: candidate.reasons,
        reasonTags: tags,
        overtakesPartner:
          candidate.features?.overtakes_partner ??
          (tags.includes("YIELD_TO_PARTNER") === false &&
            Boolean(candidate.teamplay?.partnerCurrentControl)),
        controlRetaining:
          candidate.features
            ? candidate.features.control_retention_estimate >= 60
            : tags.includes("TEMPO_WIN") ||
              tags.includes("CONTROL_LEAD") ||
              Boolean(candidate.teamplay?.partnerCurrentControl),
        endgameOriented:
          candidate.features
            ? candidate.features.urgency_mode === "endgame" ||
              candidate.features.endgame_pressure >= 70
            : tags.includes("ENDGAME_COMMIT") ||
              tags.includes("SELF_NEAR_OUT") ||
              tags.includes("OPPONENT_STOP"),
        teamplay: candidate.teamplay
      };
    });

    const telemetryCompleteness = buildTelemetryCompleteness(
      telemetryDiagnostics.lastDecisionPayload
    );
    const phaseList = getTelemetryEventPhaseList(
      telemetryDiagnostics.lastDecisionPayload,
      telemetryDiagnostics.lastEventPayload,
      telemetryDiagnostics.phaseHistory
    );
    const phaseTracking = buildPhaseTracking(phaseList);
    const exchangeRecorded =
      phaseTracking.passSelect && phaseTracking.exchange && phaseTracking.pickup;
    const backendReachable =
      endpointDiagnostics.health.reachable === true ||
      endpointDiagnostics.decision.reachable === true ||
      endpointDiagnostics.telemetry.reachable === true;
    const telemetryHealthy =
      backendSettings.telemetryEnabled &&
      telemetryDiagnostics.lastError === null &&
      telemetryDiagnostics.lastWriteAt !== null;
    const collectionReadiness = buildCollectionReadiness({
      telemetryEnabled: backendSettings.telemetryEnabled,
      telemetryHealthy,
      backendReachable,
      decisionPayloadValid: endpointDiagnostics.decision.payloadValid === true,
      telemetryPayloadValid: telemetryDiagnostics.payloadValid,
      exchangeRecorded,
      completeness: telemetryCompleteness
    });
    const handBefore = buildHandMetricSnapshot(
      activeInspectorEvaluation,
      state.hands[activeInspectorSeat].length
    );
    const handAfter = chosenActionAfterEvaluation
      ? buildHandMetricSnapshot(
          chosenActionAfterEvaluation,
          Math.max(
            0,
            state.hands[activeInspectorSeat].length -
              (chosenActionDescriptor?.length ?? 0)
          )
        )
      : null;
    const handDelta = buildHandMetricDelta(
      activeInspectorEvaluation,
      chosenActionAfterEvaluation
    );
    const seatRows = buildSeatDashboardRows({
      seats: [...SEAT_IDS],
      localSeat: LOCAL_SEAT,
      activeSeat: state.activeSeat,
      currentWinner: state.currentTrick?.currentWinner ?? null,
      handCounts: derived.handCounts,
      evaluations: seatEvaluations,
      calls: derived.calls
    });
    const tichuCalls = SEAT_IDS.filter((seat) => derived.calls[seat].smallTichu).map(
      (seat) => seat
    );
    const grandTichuCalls = SEAT_IDS.filter(
      (seat) => derived.calls[seat].grandTichu
    ).map((seat) => seat);
    const requestActorSeat =
      requestPayload?.actor_seat && requestPayload.actor_seat !== SYSTEM_ACTOR
        ? (requestPayload.actor_seat as SeatId)
        : activeInspectorSeat;
    const pendingRequest =
      automationRequestRef.current.key === null
        ? null
        : {
            key: automationRequestRef.current.key,
            actor: automationRequestRef.current.actor,
            phase: automationRequestRef.current.phase,
            status: automationRequestRef.current.status,
            requestedAt: automationRequestRef.current.requestedAt
          };
    const partnerSeat = getPartnerSeat(requestActorSeat);
    const partnerAdvantage = Number(
      (
        (seatEvaluations[partnerSeat]?.finishPlanScore ?? 0) -
        (state.hands[partnerSeat].length / 2)
      ).toFixed(2)
    );
    const exchangePanel: ExchangePanelSnapshot = {
      state: exchangeFlowState,
      direction: "left / partner / right",
      pickupStatus: pickupPending ? "Pending pickup" : "Not pending",
      telemetryEmitted: exchangeRecorded,
      backendRecorded: telemetryDiagnostics.lastTelemetryIds.length > 0,
      selectedBySeat: SEAT_IDS.map((seat) => {
        const selection = stagedSelectionBySeat[seat];
        const cards = pickupPending
          ? exchangeRenderModel.receivedPendingPickupBySeat[seat]
          : PASS_TARGETS.map((target) => selection?.[target]).filter(
              (value): value is string => Boolean(value)
            );
        return {
          seat,
          label: relationLabel(LOCAL_SEAT, seat),
          cards
        };
      })
    };

    return {
      generatedAt: new Date().toISOString(),
      ui: dashboardUi,
      game: {
        gameId: matchId,
        handId,
        decisionIndex: decisionCount,
        phase: state.phase,
        activeSeat: state.activeSeat,
        wishState:
          state.currentWish === null ? "No active wish" : String(state.currentWish),
        tichuCalls,
        grandTichuCalls,
        exchangeState: exchangeFlowState,
        pickupState: pickupPending ? "pending" : "not pending",
        trick: {
          comboType: state.currentTrick?.currentCombination.kind ?? "none",
          rank:
            state.currentTrick?.currentCombination.primaryRank !== undefined
              ? String(state.currentTrick.currentCombination.primaryRank)
              : null,
          cards: state.currentTrick?.currentCombination.cardIds ?? [],
          currentLeader: state.currentTrick?.currentWinner ?? null
        },
        seats: seatRows
      },
      decision: {
        requestedProvider: backendSettings.decisionMode,
        actualProviderUsed: decisionDiagnostics.providerUsed,
        fallbackUsed: decisionDiagnostics.fallbackUsed,
        fallbackReason: decisionDiagnostics.fallbackReason,
        latencyMs: decisionDiagnostics.latencyMs,
        lastEndpointError: decisionDiagnostics.lastEndpointError,
        legalActionCount: requestPayload
          ? Array.isArray(requestPayload.legal_actions)
            ? requestPayload.legal_actions.length
            : Array.isArray(
                  (requestPayload.legal_actions as Record<string, unknown>)[
                    requestActorSeat
                  ]
                )
              ? (
                  (requestPayload.legal_actions as Record<string, LegalAction[]>)[
                    requestActorSeat
                  ] ?? []
                ).length
              : 0
          : 0,
        pendingRequestState: pendingRequest?.status ?? "idle",
        pendingRequestActor: pendingRequest?.actor ?? null,
        pendingRequestPhase: pendingRequest?.phase ?? null,
        chosenAction: chosenActionDescriptor,
        topCandidates,
        urgencyMode: selectedFeatures
          ? selectedFeatures.urgency_mode.replaceAll("_", " ")
          : buildUrgencyModeLabel(activeUrgency),
        handQualityScore: selectedFeatures
          ? selectedFeatures.state.hand_quality_score
          : Number(activeInspectorEvaluation.finishPlanScore.toFixed(2)),
        controlRetentionEstimate: selectedFeatures
          ? selectedFeatures.control_retention_estimate
          : Number(activeInspectorEvaluation.controlCount.toFixed(2)),
        structurePreservation: selectedFeatures
          ? selectedFeatures.structure_preservation_score
          : Number(
              (
                activeInspectorEvaluation.synergyScore -
                activeInspectorEvaluation.fragmentation
              ).toFixed(2)
            ),
        endgamePressure: selectedFeatures
          ? selectedFeatures.endgame_pressure
          : Number(
              (
                (activeUrgency.opponentOutUrgent ? 2 : 0) +
                (activeUrgency.selfNearOut ? 2 : 0) +
                (activeUrgency.partnerNearOut ? 1 : 0)
              ).toFixed(2)
            ),
        partnerAdvantage: selectedFeatures
          ? selectedFeatures.partner_advantage_estimate
          : partnerAdvantage,
        lookahead: selectedFeatures
          ? {
              futureHandQualityDelta: selectedFeatures.future_hand_quality_delta,
              controlRetentionDelta: selectedFeatures.control_retention_estimate,
              deadSinglesDelta: selectedFeatures.dead_singles_reduction,
              comboPreservationImpact:
                (selectedFeatures.combo_count_after ?? selectedFeatures.combo_count_before) -
                selectedFeatures.combo_count_before
            }
          : handDelta,
        reasonTags:
          lastExplanation?.selectedTags ??
          ((responseMetadata?.explanation as { selectedTags?: PolicyTag[] } | undefined)
            ?.selectedTags ?? []),
        lastSuccessfulTransition: decisionDiagnostics.lastSuccessfulTransition
          ? {
              phase: decisionDiagnostics.lastSuccessfulTransition.phase,
              actor: decisionDiagnostics.lastSuccessfulTransition.actor,
              actionType:
                decisionDiagnostics.lastSuccessfulTransition.actionType,
              nextPhase:
                decisionDiagnostics.lastSuccessfulTransition.nextPhase,
              nextActiveSeat:
                decisionDiagnostics.lastSuccessfulTransition.nextActiveSeat,
              grandTichuQueue: [
                ...decisionDiagnostics.lastSuccessfulTransition.grandTichuQueue
              ]
            }
          : null,
        requestedProviderLabel: buildProviderModeLabel(backendSettings.decisionMode)
      },
      telemetry: {
        enabled: backendSettings.telemetryEnabled,
        healthy: telemetryHealthy,
        payloadValid: telemetryDiagnostics.payloadValid,
        decisionPayloadValid: endpointDiagnostics.decision.payloadValid === true,
        lastWriteAt: telemetryDiagnostics.lastWriteAt,
        lastRecordedPhase: telemetryDiagnostics.lastRecordedPhase,
        lastDecisionIndex: telemetryDiagnostics.lastDecisionIndex,
        completeness: telemetryCompleteness,
        phaseTracking,
        exchangeRecorded,
        collectionReadiness,
        lastError: telemetryDiagnostics.lastError
      },
      backendMl: {
        backendUrl: backendSettings.backendBaseUrl,
        backendReachable:
          backendReachable ? true : backendStatus.state === "unreachable" ? false : null,
        backendLatencyMs: endpointDiagnostics.health.latencyMs,
        backendLastError:
          endpointDiagnostics.health.lastError ?? backendStatus.detail,
        endpoints: Object.values(endpointDiagnostics),
        modelLoaded: mlDiagnostics.modelLoaded,
        modelName: mlDiagnostics.modelName,
        inferenceWorking: mlDiagnostics.inferenceWorking,
        inferenceLatencyMs: mlDiagnostics.inferenceLatencyMs,
        candidatesScoredCount: mlDiagnostics.candidatesScoredCount,
        scoreSpread: mlDiagnostics.scoreSpread,
        lastError: mlDiagnostics.lastError
      },
      exchange: exchangePanel,
      handInspector: {
        seat: requestActorSeat,
        before: handBefore,
        after: handAfter,
        delta: handDelta
      },
      timeline,
      raw: {
        stateRaw: (requestPayload?.state_raw as JsonObject | null) ?? null,
        legalActions: requestPayload?.legal_actions ?? null,
        chosenAction:
          (decisionDiagnostics.lastChosenAction as unknown as JsonObject | null) ??
          null,
        telemetryPayload:
          (telemetryDiagnostics.lastDecisionPayload as unknown as JsonObject | null) ??
          (telemetryDiagnostics.lastEventPayload as unknown as JsonObject | null) ??
          null,
        backendResponse:
          responseMetadata ||
          pendingRequest ||
          decisionDiagnostics.lastSuccessfulTransition ||
          decisionDiagnostics.lastEndpointError
            ? ({
                ...(responseMetadata ?? {}),
                pendingRequest,
                lastSuccessfulTransition:
                  decisionDiagnostics.lastSuccessfulTransition,
                lastEndpointError: decisionDiagnostics.lastEndpointError
              } as JsonObject)
            : null
      }
    };
  }, [
    activeInspectorEvaluation,
    activeInspectorSeat,
    activeUrgency,
    backendSettings,
    backendStatus.state,
    backendStatus.detail,
    chosenActionAfterEvaluation,
    chosenActionDescriptor,
    decisionCount,
    decisionDiagnostics,
    derived.calls,
    derived.handCounts,
    dashboardUi,
    endpointDiagnostics,
    exchangeFlowState,
    exchangeRenderModel.receivedPendingPickupBySeat,
    handId,
    lastAiDecision,
    matchId,
    mlDiagnostics,
    pickupPending,
    round.legalActions,
    seatEvaluations,
    stagedSelectionBySeat,
    state,
    telemetryDiagnostics,
    timeline
  ]);
  const masterControlSnapshot =
    dashboardUi.frozen && frozenSnapshot
      ? {
          ...frozenSnapshot,
          ui: dashboardUi
        }
      : liveMasterControlSnapshot;
  const executeUiHotkeyCommand = useEffectEvent((commandId: UiCommandId) => {
    executeUiCommand(commandId);
  });

  useEffect(() => {
    persistBackendSettings(backendSettings);
  }, [backendSettings]);

  const pushTimeline = useEffectEvent((entry: TimelineEntry) => {
    setTimeline((current) => [...current, entry].slice(-20));
  });

  const updateEndpointDiagnostics = useEffectEvent(
    (
      key: EndpointKey,
      next: Partial<Omit<EndpointDiagnostics, "name">>
    ) => {
      setEndpointDiagnostics((current) => ({
        ...current,
        [key]: {
          ...current[key],
          ...next
        }
      }));
    }
  );

  const recordTelemetryFailure = useEffectEvent((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const reachable = isBackendRequestError(error) ? error.reachable : false;
    const payloadValid = isBackendRequestError(error)
      ? error.kind === "validation" || error.kind === "client_validation"
        ? false
        : null
      : null;
    const validationReason = isBackendRequestError(error)
      ? error.validationErrors?.map((issue) => `${issue.path}: ${issue.message}`).join("; ") ??
        (error.kind === "validation" || error.kind === "client_validation"
          ? detail
          : null)
      : null;
    setTelemetryDiagnostics((current) => ({
      ...current,
      lastError: detail,
      payloadValid:
        payloadValid === false ? false : current.payloadValid
    }));
    updateEndpointDiagnostics("telemetry", {
      reachable,
      payloadValid,
      lastStatus:
        isBackendRequestError(error) &&
        (error.kind === "validation" || error.kind === "client_validation")
          ? "validation error"
          : "error",
      lastError: detail,
      checkedAt: new Date().toISOString(),
      lastValidationFailureReason: validationReason
    });
    pushTimeline(
      createTimelineEntry(
        "telemetry",
        reachable === false ? "red" : "yellow",
        "Telemetry failed",
        validationReason ?? detail
      )
    );
  });

  const recordTelemetryDecision = useEffectEvent(
    (
      payload: TelemetryDecisionPayload,
      telemetryId: number | null
    ) => {
      setTelemetryDiagnostics((current) => ({
        ...current,
        lastWriteAt: payload.ts,
        lastRecordedPhase: payload.phase,
        lastDecisionIndex: payload.decision_index,
        lastDecisionPayload: payload,
        phaseHistory: [...new Set([...current.phaseHistory, payload.phase])].slice(-16),
        lastError: null,
        decisionPayloadValid: true,
        lastTelemetryIds:
          telemetryId === null
            ? current.lastTelemetryIds
            : [...current.lastTelemetryIds, telemetryId].slice(-16)
      }));
      pushTimeline(
        createTimelineEntry(
          "telemetry",
          "green",
          "Decision telemetry",
          `${payload.phase} • index ${payload.decision_index}`
        )
      );
    }
  );

  const recordTelemetryEvent = useEffectEvent(
    (payload: TelemetryEventPayload, telemetryIds: number[]) => {
      setTelemetryDiagnostics((current) => ({
        ...current,
        lastWriteAt: payload.ts,
        lastRecordedPhase: payload.phase,
        lastEventPayload: payload,
        phaseHistory: [...new Set([...current.phaseHistory, payload.phase])].slice(-16),
        lastError: null,
        payloadValid: true,
        lastTelemetryIds: [...current.lastTelemetryIds, ...telemetryIds].slice(-16)
      }));
      updateEndpointDiagnostics("telemetry", {
        reachable: true,
        payloadValid: true,
        lastStatus: "event recorded",
        lastError: null,
        checkedAt: payload.ts,
        lastSuccessAt: payload.ts,
        lastValidationFailureReason: null
      });
      pushTimeline(
        createTimelineEntry(
          "telemetry",
          "green",
          "Event telemetry",
          `${payload.phase} • ${payload.event_type}`
        )
      );
    }
  );

  const resetAutomationRequest = useEffectEvent(() => {
    if (
      automationRequestRef.current.key === null &&
      automationRequestRef.current.actor === null &&
      automationRequestRef.current.phase === null &&
      automationRequestRef.current.status === "idle" &&
      automationRequestRef.current.requestedAt === null
    ) {
      return;
    }

    automationRequestRef.current = {
      ...automationRequestRef.current,
      key: null,
      actor: null,
      phase: null,
      status: "idle",
      requestedAt: null
    };
  });

  const handleBackendSettingsChange = useEffectEvent(
    (nextSettings: BackendRuntimeSettings) => {
      setBackendSettings(nextSettings);
      setBackendStatus(createUnknownBackendReachability());
      setFrozenSnapshot(null);
      lastAppliedAutomationExecutionKeyRef.current = null;
      resetAutomationRequest();
      setThinkingActor(null);
    }
  );

  const recordDecisionResolution = useEffectEvent(
    (config: {
      requestPayload: DecisionRequestPayload;
      legalActions: EngineResult["legalActions"];
      resolution: Awaited<ReturnType<typeof resolveDecisionWithProvider>>;
    }) => {
      setDecisionDiagnostics((current) => ({
        ...current,
        requestedProvider: config.resolution.requestedProvider,
        providerUsed: config.resolution.providerUsed,
        fallbackUsed: config.resolution.usedFallback,
        fallbackReason: config.resolution.usedFallback
          ? config.resolution.providerReason
          : null,
        latencyMs: Number(config.resolution.latencyMs.toFixed(1)),
        lastResolutionAt: new Date().toISOString(),
        lastRequestPayload: config.requestPayload,
        lastResponseMetadata: config.resolution.responseMetadata,
        lastChosenAction: config.resolution.chosen.action,
        lastLegalActions: config.legalActions,
        lastEndpointError: config.resolution.endpointError
      }));

      updateEndpointDiagnostics("decision", {
        reachable: config.resolution.endpointReachable,
        payloadValid:
          config.resolution.endpointStatus === "ok"
            ? true
            : config.resolution.endpointStatus === "validation_error" ||
                config.resolution.endpointStatus === "client_validation_error"
              ? false
              : null,
        latencyMs: Number(config.resolution.latencyMs.toFixed(1)),
        lastStatus:
          config.resolution.endpointStatus === "ok"
            ? config.resolution.providerUsed
            : config.resolution.endpointStatus.replaceAll("_", " "),
        lastError: config.resolution.endpointError,
        checkedAt: new Date().toISOString(),
        lastSuccessAt:
          config.resolution.endpointStatus === "ok"
            ? new Date().toISOString()
            : null,
        lastValidationFailureReason:
          config.resolution.validationErrors?.map(
            (issue) => `${issue.path}: ${issue.message}`
          ).join("; ") ??
          (config.resolution.endpointStatus === "validation_error" ||
          config.resolution.endpointStatus === "client_validation_error"
            ? config.resolution.endpointError
            : null)
      });

      const modelMetadata = config.resolution.responseMetadata?.model_metadata;
      const scoreEntries = Array.isArray(config.resolution.responseMetadata?.scores)
        ? (config.resolution.responseMetadata?.scores as Array<{ score?: number | null }>)
        : [];
      const summarizedScores = summarizeMlScores(scoreEntries);
      const modelName =
        typeof modelMetadata === "object" &&
        modelMetadata !== null &&
        typeof (modelMetadata as Record<string, unknown>).model_path === "string"
          ? String((modelMetadata as Record<string, unknown>).model_path)
              .split(/[\\/]/)
              .slice(-1)[0] ?? "lightgbm_action_model.txt"
          : null;

      setMlDiagnostics((current) => ({
        modelLoaded:
          config.resolution.providerUsed === "lightgbm_model"
            ? true
            : current.modelLoaded,
        modelName:
          config.resolution.providerUsed === "lightgbm_model"
            ? modelName ?? current.modelName
            : current.modelName,
        inferenceWorking:
          config.resolution.providerUsed === "lightgbm_model"
            ? !config.resolution.usedFallback
            : current.inferenceWorking,
        inferenceLatencyMs:
          config.resolution.providerUsed === "lightgbm_model"
            ? Number(config.resolution.latencyMs.toFixed(1))
            : current.inferenceLatencyMs,
        candidatesScoredCount:
          config.resolution.providerUsed === "lightgbm_model"
            ? summarizedScores.candidateCount
            : current.candidatesScoredCount,
        scoreSpread:
          config.resolution.providerUsed === "lightgbm_model"
            ? {
                max: summarizedScores.max,
                min: summarizedScores.min,
                chosen: summarizedScores.chosen,
                gapToSecond: summarizedScores.gapToSecond
              }
            : current.scoreSpread,
        lastError:
          config.resolution.providerUsed === "lightgbm_model" &&
          config.resolution.usedFallback
            ? config.resolution.providerReason
            : current.lastError
      }));

      pushTimeline(
        createTimelineEntry(
          config.resolution.usedFallback ? "fallback" : "provider",
          config.resolution.usedFallback ? "yellow" : "green",
          config.resolution.usedFallback
            ? "Provider fallback"
            : "Decision resolved",
          `${buildProviderModeLabel(
            config.resolution.requestedProvider === "local"
              ? "local"
              : config.resolution.requestedProvider
          )} -> ${config.resolution.providerUsed}`
        )
      );
    }
  );

  const testBackendConnection = useEffectEvent(async () => {
    const startedAt = performance.now();
    setBackendStatus({
      state: "checking",
      detail: "Checking server health and database reachability.",
      checkedAt: null
    });
    updateEndpointDiagnostics("health", {
      reachable: null,
      payloadValid: null,
      latencyMs: null,
      lastStatus: "checking",
      lastError: null,
      checkedAt: null,
      lastSuccessAt: null,
      lastValidationFailureReason: null
    });

    try {
      const result = await testBackendHealth(backendSettings.backendBaseUrl);
      const latencyMs = Number((performance.now() - startedAt).toFixed(1));
      setBackendStatus({
        state: "reachable",
        detail: result.database
          ? `Health endpoint responded successfully and database reported '${result.database}'.`
          : "Health endpoint responded successfully.",
        checkedAt: new Date().toISOString()
      });
      updateEndpointDiagnostics("health", {
        reachable: true,
        payloadValid: true,
        latencyMs,
        lastStatus: "ok",
        lastError: null,
        checkedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastValidationFailureReason: null
      });
      pushTimeline(
        createTimelineEntry(
          "backend",
          "green",
          "Backend reachable",
          `Health check passed in ${latencyMs} ms`
        )
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Backend health check failed.";
      setBackendStatus({
        state: "unreachable",
        detail,
        checkedAt: new Date().toISOString()
      });
      updateEndpointDiagnostics("health", {
        reachable: false,
        payloadValid: null,
        latencyMs: Number((performance.now() - startedAt).toFixed(1)),
        lastStatus: "error",
        lastError: detail,
        checkedAt: new Date().toISOString(),
        lastSuccessAt: null,
        lastValidationFailureReason: null
      });
      pushTimeline(
        createTimelineEntry("backend", "red", "Backend unreachable", detail)
      );
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
    const clearAutomationState = () => {
      resetAutomationRequest();
      setThinkingActor(null);
    };

    if (roundGenerationPending) {
      clearAutomationState();
      return;
    }

    if (state.phase === "finished") {
      clearAutomationState();
      return;
    }

    if (!primaryActor) {
      clearAutomationState();
      return;
    }

    if (!autoplayLocal && localIsPrimaryActor) {
      clearAutomationState();
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
      clearAutomationState();
      return;
    }

    if (!automationRequestKey) {
      clearAutomationState();
      return;
    }

    if (
      automationRequestRef.current.key === automationRequestKey &&
      automationRequestRef.current.status !== "idle"
    ) {
      if (automationRequestRef.current.status === "running") {
        setThinkingActor(primaryActor);
      }
      return;
    }

    const delay =
      primaryActor === SYSTEM_ACTOR ? SYSTEM_STEP_DELAY_MS : AI_STEP_DELAY_MS;
    const sequence = automationRequestRef.current.sequence + 1;
    const requestedAt = new Date().toISOString();
    automationRequestRef.current = {
      key: automationRequestKey,
      sequence,
      actor: primaryActor,
      phase: state.phase,
      status: "scheduled",
      requestedAt
    };
    let cancelled = false;

    const isCurrentAutomationRequest = () =>
      !cancelled &&
      automationRequestRef.current.key === automationRequestKey &&
      automationRequestRef.current.sequence === sequence;

    const timeout = window.setTimeout(() => {
      void (async () => {
        if (!isCurrentAutomationRequest()) {
          return;
        }

        automationRequestRef.current = {
          ...automationRequestRef.current,
          status: "running"
        };
        setThinkingActor(primaryActor);

        const legalActions =
          primaryActor === SYSTEM_ACTOR
            ? round.legalActions
            : createDecisionRequestLegalActions({
                state: round.nextState,
                legalActions: round.legalActions,
                actor: primaryActor
              });
        const requestPayload =
          primaryActor === SYSTEM_ACTOR
            ? buildDecisionRequestPayload({
                matchId,
                state: round.nextState,
                derived: round.derivedView,
                legalActions,
                actorSeat: LOCAL_SEAT,
                actor: primaryActor,
                decisionIndex: decisionCount,
                requestedProvider:
                  backendSettings.decisionMode === "lightgbm_model"
                    ? "lightgbm_model"
                    : "server_heuristic"
              })
            : buildDecisionRequestPayload({
                matchId,
                state: round.nextState,
                derived: round.derivedView,
                legalActions,
                actorSeat: primaryActor,
                actor: primaryActor,
                decisionIndex: decisionCount,
                requestedProvider:
                  backendSettings.decisionMode === "lightgbm_model"
                    ? "lightgbm_model"
                    : "server_heuristic"
              });
        const initialResolution = await resolveDecisionWithProvider({
          context: {
            state: round.nextState,
            legalActions
          },
          actor: primaryActor,
          settings: backendSettings,
          requestPayload
        });
        if (!isCurrentAutomationRequest()) {
          return;
        }
        recordDecisionResolution({
          requestPayload,
          legalActions,
          resolution: initialResolution
        });
        logPhaseTransition("backend_decision_resolved", {
          currentPhase: round.nextState.phase,
          requestedNextPhase:
            typeof initialResolution.responseMetadata?.predicted_next_phase ===
            "string"
              ? initialResolution.responseMetadata.predicted_next_phase
              : null,
          actor: primaryActor,
          actionType: initialResolution.chosen.action.type,
          chosenGrandTichuAction:
            round.nextState.phase === "grand_tichu_window"
              ? initialResolution.chosen.action.type
              : null,
          backendResponsePhase:
            typeof initialResolution.responseMetadata?.response_phase ===
            "string"
              ? initialResolution.responseMetadata.response_phase
              : requestPayload.phase,
          frontendAppliedPhase: null,
          providerUsed: initialResolution.providerUsed
        });

        setBackendStatus((current) => ({
          state:
            initialResolution.endpointReachable === true
              ? "reachable"
              : initialResolution.endpointReachable === false
                ? "unreachable"
                : current.state,
          detail: initialResolution.providerReason,
          checkedAt: new Date().toISOString()
        }));

        if (!initialResolution.handledByServerTelemetry) {
          await emitDecisionTelemetry({
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
          })
            .then((result) => {
              if (result) {
                recordTelemetryDecision(result.payload, result.telemetryId);
              }
            })
            .catch((error) => {
                recordTelemetryFailure(error);
              });
        }

        if (!isCurrentAutomationRequest()) {
          return;
        }

        const initialExecutionKey = buildAutomationExecutionKey({
          requestKey: automationRequestKey,
          state: round.nextState,
          action: initialResolution.chosen.action
        });
        if (
          lastAppliedAutomationExecutionKeyRef.current === initialExecutionKey
        ) {
          logPhaseTransition("duplicate_automation_suppressed", {
            currentPhase: round.nextState.phase,
            requestedNextPhase: null,
            actor: primaryActor,
            actionType: initialResolution.chosen.action.type,
            backendResponsePhase:
              typeof initialResolution.responseMetadata?.response_phase ===
              "string"
                ? initialResolution.responseMetadata.response_phase
                : requestPayload.phase,
            frontendAppliedPhase: null
          });
          resetAutomationRequest();
          setThinkingActor(null);
          return;
        }

        let nextResult: EngineResult;
        try {
          nextResult = applyEngineAction(
            round.nextState,
            initialResolution.chosen.action
          );
        } catch (error) {
          logPhaseTransition("frontend_apply_failed", {
            currentPhase: round.nextState.phase,
            requestedNextPhase: null,
            actor: primaryActor,
            actionType: initialResolution.chosen.action.type,
            backendResponsePhase:
              typeof initialResolution.responseMetadata?.response_phase ===
              "string"
                ? initialResolution.responseMetadata.response_phase
                : requestPayload.phase,
            frontendAppliedPhase: null,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
        lastAppliedAutomationExecutionKeyRef.current = initialExecutionKey;
        logPhaseTransition("frontend_transition_applied", {
          currentPhase: round.nextState.phase,
          requestedNextPhase: nextResult.nextState.phase,
          actor: primaryActor,
          actionType: initialResolution.chosen.action.type,
          chosenGrandTichuAction:
            round.nextState.phase === "grand_tichu_window"
              ? initialResolution.chosen.action.type
              : null,
          backendResponsePhase:
            typeof initialResolution.responseMetadata?.response_phase ===
            "string"
              ? initialResolution.responseMetadata.response_phase
              : requestPayload.phase,
          frontendAppliedPhase: nextResult.nextState.phase,
          nextActiveSeat: nextResult.nextState.activeSeat,
          grandTichuQueue: [...nextResult.nextState.grandTichuQueue],
          nextGrandTichuActor: nextResult.nextState.grandTichuQueue[0] ?? null
        });
        await emitEventTelemetry({
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
            ...buildTelemetryActionMetadata(
              initialResolution.chosen.action,
              round.nextState,
              {
                provider_used: initialResolution.providerUsed
              }
            )
          }
        })
          .then((result) => {
            const latestPayload = result?.payloads.at(-1);
            if (result && latestPayload) {
              recordTelemetryEvent(latestPayload, result.telemetryIds);
            }
          })
          .catch((error) => {
            recordTelemetryFailure(error);
          });

        let decisionDelta = 1;
        let recordedDecision: ChosenDecision | null =
          initialResolution.chosen.actor !== SYSTEM_ACTOR
            ? initialResolution.chosen
            : null;
        let lastAppliedAction = initialResolution.chosen.action;
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
            nextResult.legalActions,
            primaryActor
          );

          if ((playOnlyLegalActions[primaryActor] ?? []).length > 0) {
            const forcedRequestPayload = buildDecisionRequestPayload({
              matchId,
                state: nextResult.nextState,
                derived: nextResult.derivedView,
                legalActions: playOnlyLegalActions,
                actorSeat: primaryActor,
                actor: primaryActor,
                decisionIndex: decisionCount + 1,
                requestedProvider:
                  backendSettings.decisionMode === "lightgbm_model"
                  ? "lightgbm_model"
                  : "server_heuristic"
            });
            const forcedResolution = await resolveDecisionWithProvider({
              context: {
                state: nextResult.nextState,
                legalActions: playOnlyLegalActions
              },
              actor: primaryActor,
              settings: backendSettings,
                requestPayload: forcedRequestPayload
              });
            if (!isCurrentAutomationRequest()) {
              return;
            }
            recordDecisionResolution({
              requestPayload: forcedRequestPayload,
              legalActions: playOnlyLegalActions,
              resolution: forcedResolution
            });

            if (!forcedResolution.handledByServerTelemetry) {
              await emitDecisionTelemetry({
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
              })
                .then((result) => {
                  if (result) {
                    recordTelemetryDecision(result.payload, result.telemetryId);
                  }
                })
                .catch((error) => {
                  recordTelemetryFailure(error);
                });
            }

            if (!isCurrentAutomationRequest()) {
              return;
            }

            nextResult = applyEngineAction(
              nextResult.nextState,
              forcedResolution.chosen.action
            );
            await emitEventTelemetry({
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
                ...buildTelemetryActionMetadata(
                  forcedResolution.chosen.action,
                  nextResult.nextState,
                  {
                    provider_used: forcedResolution.providerUsed,
                    forced_opening_play: true
                  }
                )
              }
            })
              .then((result) => {
                const latestPayload = result?.payloads.at(-1);
                if (result && latestPayload) {
                  recordTelemetryEvent(latestPayload, result.telemetryIds);
                }
              })
              .catch((error) => {
                recordTelemetryFailure(error);
              });
            nextEvents.push(...nextResult.events);
            decisionDelta += 1;
            lastAppliedAction = forcedResolution.chosen.action;
            dogAnimation =
              getDogLeadAnimationView(forcedResolution.chosen.action, nextResult) ??
              dogAnimation;
            recordedDecision =
              forcedResolution.chosen.actor !== SYSTEM_ACTOR
                ? forcedResolution.chosen
                : recordedDecision;
          }
        }

        if (!isCurrentAutomationRequest()) {
          return;
        }

        if (initialResolution.chosen.action.type === "select_pass") {
          resetAutomationRequest();
        }

        startTransition(() => {
          setRound(nextResult);
          setDecisionCount((current) => current + decisionDelta);
          setThinkingActor(null);
          setDecisionDiagnostics((current) => ({
            ...current,
            lastSuccessfulTransition: {
              phase: round.nextState.phase,
              actor: primaryActor,
              actionType: lastAppliedAction.type,
              nextPhase: nextResult.nextState.phase,
              nextActiveSeat: nextResult.nextState.activeSeat,
              grandTichuQueue: [...nextResult.nextState.grandTichuQueue]
            },
            lastEndpointError: null
          }));
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
        if (!isCurrentAutomationRequest()) {
          return;
        }

        const reachable = isBackendRequestError(error) ? error.reachable : false;
        const detail =
          error instanceof Error ? error.message : "Decision provider failed.";
        console.error("[decision-provider] failed to resolve automated action", {
          error: error instanceof Error ? error.message : String(error),
          actor: primaryActor,
          phase: round.nextState.phase
        });
        resetAutomationRequest();
        setThinkingActor(null);
        setDecisionDiagnostics((current) => ({
          ...current,
          lastEndpointError: detail
        }));
        setBackendStatus({
          state: reachable === true ? "reachable" : "unreachable",
          detail,
          checkedAt: new Date().toISOString()
        });
        logPhaseTransition("frontend_apply_failed", {
          currentPhase: round.nextState.phase,
          requestedNextPhase: null,
          actor: primaryActor,
          actionType: null,
          backendResponsePhase:
            decisionDiagnostics.lastRequestPayload?.phase ?? round.nextState.phase,
          frontendAppliedPhase: null,
          error: detail
        });
      });
    }, delay);

    return () => {
      const sameRequestStillCurrent =
        automationRequestRef.current.key === automationRequestKey &&
        automationRequestRef.current.sequence === sequence &&
        automationRequestRef.current.status !== "idle";
      if (sameRequestStillCurrent) {
        return;
      }

      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    autoplayLocal,
    automationRequestKey,
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
    resetAutomationRequest,
    recordDecisionResolution,
    recordTelemetryDecision,
    recordTelemetryEvent,
    recordTelemetryFailure,
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

    if (previousPhase !== state.phase) {
      logPhaseTransition("frontend_phase_changed", {
        currentPhase: previousPhase,
        requestedNextPhase: state.phase,
        actor: primaryActor,
        actionType:
          decisionDiagnostics.lastSuccessfulTransition?.actionType ?? null,
        backendResponsePhase:
          decisionDiagnostics.lastRequestPayload?.phase ??
          decisionDiagnostics.lastSuccessfulTransition?.phase ??
          previousPhase,
        frontendAppliedPhase: state.phase,
        activeSeat: state.activeSeat,
        grandTichuQueue: [...state.grandTichuQueue]
      });
      pushTimeline(
        createTimelineEntry(
          "phase",
          "green",
          "Phase changed",
          `${previousPhase} -> ${state.phase}`
        )
      );
    }

    previousPhaseRef.current = state.phase;
  }, [
    decisionDiagnostics.lastRequestPayload?.phase,
    decisionDiagnostics.lastSuccessfulTransition?.actionType,
    decisionDiagnostics.lastSuccessfulTransition?.phase,
    exchangePhaseActive,
    primaryActor,
    pushTimeline,
    state.activeSeat,
    state.grandTichuQueue,
    state.phase
  ]);

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
        pushTimeline(
          createTimelineEntry(
            "exchange",
            "green",
            "Exchange ready",
            "All four seats submitted exchange selections."
          )
        );
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
        pushTimeline(
          createTimelineEntry(
            "exchange",
            "green",
            "Exchange complete",
            "Pickup review state is active."
          )
        );
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
    pushTimeline,
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
    options?: {
      skipDecisionTelemetry?: boolean;
      trigger?: "ui" | "manual_fallback";
    }
  ) {
    if (roundGenerationPending) {
      return;
    }

    resetAutomationRequest();

    if (!options?.skipDecisionTelemetry) {
      void emitDecisionTelemetry({
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
      })
        .then((result) => {
          if (result) {
            recordTelemetryDecision(result.payload, result.telemetryId);
          }
        })
        .catch((error) => {
          recordTelemetryFailure(error);
        });
    }

    const nextResult = applyEngineAction(state, action);
    logPhaseTransition("frontend_transition_applied", {
      currentPhase: state.phase,
      requestedNextPhase: nextResult.nextState.phase,
      actor: chosen?.actor ?? getActionActor(action),
      actionType: action.type,
      chosenGrandTichuAction:
        state.phase === "grand_tichu_window" ? action.type : null,
      backendResponsePhase:
        options?.trigger === "manual_fallback"
          ? decisionDiagnostics.lastRequestPayload?.phase ?? state.phase
          : null,
      frontendAppliedPhase: nextResult.nextState.phase,
      nextActiveSeat: nextResult.nextState.activeSeat,
      grandTichuQueue: [...nextResult.nextState.grandTichuQueue],
      nextGrandTichuActor: nextResult.nextState.grandTichuQueue[0] ?? null,
      trigger: options?.trigger ?? "ui"
    });
    const dogAnimation = getDogLeadAnimationView(action, nextResult);
    void emitEventTelemetry({
      settings: backendSettings,
      events: nextResult.events,
      phase: state.phase,
      actorSeat:
        "seat" in action ? action.seat : "actor" in action ? action.actor : null,
      gameId: matchId,
      handId,
      metadata: {
        ...buildTelemetryActionMetadata(action, state)
      }
    })
      .then((result) => {
        const latestPayload = result?.payloads.at(-1);
        if (result && latestPayload) {
          recordTelemetryEvent(latestPayload, result.telemetryIds);
        }
      })
      .catch((error) => {
        recordTelemetryFailure(error);
      });

    startTransition(() => {
      setRound(nextResult);
      setDecisionCount((current) => current + 1);
      setThinkingActor(null);
      setRecentEvents((current) =>
        [...current, ...nextResult.events.map(formatEvent)].slice(-14)
      );
      setDecisionDiagnostics((current) =>
        ({
          ...current,
          ...(chosen
            ? {
                providerUsed: "local_heuristic" as const,
                requestedProvider: "local" as const,
                lastChosenAction: chosen.action
              }
            : {
                lastChosenAction: action
              }),
          lastResolutionAt: new Date().toISOString(),
          lastLegalActions: round.legalActions,
          lastEndpointError: null,
          lastSuccessfulTransition: {
            phase: round.nextState.phase,
            actor:
              chosen?.actor ??
              ("seat" in action ? action.seat : "actor" in action ? action.actor : SYSTEM_ACTOR),
            actionType: action.type,
            nextPhase: nextResult.nextState.phase,
            nextActiveSeat: nextResult.nextState.activeSeat,
            grandTichuQueue: [...nextResult.nextState.grandTichuQueue]
          }
        })
      );
      if (chosen && chosen.actor !== SYSTEM_ACTOR) {
        setLastAiDecision(chosen);
      }
      if (dogAnimation) {
        setDogLeadAnimation(dogAnimation);
      }
      resetInteractionState();
    });
    pushTimeline(
      createTimelineEntry(
        "decision",
        "green",
        chosen ? "Client decision" : "UI action",
        `${state.phase} • ${action.type}`
      )
    );
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
          setDecisionDiagnostics(createInitialDecisionDiagnostics());
          setTelemetryDiagnostics(createInitialTelemetryDiagnostics());
          setMlDiagnostics(createInitialMlDiagnostics());
          setTimeline([]);
          setFrozenSnapshot(null);
          setDashboardUi((current) => ({
            ...current,
            frozen: false,
            frozenAt: null
          }));
          setSortMode("rank");
          setStagedTrick(null);
          setDogLeadAnimation(null);
          lastAppliedAutomationExecutionKeyRef.current = null;
          resetInteractionState();
          resetAutomationRequest();
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

    if (
      automationRequestKey &&
      automationRequestRef.current.key === automationRequestKey &&
      automationRequestRef.current.status !== "idle"
    ) {
      logPhaseTransition("manual_retry_suppressed", {
        currentPhase: state.phase,
        requestedNextPhase: null,
        actor: primaryActor,
        actionType: null,
        backendResponsePhase:
          decisionDiagnostics.lastRequestPayload?.phase ?? state.phase,
        frontendAppliedPhase: null
      });
      return;
    }

    resetAutomationRequest();
    setThinkingActor(primaryActor);

    const legalActions = createDecisionRequestLegalActions({
      state,
      legalActions: round.legalActions,
      actor: primaryActor
    });
    const requestPayload =
      primaryActor === SYSTEM_ACTOR
        ? buildDecisionRequestPayload({
            matchId,
              state,
              derived,
              legalActions,
              actorSeat: LOCAL_SEAT,
              actor: primaryActor,
              decisionIndex: decisionCount,
              requestedProvider:
                backendSettings.decisionMode === "lightgbm_model"
                ? "lightgbm_model"
                : "server_heuristic"
          })
        : buildDecisionRequestPayload({
            matchId,
              state,
              derived,
              legalActions,
              actorSeat: primaryActor,
              actor: primaryActor,
              decisionIndex: decisionCount,
              requestedProvider:
                backendSettings.decisionMode === "lightgbm_model"
                ? "lightgbm_model"
                : "server_heuristic"
          });
    void resolveDecisionWithProvider({
      context: {
        state,
        legalActions
      },
      actor: primaryActor,
      settings: backendSettings,
      requestPayload
    })
      .then((resolution) => {
        recordDecisionResolution({
          requestPayload,
          legalActions,
          resolution
        });
        logPhaseTransition("backend_decision_resolved", {
          currentPhase: state.phase,
          requestedNextPhase:
            typeof resolution.responseMetadata?.predicted_next_phase ===
            "string"
              ? resolution.responseMetadata.predicted_next_phase
              : null,
          actor: primaryActor,
          actionType: resolution.chosen.action.type,
          chosenGrandTichuAction:
            state.phase === "grand_tichu_window"
              ? resolution.chosen.action.type
              : null,
          backendResponsePhase:
            typeof resolution.responseMetadata?.response_phase === "string"
              ? resolution.responseMetadata.response_phase
              : requestPayload.phase,
          frontendAppliedPhase: null,
          providerUsed: resolution.providerUsed,
          trigger: "manual_fallback"
        });
        setBackendStatus({
          state:
            resolution.endpointReachable === true
              ? "reachable"
              : resolution.endpointReachable === false
                ? "unreachable"
                : "unknown",
          detail: resolution.providerReason,
          checkedAt: new Date().toISOString()
        });

        if (!resolution.handledByServerTelemetry) {
          void emitDecisionTelemetry({
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
          })
            .then((result) => {
              if (result) {
                recordTelemetryDecision(result.payload, result.telemetryId);
              }
            })
            .catch((error) => {
              recordTelemetryFailure(error);
            });
        }

        const executionKey = buildAutomationExecutionKey({
          requestKey: automationRequestKey,
          state,
          action: resolution.chosen.action
        });
        if (lastAppliedAutomationExecutionKeyRef.current === executionKey) {
          logPhaseTransition("duplicate_automation_suppressed", {
            currentPhase: state.phase,
            requestedNextPhase: null,
            actor: primaryActor,
            actionType: resolution.chosen.action.type,
            backendResponsePhase:
              typeof resolution.responseMetadata?.response_phase === "string"
                ? resolution.responseMetadata.response_phase
                : requestPayload.phase,
            frontendAppliedPhase: null,
            trigger: "manual_fallback"
          });
          setThinkingActor(null);
          return;
        }
        lastAppliedAutomationExecutionKeyRef.current = executionKey;
        applyClientAction(resolution.chosen.action, resolution.chosen, {
          skipDecisionTelemetry: true,
          trigger: "manual_fallback"
        });
      })
      .catch((error) => {
        const reachable = isBackendRequestError(error) ? error.reachable : false;
        const detail =
          error instanceof Error ? error.message : "Decision provider failed.";
        setBackendStatus({
          state: reachable === true ? "reachable" : "unreachable",
          detail,
          checkedAt: new Date().toISOString()
        });
        setThinkingActor(null);
        setDecisionDiagnostics((current) => ({
          ...current,
          lastEndpointError: detail
        }));
        logPhaseTransition("frontend_apply_failed", {
          currentPhase: state.phase,
          requestedNextPhase: null,
          actor: primaryActor,
          actionType: null,
          backendResponsePhase:
            decisionDiagnostics.lastRequestPayload?.phase ?? state.phase,
          frontendAppliedPhase: null,
          error: detail,
          trigger: "manual_fallback"
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
        } else if (manualNextRetryEnabled) {
          continueWithAi();
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

  function toggleDashboardVerboseMode() {
    setDashboardUi((current) => ({
      ...current,
      verboseMode: !current.verboseMode
    }));
  }

  function toggleDashboardRawJson() {
    setDashboardUi((current) => ({
      ...current,
      rawJsonVisible: !current.rawJsonVisible
    }));
  }

  function toggleFrozenSnapshot() {
    setDashboardUi((current) => {
      const nextFrozen = !current.frozen;
      if (nextFrozen) {
        setFrozenSnapshot(liveMasterControlSnapshot);
      } else {
        setFrozenSnapshot(null);
      }
      return {
        ...current,
        frozen: nextFrozen,
        frozenAt: nextFrozen ? new Date().toISOString() : null
      };
    });
  }

  async function testMlProvider() {
    if (!state.activeSeat) {
      setMlDiagnostics((current) => ({
        ...current,
        inferenceWorking: false,
        lastError:
          "ML test requires an active seat and a live backend decision surface."
      }));
      pushTimeline(
        createTimelineEntry(
          "ml",
          "yellow",
          "ML test skipped",
          "No active seat was available for a scored decision probe."
        )
      );
      return;
    }

    const actorSeat = state.activeSeat;
    const legalActions = createDecisionRequestLegalActions({
      state,
      legalActions: round.legalActions,
      actor: actorSeat
    });
    const requestPayload = buildDecisionRequestPayload({
      matchId,
        state,
        derived,
        legalActions,
        actorSeat,
        actor: actorSeat,
        decisionIndex: decisionCount,
        requestedProvider: "lightgbm_model"
      });
    const startedAt = performance.now();

    try {
      const response = await postDecisionRequest(
        backendSettings.backendBaseUrl,
        requestPayload
      );
      const latencyMs = Number((performance.now() - startedAt).toFixed(1));
      const scores = Array.isArray(response.metadata?.scores)
        ? (response.metadata?.scores as Array<{ score?: number | null }>)
        : [];
      const summarized = summarizeMlScores(scores);
      const modelMetadata = response.metadata?.model_metadata as
        | Record<string, unknown>
        | undefined;
      setMlDiagnostics({
        modelLoaded: response.provider_used === "lightgbm_model",
        modelName:
          typeof modelMetadata?.model_path === "string"
            ? String(modelMetadata.model_path).split(/[\\/]/).slice(-1)[0] ??
              "lightgbm_action_model.txt"
            : "lightgbm_action_model.txt",
        inferenceWorking: response.accepted,
        inferenceLatencyMs: latencyMs,
        candidatesScoredCount: summarized.candidateCount,
        scoreSpread: {
          max: summarized.max,
          min: summarized.min,
          chosen: summarized.chosen,
          gapToSecond: summarized.gapToSecond
        },
        lastError: null
      });
      updateEndpointDiagnostics("decision", {
        reachable: true,
        payloadValid: true,
        latencyMs,
        lastStatus: "ml test ok",
        lastError: null,
        checkedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastValidationFailureReason: null
      });
      pushTimeline(
        createTimelineEntry(
          "ml",
          "green",
          "ML inference",
          `Scored ${summarized.candidateCount} candidates in ${latencyMs} ms`
        )
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const reachable = isBackendRequestError(error) ? error.reachable : false;
      const validationReason = isBackendRequestError(error)
        ? error.validationErrors?.map((issue) => `${issue.path}: ${issue.message}`).join("; ") ??
          (error.kind === "validation" || error.kind === "client_validation"
            ? detail
            : null)
        : null;
      setMlDiagnostics((current) => ({
        ...current,
        inferenceWorking: false,
        lastError: detail
      }));
      updateEndpointDiagnostics("decision", {
        reachable,
        payloadValid:
          isBackendRequestError(error) &&
          (error.kind === "validation" || error.kind === "client_validation")
            ? false
            : null,
        latencyMs: Number((performance.now() - startedAt).toFixed(1)),
        lastStatus: "ml test failed",
        lastError: detail,
        checkedAt: new Date().toISOString(),
        lastSuccessAt: null,
        lastValidationFailureReason: validationReason
      });
      pushTimeline(
        createTimelineEntry(
          "ml",
          reachable === false ? "red" : "yellow",
          "ML inference failed",
          validationReason ?? detail
        )
      );
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
    masterControlSnapshot,
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
    onTestMl: () => {
      void testMlProvider();
    },
    onToggleDashboardVerboseMode: toggleDashboardVerboseMode,
    onToggleDashboardRawJson: toggleDashboardRawJson,
    onToggleFrozenSnapshot: toggleFrozenSnapshot,
    onUiCommand: executeUiCommand,
    onMainMenuOpenChange: setMainMenuOpen
  };

  return uiMode === "normal" ? (
    <NormalGameTableView {...viewProps} />
  ) : (
    <DebugGameTableView {...viewProps} />
  );
}
