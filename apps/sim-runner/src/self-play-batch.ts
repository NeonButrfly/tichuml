import {
  buildServerFastPathState,
  buildCanonicalDecisionRequest,
  heuristicsV1Policy,
  chooseServerFastPathDecision,
  generateFastTrickPlayCandidates,
  SERVER_HEURISTIC_FAST_PATH_LIMITS,
  type ChosenDecision
} from "@tichuml/ai-heuristics";
import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  buildTrainingGameId,
  getDecisionScoringPath,
  getOutcomeActorTeamForSeat,
  inferTelemetryFallbackUsed,
  normalizeBackendBaseUrl,
  normalizeOutcomeActorTeam,
  type DecisionScoringPath,
  type DecisionMode,
  type DecisionProviderUsed,
  type DecisionRequestPayload,
  type DecisionResponsePayload,
  type JsonObject,
  type TelemetryRuntimeState,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  applyEngineAction,
  createNextDealCarryState,
  createInitialGameState,
  getActorScopedLegalActions,
  getCardById,
  getCanonicalActiveSeatFromState,
  planMatchContinuation,
  resolveContinuationActor,
  getCardsPoints,
  SEAT_IDS,
  SYSTEM_ACTOR,
  validateLegalActionsForCanonicalActor,
  type Card,
  type Combination,
  type EngineAction,
  type EngineEvent,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type TeamId
} from "@tichuml/engine";
import {
  type TelemetryConfigInput,
  buildSelfPlayDecisionTelemetry,
  buildSelfPlayEventTelemetry,
  createTelemetryFailureStats,
  createTelemetryFailureTracker,
  emitTelemetryDecision,
  emitTelemetryEvent,
  emitTelemetryFailureDiagnostic,
  mergeTelemetryFailureStats,
  recordTelemetryFailure,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SIM_VERSION,
  type TelemetryFailureStats,
  type TelemetryWriteResult
} from "@tichuml/telemetry";
import {
  AsyncTelemetryManager,
  createDefaultTelemetryStorageRoot
} from "./telemetry/async-telemetry.js";

export type SeatProviderOverrides = Partial<Record<SeatId, DecisionMode>>;
export type TelemetryMode = "minimal" | "full";
export type SelfPlayStopReason =
  | "terminal_game_finished"
  | "waiting_for_local_input"
  | "no_legal_actions"
  | "invalid_state"
  | "backend_error"
  | "max_steps_guard";

export type SelfPlayBatchOptions = {
  games: number;
  baseSeed: string;
  defaultProvider: DecisionMode;
  gameIdPrefix?: string | undefined;
  runMetadata?: JsonObject | undefined;
  seatProviders?: SeatProviderOverrides;
  telemetryEnabled: boolean;
  serverFallbackEnabled?: boolean;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
  telemetryTimeoutMs?: number;
  telemetryRetryAttempts?: number;
  telemetryRetryDelayMs?: number;
  telemetryBackoffMs?: number;
  backendBaseUrl?: string;
  quiet?: boolean;
  progress?: boolean;
  maxDecisionsPerGame?: number;
  workerId?: string;
  controllerMode?: boolean;
  fullStateDecisionRequests?: boolean;
  telemetryStorageRoot?: string;
  onTelemetryRuntimeState?:
    | ((state: TelemetryRuntimeState) => void)
    | undefined;
};

export type SelfPlayGameResult = {
  gameId: string;
  handId: string;
  firstHandId: string;
  lastHandId: string;
  handsPlayed: number;
  decisions: number;
  events: number;
  durationMs: number;
  providerUsage: Record<string, number>;
  fallbackCount: number;
  decisionsByPhase: Record<string, number>;
  eventsByPhase: Record<string, number>;
  teamScores: Record<TeamId, number>;
  winningTeam: TeamId | "tie";
  handWinCountsByTeam: Record<TeamId | "tie", number>;
  doubleVictoryCountsByTeam: Record<TeamId, number>;
  tichuCalls: number;
  tichuSuccesses: number;
  grandTichuCalls: number;
  grandTichuSuccesses: number;
  matchComplete: boolean;
  matchWinner: TeamId | null;
  scoreMargin: number;
  passActions: number;
  playActions: number;
  bombPlays: number;
  wishSatisfiedPlays: number;
  wishActiveDecisions: number;
  invalidDecisions: number;
  telemetryDecisionFailures: number;
  telemetryEventFailures: number;
  telemetryFailuresTotal: number;
  telemetryFailureByEndpoint: Record<string, number>;
  telemetryFailureByKind: Record<string, number>;
  telemetryBackoffUntil: string | null;
  telemetryRuntime: TelemetryRuntimeState | null;
  stopReason: SelfPlayStopReason;
  stopDetails: JsonObject;
  lastPhase: string;
  lastActor: string | null;
  lastActionType: string | null;
  latencyByProvider: Record<
    string,
    { count: number; totalMs: number; averageMs: number }
  >;
};

export type SelfPlayBatchDetailedResult = {
  summary: SelfPlayBatchSummary;
  games: SelfPlayGameResult[];
};

export type SelfPlayBatchSummary = {
  gamesPlayed: number;
  handsPlayed: number;
  decisionsRecorded: number;
  eventsRecorded: number;
  decisionsEvaluated: number;
  decisionsByPhase: Record<string, number>;
  eventsByPhase: Record<string, number>;
  providerUsage: Record<string, number>;
  fallbackCount: number;
  errors: number;
  maxDecisionLimitHit: number;
  averageGameDurationMs: number;
  averageDecisionsPerHand: number;
  exchangePhaseRecorded: boolean;
  passSelectRecorded: boolean;
  winCountsByTeam: Record<TeamId | "tie", number>;
  handWinCountsByTeam: Record<TeamId | "tie", number>;
  totalScoreByTeam: Record<TeamId, number>;
  averageScoreMargin: number;
  passRate: number;
  bombUsageRate: number;
  wishSatisfactionRate: number | null;
  tichuCallRate: number | null;
  tichuSuccessRate: number | null;
  grandTichuCallRate: number | null;
  grandTichuSuccessRate: number | null;
  doubleVictoryRate: number | null;
  doubleVictoryCountsByTeam: Record<TeamId, number>;
  lastCompletedGameId: string | null;
  lastCompletedHandId: string | null;
  lastCompletedMatchWinner: TeamId | "tie" | null;
  lastCompletedMatchScore: Record<TeamId, number>;
  invalidDecisionCount: number;
  telemetryDecisionFailures: number;
  telemetryEventFailures: number;
  telemetryFailuresTotal: number;
  telemetryFailureByEndpoint: Record<string, number>;
  telemetryFailureByKind: Record<string, number>;
  telemetryBackoffUntil: string | null;
  telemetryRuntime: TelemetryRuntimeState | null;
  averageLatencyByProvider: Record<string, number>;
};

class MaxDecisionLimitError extends Error {
  readonly gameId: string;
  readonly handId: string;
  readonly decisionsEvaluated: number;
  readonly handsPlayed: number;

  constructor(config: {
    gameId: string;
    handId: string;
    decisionsEvaluated: number;
    handsPlayed: number;
    maxDecisionsPerGame: number;
  }) {
    super(
      `Soft lock protection tripped after ${config.maxDecisionsPerGame} decisions for ${config.gameId}.`
    );
    this.name = "MaxDecisionLimitError";
    this.gameId = config.gameId;
    this.handId = config.handId;
    this.decisionsEvaluated = config.decisionsEvaluated;
    this.handsPlayed = config.handsPlayed;
  }
}

type SimulatedDecision = {
  chosenAction: EngineAction;
  providerUsed: DecisionProviderUsed | "system_local";
  requestedProvider: DecisionMode | "system_local";
  providerReason: string;
  explanation?: ChosenDecision["explanation"];
  fallbackUsed: boolean;
  latencyMs: number;
  telemetryFailureStats: TelemetryFailureStats;
  telemetryFailure?: TelemetryWriteResult;
};

type LocalDecisionStrategy = "heuristics_v1" | "server_fast_path";

function resolveDefaultLocalDecisionStrategy(config: {
  actor: SeatId | typeof SYSTEM_ACTOR;
  stateRaw: JsonObject;
  legalActions: LegalActionMap;
  phase: string;
}): LocalDecisionStrategy {
  return config.actor === SYSTEM_ACTOR ? "heuristics_v1" : "server_fast_path";
}

type PersistedEventConfig = {
  backendBaseUrl: string;
  telemetryEnabled: boolean;
  gameId: string;
  handId: string;
  actorSeat: SeatId | typeof SYSTEM_ACTOR;
  eventIndex: number;
  providerUsed: string;
  requestedProvider: string;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
  telemetryTimeoutMs?: number;
  telemetryRetryAttempts?: number;
  telemetryRetryDelayMs?: number;
  telemetryBackoffMs?: number;
  telemetryManager?: AsyncTelemetryManager;
  quiet?: boolean;
  workerId?: string;
  controllerMode?: boolean;
  metadata?: JsonObject;
};

function diagnosticsEnabled(): boolean {
  const value = process.env.SIM_DIAGNOSTICS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function emitDiagnosticsTiming(
  config: { quiet?: boolean; controllerMode?: boolean },
  stage: string,
  startedAt: number,
  payload: JsonObject = {}
): void {
  if (!diagnosticsEnabled() || !shouldEmitDiagnostic(config)) {
    return;
  }
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "diagnostic_timing",
      scope: "sim_runner",
      stage,
      duration_ms: Date.now() - startedAt,
      ...payload
    })
  );
}

function telemetryTransportConfig(config: {
  telemetryTimeoutMs?: number;
  telemetryRetryAttempts?: number;
  telemetryRetryDelayMs?: number;
  telemetryBackoffMs?: number;
}): {
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  backoffMs?: number;
} {
  return {
    ...(config.telemetryTimeoutMs !== undefined
      ? { timeoutMs: config.telemetryTimeoutMs }
      : {}),
    ...(config.telemetryRetryAttempts !== undefined
      ? { retryAttempts: config.telemetryRetryAttempts }
      : {}),
    ...(config.telemetryRetryDelayMs !== undefined
      ? { retryDelayMs: config.telemetryRetryDelayMs }
      : {}),
    ...(config.telemetryBackoffMs !== undefined
      ? { backoffMs: config.telemetryBackoffMs }
      : {})
  };
}

type BackendRequestKind =
  | "health_check"
  | "decision"
  | "telemetry_decision"
  | "telemetry_event";

type BackendFailureKind =
  | "network_failure"
  | "backend_rejection"
  | "unexpected_failure";

type BackendRequestContext = {
  request_kind: BackendRequestKind;
  method: string;
  url: string;
  worker_id?: string;
  controller_mode?: boolean;
  game_id?: string;
  hand_id?: string;
  phase?: string;
  actor_seat?: string;
  decision_index?: number;
  event_index?: number;
  requested_provider?: string;
  trace_backend?: boolean;
  quiet?: boolean;
  timeout_ms?: number;
  payload_summary?: JsonObject;
};

type BackendRequestResult = {
  status: number;
  payload: JsonObject;
  raw_body?: string;
  latency_ms: number;
  response_ms: number;
  parse_ms: number;
};

type DecisionFailureKind =
  | "payload_validation"
  | "network_failure"
  | "backend_rejection"
  | "unexpected_failure"
  | "invalid_backend_response"
  | "invalid_backend_action";

type DecisionFailureContext = {
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  provider: string;
  decision_index: number;
  worker_id?: string;
  controller_mode?: boolean;
};

type BackendDecisionValidationResult =
  | {
      ok: true;
      canonicalActorSeat: SeatId;
      actorLegalActions: LegalActionMap;
    }
  | {
      ok: false;
      kind: "payload_validation";
      missingFields: string[];
      issues: string[];
      context: DecisionFailureContext;
    };

class DecisionRequestFailure extends Error {
  constructor(
    readonly kind: DecisionFailureKind,
    message: string,
    readonly context: DecisionFailureContext,
    readonly details: JsonObject = {}
  ) {
    super(message);
    this.name = "DecisionRequestFailure";
  }
}

class BackendRequestFailure extends Error {
  constructor(
    readonly kind: BackendFailureKind,
    message: string,
    readonly details: JsonObject
  ) {
    super(message);
    this.name = "BackendRequestFailure";
  }
}

function countByKey(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function createTeamScoreBucket(): Record<TeamId, number> {
  return {
    "team-0": 0,
    "team-1": 0
  };
}

function createWinCountBucket(): Record<TeamId | "tie", number> {
  return {
    "team-0": 0,
    "team-1": 0,
    tie: 0
  };
}

function cloneTeamScores(
  source?: Record<TeamId, number> | null
): Record<TeamId, number> {
  return {
    "team-0": source?.["team-0"] ?? 0,
    "team-1": source?.["team-1"] ?? 0
  };
}

function summarizeMatchHistory(
  history: GameState["matchHistory"]
): {
  handWinCountsByTeam: Record<TeamId | "tie", number>;
  doubleVictoryCountsByTeam: Record<TeamId, number>;
  tichuCalls: number;
  tichuSuccesses: number;
  grandTichuCalls: number;
  grandTichuSuccesses: number;
} {
  const handWinCountsByTeam = createWinCountBucket();
  const doubleVictoryCountsByTeam = createTeamScoreBucket();
  let tichuCalls = 0;
  let tichuSuccesses = 0;
  let grandTichuCalls = 0;
  let grandTichuSuccesses = 0;

  for (const hand of history) {
    const team0 = hand.teamScores["team-0"];
    const team1 = hand.teamScores["team-1"];
    const handWinner =
      team0 === team1 ? "tie" : team0 > team1 ? "team-0" : "team-1";
    countByKey(handWinCountsByTeam, handWinner);
    if (hand.doubleVictory !== null) {
      doubleVictoryCountsByTeam[hand.doubleVictory] += 1;
    }
    for (const bonus of hand.tichuBonuses) {
      if (bonus.label === "small") {
        tichuCalls += 1;
        if (bonus.amount > 0) {
          tichuSuccesses += 1;
        }
      }
      if (bonus.label === "grand") {
        grandTichuCalls += 1;
        if (bonus.amount > 0) {
          grandTichuSuccesses += 1;
        }
      }
    }
  }

  return {
    handWinCountsByTeam,
    doubleVictoryCountsByTeam,
    tichuCalls,
    tichuSuccesses,
    grandTichuCalls,
    grandTichuSuccesses
  };
}

function summarizeLatency(
  source: Record<string, { count: number; totalMs: number }>
): Record<string, { count: number; totalMs: number; averageMs: number }> {
  return Object.fromEntries(
    Object.entries(source).map(([provider, metrics]) => [
      provider,
      {
        count: metrics.count,
        totalMs: metrics.totalMs,
        averageMs:
          metrics.count > 0
            ? Number((metrics.totalMs / metrics.count).toFixed(2))
            : 0
      }
    ])
  );
}

function recordLatency(
  bucket: Record<string, { count: number; totalMs: number }>,
  provider: string,
  latencyMs: number
): void {
  const current = bucket[provider] ?? { count: 0, totalMs: 0 };
  current.count += 1;
  current.totalMs += latencyMs;
  bucket[provider] = current;
}

function sortCardIds(cardIds: string[]): string {
  return [...cardIds].sort().join("|");
}

function findMatchingLegalAction(
  legalActions: LegalActionMap,
  actor: SeatId | typeof SYSTEM_ACTOR,
  chosenAction: EngineAction
): LegalAction | null {
  const actorActions = legalActions[actor] ?? [];
  return (
    actorActions.find((candidate) => {
      if (candidate.type !== chosenAction.type) {
        return false;
      }

      switch (candidate.type) {
        case "play_cards":
          return (
            chosenAction.type === "play_cards" &&
            sortCardIds(candidate.cardIds) ===
              sortCardIds(chosenAction.cardIds) &&
            candidate.phoenixAsRank === chosenAction.phoenixAsRank
          );
        case "select_pass":
          if (
            chosenAction.type !== "select_pass" ||
            candidate.seat !== chosenAction.seat
          ) {
            return false;
          }
          if (
            !Array.isArray(candidate.availableCardIds) ||
            !Array.isArray(candidate.requiredTargets)
          ) {
            return false;
          }
          const chosenCardIds = [
            chosenAction.left,
            chosenAction.partner,
            chosenAction.right
          ];
          if (new Set(chosenCardIds).size !== chosenCardIds.length) {
            return false;
          }
          const requiredTargets: Array<"left" | "partner" | "right"> = [
            "left",
            "partner",
            "right"
          ];
          if (
            requiredTargets.some(
              (target) => !candidate.requiredTargets.includes(target)
            )
          ) {
            return false;
          }
          const allowedCardIds = new Set(candidate.availableCardIds);
          return chosenCardIds.every((cardId) => allowedCardIds.has(cardId));
        case "assign_dragon_trick":
          return (
            chosenAction.type === "assign_dragon_trick" &&
            candidate.recipient === chosenAction.recipient
          );
        case "advance_phase":
          return (
            chosenAction.type === "advance_phase" &&
            candidate.actor === chosenAction.actor
          );
        default:
          return true;
      }
    }) ?? null
  );
}

function getChosenCombination(
  legalAction: LegalAction | null
): Combination | null {
  return legalAction?.type === "play_cards" ? legalAction.combination : null;
}

function actionSatisfiesWish(
  state: GameState,
  legalAction: LegalAction | null
): boolean {
  if (!state.currentWish || legalAction?.type !== "play_cards") {
    return false;
  }

  const actualRanks = legalAction.combination.actualRanks;
  if (Array.isArray(actualRanks) && actualRanks.includes(state.currentWish)) {
    return true;
  }

  return legalAction.combination.primaryRank === state.currentWish;
}

function buildDecisionFailureContext(config: {
  gameId: string;
  handId: string;
  phase: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  requestedProvider: DecisionMode | "system_local";
  decisionIndex: number;
  workerId?: string;
  controllerMode?: boolean;
}): DecisionFailureContext {
  return {
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: String(config.actor),
    provider: config.requestedProvider,
    decision_index: config.decisionIndex,
    ...(config.workerId ? { worker_id: config.workerId } : {}),
    ...(config.controllerMode ? { controller_mode: true } : {})
  };
}

function shouldEmitDiagnostic(config: {
  quiet?: boolean;
  controllerMode?: boolean;
}): boolean {
  return config.controllerMode === true || config.quiet !== true;
}

function emitDecisionDiagnostic(
  config: { quiet?: boolean; controllerMode?: boolean },
  event: string,
  payload: JsonObject
): void {
  if (!shouldEmitDiagnostic(config)) {
    return;
  }
  console.error(
    JSON.stringify({ ts: new Date().toISOString(), event, ...payload })
  );
}

function traceBackendRequest(
  context: BackendRequestContext,
  event:
    | "backend_request_start"
    | "backend_request_success"
    | "backend_request_failure",
  payload: JsonObject
): void {
  if (context.trace_backend !== true) {
    return;
  }
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      request_kind: context.request_kind,
      method: context.method,
      url: context.url,
      ...(context.worker_id ? { worker_id: context.worker_id } : {}),
      ...(context.controller_mode ? { controller_mode: true } : {}),
      ...(context.game_id ? { game_id: context.game_id } : {}),
      ...(context.hand_id ? { hand_id: context.hand_id } : {}),
      ...(context.phase ? { phase: context.phase } : {}),
      ...(context.actor_seat ? { actor_seat: context.actor_seat } : {}),
      ...(context.decision_index !== undefined
        ? { decision_index: context.decision_index }
        : {}),
      ...(context.event_index !== undefined
        ? { event_index: context.event_index }
        : {}),
      ...(context.requested_provider
        ? { requested_provider: context.requested_provider }
        : {}),
      ...(context.payload_summary
        ? { payload_summary: context.payload_summary }
        : {}),
      ...payload
    })
  );
}

function summarizeBackendPayload(
  requestKind: BackendRequestKind,
  body?: JsonObject
): JsonObject {
  if (!body) {
    return {};
  }
  switch (requestKind) {
    case "decision":
      return {
        game_id: body.game_id,
        hand_id: body.hand_id,
        phase: body.phase,
        actor_seat: body.actor_seat,
        requested_provider: body.requested_provider,
        scoring_path:
          typeof body.metadata === "object" &&
          body.metadata !== null &&
          "scoring_path" in body.metadata
            ? (body.metadata as Record<string, unknown>).scoring_path
            : "fast_path",
        has_state_raw:
          typeof body.state_raw === "object" && body.state_raw !== null,
        has_state_norm:
          typeof body.state_norm === "object" && body.state_norm !== null,
        legal_action_count: Array.isArray(body.legal_actions)
          ? body.legal_actions.length
          : typeof body.legal_actions === "object" &&
              body.legal_actions !== null
            ? Object.values(
                body.legal_actions as Record<string, unknown>
              ).reduce(
                (count: number, entry) =>
                  count + (Array.isArray(entry) ? entry.length : 0),
                0
              )
            : 0
      } as JsonObject;
    case "telemetry_decision":
      return {
        game_id: body.game_id,
        hand_id: body.hand_id,
        phase: body.phase,
        actor_seat: body.actor_seat,
        decision_index: body.decision_index,
        requested_provider: body.requested_provider,
        provider_used: body.provider_used,
        fallback_used: body.fallback_used
      } as JsonObject;
    case "telemetry_event":
      return {
        game_id: body.game_id,
        hand_id: body.hand_id,
        phase: body.phase,
        event_type: body.event_type,
        event_index: body.event_index,
        requested_provider: body.requested_provider,
        provider_used: body.provider_used
      } as JsonObject;
    case "health_check":
      return {};
  }
}

function serializeError(error: unknown): JsonObject {
  if (error instanceof DecisionRequestFailure) {
    return {
      name: error.name,
      message: error.message,
      kind: error.kind,
      context: error.context,
      ...error.details
    };
  }
  if (error instanceof BackendRequestFailure) {
    return {
      name: error.name,
      message: error.message,
      kind: error.kind,
      ...error.details
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return { message: String(error) };
}

function buildGameId(config: {
  baseSeed: string;
  index: number;
  gameIdPrefix?: string | undefined;
}): string {
  if (config.gameIdPrefix) {
    return buildTrainingGameId({
      gameIdPrefix: config.gameIdPrefix,
      gameNumber: config.index + 1
    });
  }
  return `selfplay-${config.baseSeed}-game-${String(config.index + 1).padStart(6, "0")}`;
}

function buildHandId(gameId: string, handNumber: number): string {
  return `${gameId}-hand-${handNumber}`;
}

function buildTrickId(handId: string, trickIndex: number): string {
  return `${handId}:trick:${trickIndex}`;
}

function buildHandSeed(
  baseSeed: string,
  index: number,
  handNumber: number
): string {
  if (handNumber === 1) {
    return `${baseSeed}-${index}`;
  }
  return `${baseSeed}-${index}-hand-${handNumber}`;
}

function getCurrentHandNumber(state: Pick<GameState, "matchHistory">): number {
  return state.matchHistory.length + 1;
}

function buildDecisionTelemetryMetadata(config: {
  handId: string;
  handIndex: number;
  gameIndex: number;
  trickIndex: number | null;
  metadata?: JsonObject | undefined;
}): JsonObject {
  return {
    ...(config.metadata ?? {}),
    hand_index: config.handIndex,
    hand_number: config.handIndex,
    game_index: config.gameIndex,
    ...(config.trickIndex !== null
      ? {
          trick_index: config.trickIndex,
          trick_id: buildTrickId(config.handId, config.trickIndex)
        }
      : {})
  };
}

function buildLifecycleMetadata(config: {
  handIndex: number;
  gameIndex: number;
  metadata?: JsonObject | undefined;
}): JsonObject {
  return {
    ...(config.metadata ?? {}),
    hand_index: config.handIndex,
    hand_number: config.handIndex,
    game_index: config.gameIndex
  };
}

function getResolvedTrickCards(
  state: Pick<GameState, "currentTrick" | "pendingDragonGift">
): Card[] {
  if (state.currentTrick) {
    return state.currentTrick.entries.flatMap((entry) =>
      entry.type === "play" ? entry.combination.cardIds.map((cardId) => getCardById(cardId)) : []
    );
  }
  return state.pendingDragonGift?.trickCards ?? [];
}

function buildTrickOutcomeMetadata(config: {
  handId: string;
  handIndex: number;
  gameIndex: number;
  trickIndex: number;
  trickWinnerSeat: SeatId | null;
  trickPointRecipientSeat: SeatId | null;
  trickPoints: number;
  attributionQuality: "exact" | "range";
}): JsonObject {
  return {
    ...buildDecisionTelemetryMetadata({
      handId: config.handId,
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      trickIndex: config.trickIndex
    }),
    trick_winner_seat: config.trickWinnerSeat,
    trick_winner_team:
      config.trickWinnerSeat === null
        ? null
        : getOutcomeActorTeamForSeat(config.trickWinnerSeat),
    trick_point_recipient_seat: config.trickPointRecipientSeat,
    trick_point_recipient_team:
      config.trickPointRecipientSeat === null
        ? null
        : getOutcomeActorTeamForSeat(config.trickPointRecipientSeat),
    trick_points: config.trickPoints,
    attribution_quality: config.attributionQuality
  };
}

function buildResolvedTrickMetadata(config: {
  event: EngineEvent;
  chosenAction: EngineAction;
  handId: string;
  handIndex: number;
  gameIndex: number;
  trickIndex: number;
  stateBefore: GameState;
}): JsonObject | null {
  const trickWinnerSeat =
    config.stateBefore.currentTrick?.currentWinner ??
    config.stateBefore.pendingDragonGift?.winner ??
    null;
  if (trickWinnerSeat === null) {
    return null;
  }
  const trickPoints = getCardsPoints(getResolvedTrickCards(config.stateBefore));
  if (config.event.type === "dragon_gift_pending") {
    return buildTrickOutcomeMetadata({
      handId: config.handId,
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      trickIndex: config.trickIndex,
      trickWinnerSeat,
      trickPointRecipientSeat: null,
      trickPoints,
      attributionQuality: "range"
    });
  }
  if (
    config.event.type === "dragon_trick_assigned" &&
    config.chosenAction.type === "assign_dragon_trick"
  ) {
    return buildTrickOutcomeMetadata({
      handId: config.handId,
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      trickIndex: config.trickIndex,
      trickWinnerSeat,
      trickPointRecipientSeat: config.chosenAction.recipient,
      trickPoints,
      attributionQuality: "exact"
    });
  }
  if (config.event.type === "trick_resolved" || config.event.type === "phase_changed") {
    return buildTrickOutcomeMetadata({
      handId: config.handId,
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      trickIndex: config.trickIndex,
      trickWinnerSeat,
      trickPointRecipientSeat: trickWinnerSeat,
      trickPoints,
      attributionQuality: "exact"
    });
  }
  return null;
}

function shouldAttachTrickOutcomeMetadata(config: {
  event: EngineEvent;
  stateBefore: GameState;
  stateAfter: GameState;
}): boolean {
  if (config.event.type === "trick_resolved" || config.event.type === "dragon_gift_pending") {
    return true;
  }
  if (config.event.type === "dragon_trick_assigned") {
    return config.stateBefore.pendingDragonGift !== null;
  }
  return (
    config.event.type === "phase_changed" &&
    config.stateBefore.currentTrick !== null &&
    config.stateAfter.phase !== "trick_play"
  );
}

function buildHandOutcomeMetadata(config: {
  state: GameState;
  handId: string;
  handIndex: number;
  gameIndex: number;
  metadata?: JsonObject | undefined;
}): JsonObject {
  const roundSummary = config.state.roundSummary;
  const matchEntry = config.state.matchHistory.at(-1) ?? null;
  const handNsScoreDelta = roundSummary?.teamScores["team-0"] ?? null;
  const handEwScoreDelta = roundSummary?.teamScores["team-1"] ?? null;
  const finalHandWinnerTeam =
    handNsScoreDelta === null || handEwScoreDelta === null || handNsScoreDelta === handEwScoreDelta
      ? null
      : handNsScoreDelta > handEwScoreDelta
        ? "NS"
        : "EW";

  return {
    ...buildLifecycleMetadata({
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      metadata: config.metadata
    }),
    hand_ns_score_delta: handNsScoreDelta,
    hand_ew_score_delta: handEwScoreDelta,
    final_hand_winner_team: finalHandWinnerTeam,
    hand_result: {
      version: "outcome_hand_v1",
      hand_id: config.handId,
      hand_index: config.handIndex,
      out_order: roundSummary?.finishOrder ?? [],
      finish_order: roundSummary?.finishOrder ?? [],
      double_victory:
        normalizeOutcomeActorTeam(roundSummary?.doubleVictory ?? null),
      tichu_bonuses:
        roundSummary?.tichuBonuses.map((bonus) => ({
          seat: bonus.seat,
          team: normalizeOutcomeActorTeam(bonus.team),
          raw_team: bonus.team,
          label: bonus.label,
          amount: bonus.amount
        })) ?? [],
      scoring_breakdown: {
        hand_team_scores: roundSummary?.teamScores ?? null,
        cumulative_scores: matchEntry?.cumulativeScores ?? null
      }
    }
  };
}

function buildGameOutcomeMetadata(config: {
  state: GameState;
  handIndex: number;
  gameIndex: number;
  metadata?: JsonObject | undefined;
}): JsonObject {
  const finalGameWinnerTeam =
    config.state.matchScore["team-0"] === config.state.matchScore["team-1"]
      ? null
      : config.state.matchScore["team-0"] > config.state.matchScore["team-1"]
        ? "NS"
        : "EW";
  return {
    ...buildLifecycleMetadata({
      handIndex: config.handIndex,
      gameIndex: config.gameIndex,
      metadata: config.metadata
    }),
    game_ns_final_score: config.state.matchScore["team-0"],
    game_ew_final_score: config.state.matchScore["team-1"],
    final_game_winner_team: finalGameWinnerTeam,
    game_result: {
      version: "outcome_game_v1",
      game_index: config.gameIndex,
      hands_played: config.state.matchHistory.length,
      margin: Math.abs(
        config.state.matchScore["team-0"] - config.state.matchScore["team-1"]
      ),
      winner_team: finalGameWinnerTeam,
      final_scores: {
        NS: config.state.matchScore["team-0"],
        EW: config.state.matchScore["team-1"]
      }
    }
  };
}

type SelfPlayContinuationPlan =
  | {
      kind: "continue";
      actor: SeatId | typeof SYSTEM_ACTOR;
      derivation: string;
      derivedFromLegalActions: boolean;
    }
  | {
      kind: "next_hand";
      nextHandNumber: number;
      nextResult: ReturnType<typeof createInitialGameState>;
    }
  | {
      kind: "stop";
      stopReason: SelfPlayStopReason;
      details: JsonObject;
    };

function planSelfPlayContinuation(config: {
  result: ReturnType<typeof createInitialGameState>;
  baseSeed: string;
  gameIndex: number;
  currentHandNumber: number;
}): SelfPlayContinuationPlan {
  const { result } = config;
  const continuation = planMatchContinuation({
    state: result.nextState,
    legalActions: result.legalActions
  });
  if (continuation.kind === "next_hand") {
    return {
      kind: "next_hand",
      nextHandNumber: continuation.nextHandNumber,
      nextResult: createInitialGameState({
        seed: buildHandSeed(
          config.baseSeed,
          config.gameIndex,
          continuation.nextHandNumber
        ),
        ...continuation.carryState
      })
    };
  }
  if (continuation.kind === "continue") {
    return continuation;
  }
  return continuation;
}

function resolveRequestedProvider(
  seat: SeatId,
  defaultProvider: DecisionMode,
  overrides?: SeatProviderOverrides
): DecisionMode {
  return overrides?.[seat] ?? defaultProvider;
}

function getActorLegalActions(
  legalActions: LegalActionMap,
  actor: SeatId | typeof SYSTEM_ACTOR
): unknown[] {
  const actorActions = legalActions[actor] ?? [];
  return Array.isArray(actorActions) ? actorActions : [];
}

function hasActorLegalActions(
  legalActions: LegalActionMap,
  actor: SeatId | typeof SYSTEM_ACTOR
): boolean {
  return getActorLegalActions(legalActions, actor).length > 0;
}

function actorHasLegalActionTypes(
  legalActions: LegalActionMap,
  actor: SeatId,
  actionTypes: LegalAction["type"][]
): boolean {
  return (legalActions[actor] ?? []).some((action) =>
    actionTypes.includes(action.type)
  );
}

function listSeatActorsWithLegalActionTypes(
  legalActions: LegalActionMap,
  actionTypes: LegalAction["type"][]
): SeatId[] {
  return SEAT_IDS.filter((seat) =>
    actorHasLegalActionTypes(legalActions, seat, actionTypes)
  );
}

function summarizeLegalActors(legalActions: LegalActionMap): JsonObject {
  const actors = Object.fromEntries(
    [
      SYSTEM_ACTOR,
      ...SEAT_IDS
    ].map((actor) => [
      actor,
      (legalActions[actor] ?? []).map((action) => action.type)
    ])
  ) as JsonObject;

  return {
    legal_actors: actors
  };
}

type ContinuationActorResolution =
  | {
      ok: true;
      actor: SeatId | typeof SYSTEM_ACTOR;
      derivation: string;
      derivedFromLegalActions: boolean;
    }
  | {
      ok: false;
      stopReason: "invalid_state" | "no_legal_actions";
      details: JsonObject;
    };

export function resolveAutomatedContinuationActor(config: {
  legalActions: LegalActionMap;
  state: GameState;
}): ContinuationActorResolution {
  return resolveContinuationActor(config) as ContinuationActorResolution;
}

function resolveNextActor(
  legalActions: LegalActionMap,
  state: GameState
): SeatId | typeof SYSTEM_ACTOR {
  const resolution = resolveAutomatedContinuationActor({
    legalActions,
    state
  });
  if (resolution.ok) {
    return resolution.actor;
  }

  throw new Error(
    [
      "No legal actor was available for the next self-play decision.",
      `stop_reason=${resolution.stopReason}`,
      `phase=${state.phase}`,
      `activeSeat=${String(state.activeSeat ?? "null")}`
    ].join(" ")
  );
}

function resolveDecisionScoringPath(config?: {
  fullStateDecisionRequests?: boolean;
}): DecisionScoringPath {
  return config?.fullStateDecisionRequests === true ? "rich_path" : "fast_path";
}

function extractActorLegalActionList(
  legalActions: LegalActionMap,
  actor: SeatId | typeof SYSTEM_ACTOR
): LegalAction[] {
  const actorActions = legalActions[actor] ?? [];
  return Array.isArray(actorActions) ? actorActions : [];
}

function buildFastPathLegalActionPayload(
  state: GameState,
  actor: SeatId,
  phase: string,
  actorActions: LegalAction[]
): LegalAction[] {
  const callTichuAction = actorActions.find(
    (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
      action.type === "call_tichu"
  );

  if (phase !== "trick_play") {
    return actorActions;
  }

  const fastState = buildServerFastPathState(state, actor);
  const candidates = generateFastTrickPlayCandidates({
    state: fastState,
    actor,
    legalActions: actorActions
  });
  if (candidates.length === 0) {
    return actorActions;
  }

  const scopedLegalActions = { [actor]: actorActions } as LegalActionMap;
  const boundedActions = candidates
    .map((candidate) =>
      findMatchingLegalAction(scopedLegalActions, actor, candidate.action)
    )
    .filter((candidate): candidate is LegalAction => candidate !== null);

  if (callTichuAction) {
    boundedActions.push(callTichuAction);
  }

  return boundedActions.length > 0 ? boundedActions : actorActions;
}

function buildFastDecisionStatePayload(
  stateRaw: JsonObject,
  actorSeat: SeatId
): JsonObject {
  return buildServerFastPathState(
    stateRaw as unknown as GameState,
    actorSeat
  ) as unknown as JsonObject;
}

export function validateServerHeuristicDecisionRequestContract(
  request: DecisionRequestPayload
): void {
  const scoringPath = getDecisionScoringPath(request);
  const contractState =
    scoringPath === "rich_path" ? request.state_raw : request.state_norm;
  if (
    typeof contractState !== "object" ||
    contractState === null ||
    !("phase" in contractState)
  ) {
    throw new Error(
      [
        `[server_heuristic] refusing incomplete request: ${scoringPath} requires canonical state context`,
        `game_id=${request.game_id}`,
        `hand_id=${request.hand_id}`,
        `phase=${request.phase}`,
        `scoring_path=${scoringPath}`
      ].join("; ")
    );
  }
  if (
    scoringPath === "rich_path" &&
    (!("hands" in contractState) || !("activeSeat" in contractState))
  ) {
    throw new Error(
      [
        "[server_heuristic] refusing incomplete rich request: full state_raw is required",
        `game_id=${request.game_id}`,
        `hand_id=${request.hand_id}`,
        `phase=${request.phase}`,
        "missing=[state_raw.phase, state_raw.hands, state_raw.activeSeat]"
      ].join("; ")
    );
  }

  const canonicalActorSeat = getCanonicalActiveSeatFromState(contractState);
  const phase = String(contractState.phase);
  const actorActions = Array.isArray(request.legal_actions)
    ? (request.legal_actions as unknown as LegalAction[])
    : ((request.legal_actions as Record<string, LegalAction[]>)[
        request.actor_seat
      ] ?? []);
  const legalActions = {
    [request.actor_seat]: actorActions
  } as LegalActionMap;
  const legalActionIssues = validateLegalActionsForCanonicalActor({
    legalActions,
    actor: canonicalActorSeat
  });

  if (
    request.actor_seat !== canonicalActorSeat ||
    request.phase !== phase ||
    legalActionIssues.length > 0
  ) {
    const legalActionTypes = Object.values(legalActions)
      .flat()
      .slice(0, 6)
      .map((action) => action.type);
    throw new Error(
      [
        `[server_heuristic] refusing inconsistent request: actor_seat=${request.actor_seat}, canonical=${canonicalActorSeat}, phase=${request.phase}`,
        `state.phase=${String(phase)}`,
        `game_id=${request.game_id}`,
        `hand_id=${request.hand_id}`,
        `legalActions=[${legalActionTypes.join(", ")}]`,
        ...legalActionIssues
      ].join("; ")
    );
  }
}

export function validateBackendDecisionRequestInput(config: {
  gameId: string;
  handId: string;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  phase: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  requestedProvider: Exclude<DecisionMode, "local">;
  decisionIndex: number;
  workerId?: string;
  controllerMode?: boolean;
  fullStateDecisionRequests?: boolean;
}): BackendDecisionValidationResult {
  const context = buildDecisionFailureContext({
    gameId: config.gameId,
    handId: config.handId,
    phase: config.phase,
    actor: config.actor,
    requestedProvider: config.requestedProvider,
    decisionIndex: config.decisionIndex,
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {})
  });
  const missingFields: string[] = [];
  const issues: string[] = [];
  const scoringPath = resolveDecisionScoringPath(config);

  if (typeof config.stateRaw !== "object" || config.stateRaw === null) {
    missingFields.push("state_raw");
  } else if (scoringPath === "rich_path") {
    for (const field of ["phase", "hands", "activeSeat"]) {
      if (!(field in config.stateRaw)) {
        missingFields.push(`state_raw.${field}`);
      }
    }
  }
  if (typeof config.stateNorm !== "object" || config.stateNorm === null) {
    missingFields.push("state_norm");
  }
  const actorScopedLegalActions =
    config.actor === SYSTEM_ACTOR
      ? ({
          [SYSTEM_ACTOR]: config.legalActions[SYSTEM_ACTOR] ?? []
        } as LegalActionMap)
      : getActorScopedLegalActions(config.legalActions, config.actor);
  const actorActions = actorScopedLegalActions[config.actor] ?? [];
  if (!Array.isArray(actorActions) || actorActions.length === 0) {
    missingFields.push(`legal_actions.${String(config.actor)}`);
  }

  let canonicalActorSeat: SeatId | null = null;
  if (missingFields.length === 0) {
    try {
      canonicalActorSeat = getCanonicalActiveSeatFromState(config.stateRaw);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (canonicalActorSeat && config.actor !== canonicalActorSeat) {
    issues.push(
      `actor mismatch: actor=${String(config.actor)}, canonical=${canonicalActorSeat}`
    );
  }
  if (config.phase === "trick_play" && config.stateRaw.activeSeat === null) {
    try {
      getCanonicalActiveSeatFromState(config.stateRaw);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (config.stateRaw.phase !== config.phase) {
    issues.push(
      `phase mismatch: request=${config.phase}, state_raw=${String(config.stateRaw.phase)}`
    );
  }
  if (canonicalActorSeat) {
    issues.push(
      ...validateLegalActionsForCanonicalActor({
        legalActions: actorScopedLegalActions,
        actor: canonicalActorSeat
      })
    );
  }

  if (missingFields.length > 0 || issues.length > 0 || !canonicalActorSeat) {
    return {
      ok: false,
      kind: "payload_validation",
      missingFields,
      issues,
      context
    };
  }

  return {
    ok: true,
    canonicalActorSeat,
    actorLegalActions: actorScopedLegalActions
  };
}

export function buildDecisionRequestPayload(config: {
  gameId: string;
  handId: string;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  phase: string;
  requestedProvider: Exclude<DecisionMode, "local">;
  decisionIndex: number;
  metadata?: JsonObject;
  workerId?: string;
  controllerMode?: boolean;
  fullStateDecisionRequests?: boolean;
}): DecisionRequestPayload {
  const built = buildCanonicalDecisionRequest({
    gameId: config.gameId,
    handId: config.handId,
    state: config.stateRaw as unknown as GameState,
    derived: config.stateNorm,
    legalActions: config.legalActions,
    requestedProvider: config.requestedProvider,
    decisionIndex: config.decisionIndex,
    ...(config.fullStateDecisionRequests !== undefined
      ? { fullStateDecisionRequests: config.fullStateDecisionRequests }
      : {}),
    metadata: {
      simulation_mode: true,
      ...(config.metadata ?? {}),
      ...(config.workerId ? { worker_id: config.workerId } : {}),
      ...(config.controllerMode ? { controller_mode: true } : {})
    } as JsonObject
  });
  const payload = built.payload;

  validateServerHeuristicDecisionRequestContract(payload);

  return payload;
}

async function requestJson(
  method: string,
  url: string,
  body?: JsonObject,
  context?: Omit<BackendRequestContext, "method" | "url" | "payload_summary">
): Promise<BackendRequestResult> {
  const requestContext: BackendRequestContext = {
    request_kind: context?.request_kind ?? "decision",
    method,
    url,
    ...(context?.worker_id ? { worker_id: context.worker_id } : {}),
    ...(context?.controller_mode ? { controller_mode: true } : {}),
    ...(context?.game_id ? { game_id: context.game_id } : {}),
    ...(context?.hand_id ? { hand_id: context.hand_id } : {}),
    ...(context?.phase ? { phase: context.phase } : {}),
    ...(context?.actor_seat ? { actor_seat: context.actor_seat } : {}),
    ...(context?.decision_index !== undefined
      ? { decision_index: context.decision_index }
      : {}),
    ...(context?.event_index !== undefined
      ? { event_index: context.event_index }
      : {}),
    ...(context?.requested_provider
      ? { requested_provider: context.requested_provider }
      : {}),
    ...(context?.trace_backend ? { trace_backend: true } : {}),
    ...(context?.quiet ? { quiet: true } : {}),
    ...(context?.timeout_ms !== undefined
      ? { timeout_ms: context.timeout_ms }
      : {}),
    payload_summary: summarizeBackendPayload(
      context?.request_kind ?? "decision",
      body
    )
  };
  const startedAt = Date.now();
  const requestBody = body ? JSON.stringify(body) : undefined;
  const payloadBytes =
    requestBody === undefined ? 0 : Buffer.byteLength(requestBody, "utf8");
  traceBackendRequest(requestContext, "backend_request_start", {
    payload_bytes: payloadBytes
  });
  const abortController = new AbortController();
  const timeoutMs = context?.timeout_ms;
  const timeoutHandle =
    timeoutMs !== undefined
      ? setTimeout(() => abortController.abort(), timeoutMs)
      : undefined;
  const init: RequestInit = { method, signal: abortController.signal };
  if (requestBody) {
    init.headers = {
      "content-type": "application/json"
    };
    init.body = requestBody;
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    const message = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === "AbortError";
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: aborted ? "unexpected_failure" : "network_failure",
      latency_ms: latencyMs,
      payload_bytes: payloadBytes,
      message,
      cause: error instanceof Error ? error.name : "unknown",
      ...(timeoutMs !== undefined ? { timeout_ms: timeoutMs } : {})
    });
    throw new BackendRequestFailure(
      aborted ? "unexpected_failure" : "network_failure",
      aborted
        ? `Request to ${url} timed out after ${timeoutMs ?? 0}ms.`
        : `Request to ${url} failed before receiving a response: ${message}`,
      {
        method,
        url,
        request_kind: requestContext.request_kind,
        latency_ms: latencyMs,
        cause: message,
        ...(timeoutMs !== undefined ? { timeout_ms: timeoutMs } : {})
      }
    );
  }
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  let responseText: string;
  const responseReadStartedAt = Date.now();
  try {
    responseText = await response.text();
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: "unexpected_failure",
      latency_ms: latencyMs,
      status: response.status,
      payload_bytes: payloadBytes,
      message
    });
    throw new BackendRequestFailure(
      "unexpected_failure",
      `Request to ${url} failed while reading the response body: ${message}`,
      {
        method,
        url,
        request_kind: requestContext.request_kind,
        status: response.status,
        latency_ms: latencyMs,
        cause: message
      }
    );
  }
  const responseMs = Date.now() - responseReadStartedAt;

  let payload: JsonObject = {};
  let rawBody: string | undefined;
  const parseStartedAt = Date.now();
  if (responseText.length > 0) {
    try {
      payload = JSON.parse(responseText) as JsonObject;
    } catch {
      rawBody = responseText;
      payload = {};
    }
  }
  const parseMs = Date.now() - parseStartedAt;
  const latencyMs = Date.now() - startedAt;
  if (!response.ok) {
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: "backend_rejection",
      latency_ms: latencyMs,
      response_ms: responseMs,
      parse_ms: parseMs,
      status: response.status,
      payload_bytes: payloadBytes,
      ...(Object.keys(payload).length > 0 ? { body: payload } : {}),
      ...(rawBody ? { raw_body: rawBody } : {})
    });
    throw new BackendRequestFailure(
      "backend_rejection",
      `Request to ${url} failed (${response.status}): ${
        rawBody ?? JSON.stringify(payload)
      }`,
      {
        method,
        url,
        request_kind: requestContext.request_kind,
        status: response.status,
        latency_ms: latencyMs,
        response_ms: responseMs,
        parse_ms: parseMs,
        ...(Object.keys(payload).length > 0 ? { body: payload } : {}),
        ...(rawBody ? { raw_body: rawBody } : {})
      }
    );
  }
  traceBackendRequest(requestContext, "backend_request_success", {
    latency_ms: latencyMs,
    response_ms: responseMs,
    parse_ms: parseMs,
    status: response.status,
    payload_bytes: payloadBytes
  });
  return {
    status: response.status,
    payload,
    ...(rawBody ? { raw_body: rawBody } : {}),
    latency_ms: latencyMs,
    response_ms: responseMs,
    parse_ms: parseMs
  };
}

async function verifyBackend(
  baseUrl: string,
  options: {
    traceBackend?: boolean;
    quiet?: boolean;
    workerId?: string;
    controllerMode?: boolean;
  } = {}
): Promise<void> {
  await requestJson("GET", `${baseUrl}${BACKEND_HEALTH_PATH}`, undefined, {
    request_kind: "health_check",
    timeout_ms: 250,
    ...(options.traceBackend ? { trace_backend: true } : {}),
    ...(options.quiet ? { quiet: true } : {}),
    ...(options.workerId ? { worker_id: options.workerId } : {}),
    ...(options.controllerMode ? { controller_mode: true } : {})
  });
}

export async function safePostTelemetryDecision(config: {
  backendBaseUrl: string;
  payload: TelemetryDecisionPayload;
  traceBackend?: boolean;
  quiet?: boolean;
  maxBytes?: number;
  workerId?: string;
  controllerMode?: boolean;
}): Promise<TelemetryWriteResult> {
  return emitTelemetryDecision({
    telemetry: {
      enabled: true,
      strictTelemetry: false,
      backendBaseUrl: config.backendBaseUrl,
      traceBackend: config.traceBackend,
      quiet: config.quiet,
      maxBytes: config.maxBytes,
      workerId: config.workerId,
      controllerMode: config.controllerMode,
      source: config.controllerMode ? "controller" : "selfplay",
      mode: "full"
    },
    payloads: {
      full: config.payload,
      minimal: config.payload
    }
  });
}

export async function safePostTelemetryEvent(config: {
  backendBaseUrl: string;
  payload: TelemetryEventPayload;
  traceBackend?: boolean;
  quiet?: boolean;
  maxBytes?: number;
  workerId?: string;
  controllerMode?: boolean;
}): Promise<TelemetryWriteResult> {
  return emitTelemetryEvent({
    telemetry: {
      enabled: true,
      strictTelemetry: false,
      backendBaseUrl: config.backendBaseUrl,
      traceBackend: config.traceBackend,
      quiet: config.quiet,
      maxBytes: config.maxBytes,
      workerId: config.workerId,
      controllerMode: config.controllerMode,
      source: config.controllerMode ? "controller" : "selfplay",
      mode: "full"
    },
    payloads: {
      full: config.payload,
      minimal: config.payload
    }
  });
}

async function resolveLocalHeuristicDecision(config: {
  backendBaseUrl: string;
  telemetryEnabled: boolean;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
  telemetryTimeoutMs?: number;
  telemetryRetryAttempts?: number;
  telemetryRetryDelayMs?: number;
  telemetryBackoffMs?: number;
  quiet?: boolean;
  gameId: string;
  handId: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  decisionIndex: number;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  phase: string;
  requestedProvider: DecisionMode | "system_local";
  providerReason: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  startedAt: number;
  strategy?: LocalDecisionStrategy;
  telemetryManager?: AsyncTelemetryManager;
  metadata?: JsonObject;
  workerId?: string;
  controllerMode?: boolean;
}): Promise<SimulatedDecision> {
  const telemetryFailureStats = createTelemetryFailureStats();
  let telemetryFailure: TelemetryWriteResult | undefined;
  const actorScopedLegalActions: LegalActionMap = {
    [config.actor]: config.legalActions[config.actor] ?? []
  };
  const localDecisionStartedAt = Date.now();
  const strategy =
    config.strategy ??
    resolveDefaultLocalDecisionStrategy({
      actor: config.actor,
      stateRaw: config.stateRaw,
      legalActions: config.legalActions,
      phase: config.phase
    });
  const chosen =
    strategy === "server_fast_path" && config.actor !== SYSTEM_ACTOR
      ? (() => {
          const actorLegalActions = extractActorLegalActionList(
            config.legalActions,
            config.actor
          );
          const fastDecision = chooseServerFastPathDecision({
            state: buildServerFastPathState(
              config.stateRaw as unknown as GameState,
              config.actor
            ),
            actor: config.actor,
            legalActions: buildFastPathLegalActionPayload(
              config.stateRaw as unknown as GameState,
              config.actor,
              config.phase,
              actorLegalActions
            )
          });
          return {
            actor: fastDecision.actor,
            action: fastDecision.action,
            explanation: {
              policy: "server-fast-path",
              actor: fastDecision.actor,
              candidateScores: fastDecision.candidates.map((candidate) => ({
                action: candidate.action,
                score: candidate.score,
                reasons: candidate.reasons,
                tags: [],
                ...(candidate.mahjongWish
                  ? { mahjongWish: candidate.mahjongWish }
                  : {}),
                ...(candidate.tichuCall
                  ? { tichuCall: candidate.tichuCall }
                  : {})
              })),
              selectedReasonSummary: fastDecision.candidates[0]?.reasons ?? [],
              selectedTags: [],
              ...(fastDecision.candidates[0]?.mahjongWish
                ? { selectedMahjongWish: fastDecision.candidates[0].mahjongWish }
                : {}),
              ...(fastDecision.candidates[0]?.tichuCall
                ? { selectedTichuCall: fastDecision.candidates[0].tichuCall }
                : {})
            }
          } satisfies ChosenDecision;
        })()
      : heuristicsV1Policy.chooseAction({
          state: config.stateRaw as never,
          legalActions: actorScopedLegalActions
        });
  emitDiagnosticsTiming(
    config,
    "local_decision_policy",
    localDecisionStartedAt,
    {
      game_id: config.gameId,
      hand_id: config.handId,
      phase: config.phase,
      actor_seat: String(config.actor),
      decision_index: config.decisionIndex,
      requested_provider: config.requestedProvider,
      scoring_path: strategy === "server_fast_path" ? "fast_path" : "rich_path"
    }
  );
  const latencyMs = Date.now() - config.startedAt;

  if (config.telemetryEnabled) {
    const providerUsed =
      config.actor === SYSTEM_ACTOR ? "system_local" : "local_heuristic";
    const telemetrySource: "controller" | "selfplay" = config.controllerMode
      ? "controller"
      : "selfplay";
    const payloads = buildSelfPlayDecisionTelemetry({
      gameId: config.gameId,
      handId: config.handId,
      phase: config.phase,
      actorSeat: config.actor,
      decisionIndex: config.decisionIndex,
      stateRaw: config.stateRaw,
      stateNorm: config.stateNorm,
      legalActions: config.legalActions,
      chosenAction: chosen.action,
      explanation: chosen.explanation as unknown as JsonObject,
      policyName:
        strategy === "server_fast_path"
          ? "server-fast-path"
          : heuristicsV1Policy.name,
      requestedProvider: config.requestedProvider,
      providerUsed,
      fallbackUsed: config.fallbackUsed,
      ...(config.fallbackReason
        ? { fallbackReason: config.fallbackReason }
        : {}),
      latencyMs,
      ...(config.metadata ? { metadata: config.metadata } : {}),
      mode: config.telemetryMode ?? "minimal",
      strictTelemetry: config.strictTelemetry === true,
      ...(config.workerId ? { workerId: config.workerId } : {}),
      ...(config.controllerMode ? { controllerMode: true } : {})
    });
    const telemetryConfig: TelemetryConfigInput = {
      enabled: true,
      strictTelemetry: false,
      backendBaseUrl: config.backendBaseUrl,
      traceBackend: config.traceBackend,
      quiet: config.quiet,
      mode: config.telemetryMode ?? "minimal",
      maxBytes: config.telemetryMaxBytes,
      ...telemetryTransportConfig(config),
      source: telemetrySource,
      workerId: config.workerId,
      controllerMode: config.controllerMode
    };
    const telemetryContext = {
      game_id: config.gameId,
      hand_id: config.handId,
      phase: config.phase,
      actor_seat: String(config.actor),
      decision_index: config.decisionIndex,
      requested_provider: config.requestedProvider,
      provider_used: providerUsed
    } as JsonObject;
    if (config.telemetryManager) {
      const telemetryStartedAt = Date.now();
      await config.telemetryManager.enqueueDecision({
        telemetry: telemetryConfig,
        payloads,
        context: telemetryContext,
        strictTelemetry: config.strictTelemetry === true
      });
      emitDiagnosticsTiming(
        config,
        "telemetry_queue_decision",
        telemetryStartedAt,
        telemetryContext
      );
    } else {
      const telemetryStartedAt = Date.now();
      const result = await emitTelemetryDecision({
        telemetry: {
          ...telemetryConfig,
          strictTelemetry: config.strictTelemetry === true
        },
        payloads
      });
      emitDiagnosticsTiming(
        config,
        "telemetry_emit_decision",
        telemetryStartedAt,
        telemetryContext
      );
      recordTelemetryFailure(telemetryFailureStats, result);
      if (!result.ok) {
        telemetryFailure = result;
      }
    }
  }

  return {
    chosenAction: chosen.action,
    providerUsed:
      config.actor === SYSTEM_ACTOR ? "system_local" : "local_heuristic",
    requestedProvider: config.requestedProvider,
    providerReason: config.providerReason,
    explanation: chosen.explanation,
    fallbackUsed: config.fallbackUsed,
    latencyMs,
    telemetryFailureStats,
    ...(telemetryFailure ? { telemetryFailure } : {})
  };
}

async function persistEvent(
  event: EngineEvent,
  stateNorm: JsonObject,
  config: PersistedEventConfig
): Promise<TelemetryWriteResult | null> {
  if (!config.telemetryEnabled) {
    return null;
  }

  const payloads = buildSelfPlayEventTelemetry({
    mode: config.telemetryMode ?? "minimal",
    gameId: config.gameId,
    handId: config.handId,
    event,
    stateNorm,
    actorSeat: config.actorSeat,
    eventIndex: config.eventIndex,
    requestedProvider: config.requestedProvider,
    providerUsed: config.providerUsed,
    strictTelemetry: config.strictTelemetry === true,
    metadata: config.metadata,
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {})
  });
  const telemetrySource: "controller" | "selfplay" = config.controllerMode
    ? "controller"
    : "selfplay";
  const telemetryConfig: TelemetryConfigInput = {
    enabled: true,
    strictTelemetry: false,
    backendBaseUrl: config.backendBaseUrl,
    traceBackend: config.traceBackend,
    quiet: config.quiet,
    mode: config.telemetryMode ?? "minimal",
    maxBytes: config.telemetryMaxBytes,
    ...telemetryTransportConfig(config),
    source: telemetrySource,
    workerId: config.workerId,
    controllerMode: config.controllerMode
  };
  const telemetryContext = {
    game_id: config.gameId,
    hand_id: config.handId,
    phase: String(stateNorm.phase ?? ""),
    actor_seat: String(config.actorSeat),
    event_index: config.eventIndex,
    requested_provider: config.requestedProvider,
    provider_used: config.providerUsed
  } as JsonObject;
  if (config.telemetryManager) {
    const telemetryStartedAt = Date.now();
    await config.telemetryManager.enqueueEvent({
      telemetry: telemetryConfig,
      payloads,
      context: telemetryContext,
      strictTelemetry: config.strictTelemetry === true
    });
    emitDiagnosticsTiming(
      config,
      "telemetry_queue_event",
      telemetryStartedAt,
      telemetryContext
    );
    return null;
  }

  const telemetryStartedAt = Date.now();
  const result = await emitTelemetryEvent({
    telemetry: {
      ...telemetryConfig,
      strictTelemetry: config.strictTelemetry === true
    },
    payloads
  });
  emitDiagnosticsTiming(
    config,
    "telemetry_emit_event",
    telemetryStartedAt,
    telemetryContext
  );
  return result;
}

export async function resolveDecision(config: {
  backendBaseUrl: string;
  telemetryEnabled: boolean;
  gameId: string;
  handId: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  decisionIndex: number;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  phase: string;
  defaultProvider: DecisionMode;
  seatProviders?: SeatProviderOverrides;
  serverFallbackEnabled?: boolean;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
  telemetryTimeoutMs?: number;
  telemetryRetryAttempts?: number;
  telemetryRetryDelayMs?: number;
  telemetryBackoffMs?: number;
  telemetryManager?: AsyncTelemetryManager;
  quiet?: boolean;
  metadata?: JsonObject;
  workerId?: string;
  controllerMode?: boolean;
  fullStateDecisionRequests?: boolean;
}): Promise<SimulatedDecision> {
  const startedAt = Date.now();
  if (config.actor === SYSTEM_ACTOR) {
    return resolveLocalHeuristicDecision({
      ...config,
      requestedProvider: "system_local",
      providerReason: "Resolved locally for a system-owned phase transition.",
      fallbackUsed: false,
      startedAt
    });
  }

  const requestedProvider = resolveRequestedProvider(
    config.actor,
    config.defaultProvider,
    config.seatProviders
  );

  if (requestedProvider === "local") {
    return resolveLocalHeuristicDecision({
      ...config,
      requestedProvider,
      providerReason:
        "Resolved locally through heuristics-v1 during self-play simulation.",
      fallbackUsed: false,
      startedAt
    });
  }

  if (
    requestedProvider === "server_heuristic" &&
    config.phase === "trick_play" &&
    typeof config.stateRaw === "object" &&
    config.stateRaw !== null &&
    config.stateRaw.activeSeat === null
  ) {
    const recovery = resolveContinuationActor({
      state: config.stateRaw as unknown as GameState,
      legalActions: config.legalActions
    });
    if (!recovery.ok || recovery.actor !== config.actor) {
      return resolveLocalHeuristicDecision({
        ...config,
        requestedProvider,
        providerReason:
          "Resolved locally because this trick_play boundary has no canonical active seat yet.",
        fallbackUsed: false,
        startedAt
      });
    }
  }

  const fallbackAllowed = config.serverFallbackEnabled !== false;
  const fallbackLocally = async (
    failure: DecisionRequestFailure
  ): Promise<SimulatedDecision> => {
    const event =
      failure.kind === "payload_validation"
        ? "decision_request_contract_failure"
        : failure.kind === "backend_rejection"
          ? "decision_backend_validation_failure"
          : "decision_provider_failure";
    emitDecisionDiagnostic(config, event, {
      kind: failure.kind,
      fallback_allowed: fallbackAllowed,
      fallback_used: fallbackAllowed,
      context: failure.context,
      ...failure.details,
      error: failure.message
    });
    if (!fallbackAllowed) {
      throw failure;
    }
    const fallbackStartedAt = Date.now();
    const fallback = await resolveLocalHeuristicDecision({
      ...config,
      requestedProvider,
      providerReason:
        requestedProvider === "server_heuristic"
          ? `Backend ${requestedProvider} decision failed; resolved through the bounded local fast-path fallback.`
          : `Backend ${requestedProvider} decision failed; resolved through local heuristics-v1 fallback.`,
      fallbackUsed: true,
      fallbackReason: failure.message,
      startedAt,
      strategy:
        requestedProvider === "server_heuristic"
          ? "server_fast_path"
          : "heuristics_v1"
    });
    emitDiagnosticsTiming(
      config,
      "fallback_local_resolution",
      fallbackStartedAt,
      {
        game_id: config.gameId,
        hand_id: config.handId,
        phase: config.phase,
        actor_seat: String(config.actor),
        decision_index: config.decisionIndex,
        requested_provider: requestedProvider,
        failure_kind: failure.kind
      }
    );
    emitDecisionDiagnostic(config, "decision_fallback", {
      kind: failure.kind,
      requested_provider: requestedProvider,
      provider_used: fallback.providerUsed,
      fallback_used: true,
      context: failure.context
    });
    return fallback;
  };

  const validationStartedAt = Date.now();
  const scoringPath = resolveDecisionScoringPath(config);
  const validation = validateBackendDecisionRequestInput({
    gameId: config.gameId,
    handId: config.handId,
    stateRaw: config.stateRaw,
    stateNorm: config.stateNorm,
    legalActions: config.legalActions,
    phase: config.phase,
    actor: config.actor,
    requestedProvider,
    decisionIndex: config.decisionIndex,
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {}),
    ...(config.fullStateDecisionRequests !== undefined
      ? { fullStateDecisionRequests: config.fullStateDecisionRequests }
      : {})
  });
  emitDiagnosticsTiming(config, "contract_validation", validationStartedAt, {
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: String(config.actor),
    decision_index: config.decisionIndex,
    requested_provider: requestedProvider,
    accepted: validation.ok,
    scoring_path: scoringPath
  });
  if (!validation.ok) {
    return fallbackLocally(
      new DecisionRequestFailure(
        validation.kind,
        `Backend ${requestedProvider} request validation failed before send.`,
        validation.context,
        {
          missing_fields: validation.missingFields,
          issues: validation.issues
        }
      )
    );
  }

  const context = buildDecisionFailureContext({
    gameId: config.gameId,
    handId: config.handId,
    phase: config.phase,
    actor: config.actor,
    requestedProvider,
    decisionIndex: config.decisionIndex,
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {})
  });

  let decisionRequestPayload: DecisionRequestPayload;
  try {
    const payloadBuildStartedAt = Date.now();
    decisionRequestPayload = buildDecisionRequestPayload({
      gameId: config.gameId,
      handId: config.handId,
      stateRaw: config.stateRaw,
      stateNorm: config.stateNorm,
      legalActions: validation.actorLegalActions,
      phase: config.phase,
      requestedProvider,
      decisionIndex: config.decisionIndex,
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...(config.workerId ? { workerId: config.workerId } : {}),
      ...(config.controllerMode ? { controllerMode: true } : {}),
      ...(config.fullStateDecisionRequests !== undefined
        ? { fullStateDecisionRequests: config.fullStateDecisionRequests }
        : {})
    });
    emitDiagnosticsTiming(
      config,
      "decision_request_payload_build",
      payloadBuildStartedAt,
      {
        game_id: config.gameId,
        hand_id: config.handId,
        phase: config.phase,
        actor_seat: String(config.actor),
        decision_index: config.decisionIndex,
        requested_provider: requestedProvider,
        scoring_path: scoringPath
      }
    );
  } catch (error) {
    return fallbackLocally(
      new DecisionRequestFailure(
        "payload_validation",
        error instanceof Error ? error.message : String(error),
        context
      )
    );
  }

  let decisionResponse: BackendRequestResult;
  try {
    const requestStartedAt = Date.now();
    decisionResponse = await requestJson(
      "POST",
      `${config.backendBaseUrl}${DECISION_REQUEST_PATH}`,
      decisionRequestPayload as unknown as JsonObject,
      {
        request_kind: "decision",
        game_id: config.gameId,
        hand_id: config.handId,
        phase: config.phase,
        actor_seat: String(config.actor),
        decision_index: config.decisionIndex,
        requested_provider: requestedProvider,
        timeout_ms: 500,
        ...(config.traceBackend ? { trace_backend: true } : {}),
        ...(config.quiet ? { quiet: true } : {}),
        ...(config.workerId ? { worker_id: config.workerId } : {}),
        ...(config.controllerMode ? { controller_mode: true } : {})
      }
    );
    emitDiagnosticsTiming(
      config,
      "server_request_roundtrip",
      requestStartedAt,
      {
        game_id: config.gameId,
        hand_id: config.handId,
        phase: config.phase,
        actor_seat: String(config.actor),
        decision_index: config.decisionIndex,
        requested_provider: requestedProvider,
        scoring_path: scoringPath,
        parse_ms: decisionResponse.parse_ms,
        response_ms: decisionResponse.response_ms
      }
    );
  } catch (error) {
    if (error instanceof BackendRequestFailure) {
      return fallbackLocally(
        new DecisionRequestFailure(
          error.kind,
          error.message,
          context,
          error.details
        )
      );
    }
    return fallbackLocally(
      new DecisionRequestFailure(
        "network_failure",
        error instanceof Error ? error.message : String(error),
        context
      )
    );
  }

  const payload =
    decisionResponse.payload as unknown as DecisionResponsePayload;
  if (!payload.accepted || !payload.chosen_action || !payload.provider_used) {
    return fallbackLocally(
      new DecisionRequestFailure(
        "invalid_backend_response",
        `Backend decision provider returned an unusable response: ${JSON.stringify(payload)}`,
        context,
        {
          status: decisionResponse.status,
          body: decisionResponse.payload
        }
      )
    );
  }

  const chosenAction = payload.chosen_action as unknown as EngineAction;
  if (
    !findMatchingLegalAction(config.legalActions, config.actor, chosenAction)
  ) {
    return fallbackLocally(
      new DecisionRequestFailure(
        "invalid_backend_action",
        `Backend decision provider returned an action that is not legal for ${String(config.actor)}.`,
        context,
        {
          chosen_action: payload.chosen_action
        }
      )
    );
  }

  const metadata = payload.metadata ?? {};
  const fallbackUsed =
    metadata.fallback_provider !== undefined ||
    inferTelemetryFallbackUsed({
      requestedProvider,
      providerUsed: payload.provider_used,
      explicitFallbackUsed:
        typeof metadata.fallback_used === "boolean"
          ? metadata.fallback_used
          : undefined,
      fallbackReason: metadata.fallback_reason
    });

  return {
    chosenAction,
    providerUsed: payload.provider_used,
    requestedProvider,
    providerReason:
      payload.provider_reason ??
      "Resolved through the backend decision provider.",
    ...(typeof metadata.explanation === "object" &&
    metadata.explanation !== null
      ? { explanation: metadata.explanation as ChosenDecision["explanation"] }
      : {}),
    fallbackUsed,
    latencyMs: Date.now() - startedAt,
    telemetryFailureStats: createTelemetryFailureStats()
  };
}

async function runSingleGame(
  index: number,
  options: SelfPlayBatchOptions,
  backendBaseUrl: string
): Promise<SelfPlayGameResult> {
  const gameId = buildGameId({
    baseSeed: options.baseSeed,
    index,
    gameIdPrefix: options.gameIdPrefix
  });
  const firstHandId = buildHandId(gameId, 1);
  const startedAt = Date.now();
  const gameIndex = index + 1;
  let currentHandNumber = 1;
  let currentTrickIndex = 1;
  let result = createInitialGameState(
    buildHandSeed(options.baseSeed, index, currentHandNumber)
  );
  let decisionIndex = 0;
  let eventIndex = 0;
  const providerUsage: Record<string, number> = {};
  const decisionsByPhase: Record<string, number> = {};
  const eventsByPhase: Record<string, number> = {};
  const latencyByProvider: Record<string, { count: number; totalMs: number }> =
    {};
  const telemetryFailureStats = createTelemetryFailureStats();
  const telemetryFailureTracker = createTelemetryFailureTracker();
  let telemetryRuntimeState: TelemetryRuntimeState | null = null;
  const telemetryManager = options.telemetryEnabled
    ? new AsyncTelemetryManager({
        enabled: true,
        storageRoot:
          options.telemetryStorageRoot ?? createDefaultTelemetryStorageRoot(),
        ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {}),
        onSnapshot: (snapshot) => {
          telemetryRuntimeState = snapshot;
          options.onTelemetryRuntimeState?.(snapshot);
        }
      })
    : undefined;
  let telemetryBackoffUntil: string | null = null;
  let fallbackCount = 0;
  let passActions = 0;
  let playActions = 0;
  let bombPlays = 0;
  let wishSatisfiedPlays = 0;
  let wishActiveDecisions = 0;
  let invalidDecisions = 0;
  const startedHands = new Set<number>();
  let lastHandId = firstHandId;
  let lastPhase = result.nextState.phase;
  let lastActor: string | null = null;
  let lastActionType: string | null = null;
  let stopReason: SelfPlayStopReason | null = null;
  let stopDetails: JsonObject = {};

  const persistHandCompleted = async (handId: string): Promise<void> => {
    const completedWinningTeam =
      result.nextState.matchScore["team-0"] ===
      result.nextState.matchScore["team-1"]
        ? "tie"
        : result.nextState.matchScore["team-0"] >
            result.nextState.matchScore["team-1"]
          ? "team-0"
          : "team-1";
    const handCompleted = await persistEvent(
      { type: "hand_completed", detail: handId },
      result.derivedView as unknown as JsonObject,
      {
        backendBaseUrl,
        telemetryEnabled: options.telemetryEnabled,
        ...(options.strictTelemetry !== undefined
          ? { strictTelemetry: options.strictTelemetry }
          : {}),
        ...(options.traceBackend !== undefined
          ? { traceBackend: options.traceBackend }
          : {}),
        ...(options.telemetryMode !== undefined
          ? { telemetryMode: options.telemetryMode }
          : {}),
        ...(options.telemetryMaxBytes !== undefined
          ? { telemetryMaxBytes: options.telemetryMaxBytes }
          : {}),
        ...telemetryTransportConfig(options),
        ...(telemetryManager ? { telemetryManager } : {}),
        ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
        gameId,
        handId,
        actorSeat: SYSTEM_ACTOR,
        eventIndex: eventIndex++,
        providerUsed: "system_local",
        requestedProvider: "system_local",
        metadata: {
          ...buildHandOutcomeMetadata({
            state: result.nextState,
            handId,
            handIndex: currentHandNumber,
            gameIndex,
            metadata: options.runMetadata
          }),
          hand_number: String(result.nextState.matchHistory.length),
          hands_played: String(result.nextState.matchHistory.length),
          winner_team: completedWinningTeam === "tie" ? null : completedWinningTeam,
          final_team_0_score: result.nextState.matchScore["team-0"],
          final_team_1_score: result.nextState.matchScore["team-1"]
        },
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      }
    );
    if (handCompleted) {
      recordTelemetryFailure(telemetryFailureStats, handCompleted);
    }
  };

  const persistGameCompleted = async (handId: string): Promise<void> => {
    const completedWinningTeam =
      result.nextState.matchScore["team-0"] ===
      result.nextState.matchScore["team-1"]
        ? "tie"
        : result.nextState.matchScore["team-0"] >
            result.nextState.matchScore["team-1"]
          ? "team-0"
          : "team-1";
    const gameCompleted = await persistEvent(
      { type: "game_completed", detail: completedWinningTeam },
      result.derivedView as unknown as JsonObject,
      {
        backendBaseUrl,
        telemetryEnabled: options.telemetryEnabled,
        ...(options.strictTelemetry !== undefined
          ? { strictTelemetry: options.strictTelemetry }
          : {}),
        ...(options.traceBackend !== undefined
          ? { traceBackend: options.traceBackend }
          : {}),
        ...(options.telemetryMode !== undefined
          ? { telemetryMode: options.telemetryMode }
          : {}),
        ...(options.telemetryMaxBytes !== undefined
          ? { telemetryMaxBytes: options.telemetryMaxBytes }
          : {}),
        ...telemetryTransportConfig(options),
        ...(telemetryManager ? { telemetryManager } : {}),
        ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
        gameId,
        handId,
        actorSeat: SYSTEM_ACTOR,
        eventIndex: eventIndex++,
        providerUsed: "system_local",
        requestedProvider: "system_local",
        metadata: {
          ...buildGameOutcomeMetadata({
            state: result.nextState,
            handIndex: currentHandNumber,
            gameIndex,
            metadata: options.runMetadata
          }),
          hand_number: String(result.nextState.matchHistory.length),
          hands_played: String(result.nextState.matchHistory.length),
          winner_team: completedWinningTeam === "tie" ? null : completedWinningTeam,
          final_team_0_score: result.nextState.matchScore["team-0"],
          final_team_1_score: result.nextState.matchScore["team-1"]
        },
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      }
    );
    if (gameCompleted) {
      recordTelemetryFailure(telemetryFailureStats, gameCompleted);
    }
  };

  try {
    const gameStarted = await persistEvent(
      { type: "game_started" },
      result.derivedView as unknown as JsonObject,
      {
        backendBaseUrl,
        telemetryEnabled: options.telemetryEnabled,
        ...(options.strictTelemetry !== undefined
          ? { strictTelemetry: options.strictTelemetry }
          : {}),
        ...(options.traceBackend !== undefined
          ? { traceBackend: options.traceBackend }
          : {}),
        ...(options.telemetryMode !== undefined
          ? { telemetryMode: options.telemetryMode }
          : {}),
        ...(options.telemetryMaxBytes !== undefined
          ? { telemetryMaxBytes: options.telemetryMaxBytes }
          : {}),
        ...telemetryTransportConfig(options),
        ...(telemetryManager ? { telemetryManager } : {}),
        ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
        gameId,
        handId: firstHandId,
        actorSeat: SYSTEM_ACTOR,
        eventIndex: eventIndex++,
        providerUsed: "system_local",
        requestedProvider: "system_local",
        metadata: buildLifecycleMetadata({
          handIndex: currentHandNumber,
          gameIndex,
          metadata: options.runMetadata
        }),
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      }
    );
    if (gameStarted) {
      recordTelemetryFailure(telemetryFailureStats, gameStarted);
    }

    gameLoop: while (true) {
      const handId = buildHandId(gameId, currentHandNumber);
      lastHandId = handId;
      if (!startedHands.has(currentHandNumber)) {
        startedHands.add(currentHandNumber);
        const handStarted = await persistEvent(
          { type: "hand_started", detail: handId },
          result.derivedView as unknown as JsonObject,
          {
            backendBaseUrl,
            telemetryEnabled: options.telemetryEnabled,
            ...(options.strictTelemetry !== undefined
              ? { strictTelemetry: options.strictTelemetry }
              : {}),
            ...(options.traceBackend !== undefined
              ? { traceBackend: options.traceBackend }
              : {}),
            ...(options.telemetryMode !== undefined
              ? { telemetryMode: options.telemetryMode }
              : {}),
            ...(options.telemetryMaxBytes !== undefined
              ? { telemetryMaxBytes: options.telemetryMaxBytes }
              : {}),
            ...telemetryTransportConfig(options),
            ...(telemetryManager ? { telemetryManager } : {}),
            ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
            gameId,
            handId,
            actorSeat: SYSTEM_ACTOR,
            eventIndex: eventIndex++,
            providerUsed: "system_local",
            requestedProvider: "system_local",
            metadata: buildLifecycleMetadata({
              handIndex: currentHandNumber,
              gameIndex,
              metadata: options.runMetadata
            }),
            ...(options.workerId ? { workerId: options.workerId } : {}),
            ...(options.controllerMode ? { controllerMode: true } : {})
          }
        );
        if (handStarted) {
          recordTelemetryFailure(telemetryFailureStats, handStarted);
        }
      }

      for (const event of result.events) {
        countByKey(eventsByPhase, result.nextState.phase);
        const currentEventIndex = eventIndex++;
        const telemetryResult = await persistEvent(
          event,
          result.derivedView as unknown as JsonObject,
          {
            backendBaseUrl,
            telemetryEnabled: options.telemetryEnabled,
            ...(options.strictTelemetry !== undefined
              ? { strictTelemetry: options.strictTelemetry }
              : {}),
            ...(options.traceBackend !== undefined
              ? { traceBackend: options.traceBackend }
              : {}),
            ...(options.telemetryMode !== undefined
              ? { telemetryMode: options.telemetryMode }
              : {}),
            ...(options.telemetryMaxBytes !== undefined
              ? { telemetryMaxBytes: options.telemetryMaxBytes }
              : {}),
            ...telemetryTransportConfig(options),
            ...(telemetryManager ? { telemetryManager } : {}),
            ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
            gameId,
            handId,
            actorSeat: SYSTEM_ACTOR,
            eventIndex: currentEventIndex,
            providerUsed: "system_local",
            requestedProvider: "system_local",
            metadata: buildLifecycleMetadata({
              handIndex: currentHandNumber,
              gameIndex,
              metadata: options.runMetadata
            }),
            ...(options.workerId ? { workerId: options.workerId } : {}),
            ...(options.controllerMode ? { controllerMode: true } : {})
          }
        );
        if (telemetryResult) {
          recordTelemetryFailure(telemetryFailureStats, telemetryResult);
          if (!telemetryResult.ok && telemetryResult.backoff_until) {
            telemetryBackoffUntil = telemetryResult.backoff_until;
          }
          emitTelemetryFailureDiagnostic(
            options,
            telemetryFailureTracker,
            telemetryResult,
            {
              game_id: gameId,
              hand_id: handId,
              phase: result.nextState.phase,
              event_index: currentEventIndex
            }
          );
        }
      }

      while (true) {
        if (
          options.maxDecisionsPerGame !== undefined &&
          decisionIndex >= options.maxDecisionsPerGame
        ) {
          stopReason = "max_steps_guard";
          stopDetails = {
            gameId,
            handId,
            handNumber: currentHandNumber,
            decisionIndex,
            maxDecisionsPerGame: options.maxDecisionsPerGame,
            phase: result.nextState.phase,
            activeSeat: result.nextState.activeSeat
          };
          break gameLoop;
        }

        const continuation = planSelfPlayContinuation({
          result,
          baseSeed: options.baseSeed,
          gameIndex: index,
          currentHandNumber
        });

        if (continuation.kind === "stop") {
          stopReason = continuation.stopReason;
          stopDetails = continuation.details;
          if (continuation.stopReason === "terminal_game_finished") {
            await persistHandCompleted(handId);
            await persistGameCompleted(handId);
          }
          break gameLoop;
        }

        if (continuation.kind === "next_hand") {
          await persistHandCompleted(handId);
          currentHandNumber = continuation.nextHandNumber;
          currentTrickIndex = 1;
          result = continuation.nextResult;
          lastPhase = result.nextState.phase;
          continue gameLoop;
        }

        const actor = continuation.actor;
        lastActor = String(actor);
        lastPhase = result.nextState.phase;

        let resolved: SimulatedDecision;
        try {
          resolved = await resolveDecision({
            backendBaseUrl,
            telemetryEnabled: options.telemetryEnabled,
            gameId,
            handId,
            actor,
            decisionIndex,
            stateRaw: result.nextState as unknown as JsonObject,
            stateNorm: result.derivedView as unknown as JsonObject,
            legalActions: result.legalActions,
            phase: result.nextState.phase,
            defaultProvider: options.defaultProvider,
            ...(options.seatProviders
              ? { seatProviders: options.seatProviders }
              : {}),
            ...(options.serverFallbackEnabled !== undefined
              ? { serverFallbackEnabled: options.serverFallbackEnabled }
              : {}),
            ...(options.strictTelemetry !== undefined
              ? { strictTelemetry: options.strictTelemetry }
              : {}),
            ...(options.traceBackend !== undefined
              ? { traceBackend: options.traceBackend }
              : {}),
            ...(options.telemetryMode !== undefined
              ? { telemetryMode: options.telemetryMode }
              : {}),
            ...(options.telemetryMaxBytes !== undefined
              ? { telemetryMaxBytes: options.telemetryMaxBytes }
              : {}),
            ...(telemetryManager ? { telemetryManager } : {}),
            ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
            ...telemetryTransportConfig(options),
            metadata: buildDecisionTelemetryMetadata({
              handId,
              handIndex: currentHandNumber,
              gameIndex,
              metadata: options.runMetadata,
              trickIndex:
                result.nextState.currentTrick !== null ||
                result.nextState.pendingDragonGift !== null
                  ? currentTrickIndex
                  : null
            }),
            ...(options.workerId ? { workerId: options.workerId } : {}),
            ...(options.controllerMode ? { controllerMode: true } : {}),
            ...(options.fullStateDecisionRequests !== undefined
              ? { fullStateDecisionRequests: options.fullStateDecisionRequests }
              : {})
          });
        } catch (error) {
          stopReason = "backend_error";
          stopDetails = {
            phase: result.nextState.phase,
            actor,
            decisionIndex,
            derivation: continuation.derivation,
            derivedFromLegalActions: continuation.derivedFromLegalActions,
            error: serializeError(error)
          };
          break gameLoop;
        }

        countByKey(providerUsage, resolved.providerUsed);
        countByKey(decisionsByPhase, result.nextState.phase);
        recordLatency(
          latencyByProvider,
          resolved.providerUsed,
          resolved.latencyMs
        );
        mergeTelemetryFailureStats(
          telemetryFailureStats,
          resolved.telemetryFailureStats
        );
        if (resolved.telemetryFailure) {
          if (
            !resolved.telemetryFailure.ok &&
            resolved.telemetryFailure.backoff_until
          ) {
            telemetryBackoffUntil = resolved.telemetryFailure.backoff_until;
          }
          emitTelemetryFailureDiagnostic(
            options,
            telemetryFailureTracker,
            resolved.telemetryFailure,
            {
              game_id: gameId,
              hand_id: handId,
              phase: result.nextState.phase,
              actor_seat: String(actor),
              decision_index: decisionIndex
            }
          );
        }
        if (resolved.fallbackUsed) {
          fallbackCount += 1;
        }

        lastActionType = resolved.chosenAction.type;
        const matchedLegalAction = findMatchingLegalAction(
          result.legalActions,
          actor,
          resolved.chosenAction
        );

        if (!matchedLegalAction) {
          invalidDecisions += 1;
          stopReason = "invalid_state";
          stopDetails = {
            phase: result.nextState.phase,
            actor,
            decisionIndex,
            chosenAction: resolved.chosenAction as unknown as JsonObject,
            ...summarizeLegalActors(result.legalActions)
          };
          break gameLoop;
        }

        if (matchedLegalAction.type === "pass_turn") {
          passActions += 1;
        }

        if (matchedLegalAction.type === "play_cards") {
          playActions += 1;
          const combination = getChosenCombination(matchedLegalAction);
          if (combination?.isBomb) {
            bombPlays += 1;
          }
          if (result.nextState.currentWish !== null) {
            wishActiveDecisions += 1;
            if (actionSatisfiesWish(result.nextState, matchedLegalAction)) {
              wishSatisfiedPlays += 1;
            }
          }
        }

        let nextResult: ReturnType<typeof applyEngineAction>;
        try {
          nextResult = applyEngineAction(result.nextState, resolved.chosenAction);
        } catch (error) {
          stopReason = "invalid_state";
          stopDetails = {
            phase: result.nextState.phase,
            actor,
            decisionIndex,
            chosenAction: resolved.chosenAction as unknown as JsonObject,
            error: serializeError(error)
          };
          break gameLoop;
        }

        for (const event of nextResult.events) {
          countByKey(eventsByPhase, nextResult.nextState.phase);
          const currentEventIndex = eventIndex++;
          const trickOutcomeMetadata = shouldAttachTrickOutcomeMetadata({
            event,
            stateBefore: result.nextState,
            stateAfter: nextResult.nextState
          })
            ? buildResolvedTrickMetadata({
                event,
                chosenAction: resolved.chosenAction,
                handId,
                handIndex: currentHandNumber,
                gameIndex,
                trickIndex: currentTrickIndex,
                stateBefore: result.nextState
              })
            : null;
          const telemetryResult = await persistEvent(
            event,
            nextResult.derivedView as unknown as JsonObject,
            {
              backendBaseUrl,
              telemetryEnabled: options.telemetryEnabled,
              ...(options.strictTelemetry !== undefined
                ? { strictTelemetry: options.strictTelemetry }
                : {}),
              ...(options.traceBackend !== undefined
                ? { traceBackend: options.traceBackend }
                : {}),
              ...(options.telemetryMode !== undefined
                ? { telemetryMode: options.telemetryMode }
                : {}),
              ...(options.telemetryMaxBytes !== undefined
                ? { telemetryMaxBytes: options.telemetryMaxBytes }
                : {}),
              ...telemetryTransportConfig(options),
              ...(telemetryManager ? { telemetryManager } : {}),
              ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
              gameId,
              handId,
              actorSeat: actor,
              eventIndex: currentEventIndex,
              providerUsed: resolved.providerUsed,
              requestedProvider: resolved.requestedProvider,
              metadata: {
                ...buildLifecycleMetadata({
                  handIndex: currentHandNumber,
                  gameIndex,
                  metadata: options.runMetadata
                }),
                ...(trickOutcomeMetadata ?? {})
              },
              ...(options.workerId ? { workerId: options.workerId } : {}),
              ...(options.controllerMode ? { controllerMode: true } : {})
            }
          );
          if (telemetryResult) {
            recordTelemetryFailure(telemetryFailureStats, telemetryResult);
            if (!telemetryResult.ok && telemetryResult.backoff_until) {
              telemetryBackoffUntil = telemetryResult.backoff_until;
            }
            emitTelemetryFailureDiagnostic(
              options,
              telemetryFailureTracker,
              telemetryResult,
              {
                game_id: gameId,
                hand_id: handId,
                phase: nextResult.nextState.phase,
                actor_seat: String(actor),
                event_index: currentEventIndex
              }
            );
          }
          if (
            trickOutcomeMetadata &&
            (event.type === "trick_resolved" ||
              event.type === "phase_changed" ||
              event.type === "dragon_trick_assigned")
          ) {
            currentTrickIndex += 1;
          }
        }

        result = nextResult;
        lastPhase = result.nextState.phase;
        decisionIndex += 1;
      }
    }
  } finally {
    if (telemetryManager) {
      const flushTimeoutMs =
        options.strictTelemetry === true
          ? Math.max(options.telemetryTimeoutMs ?? 10_000, 1_000)
          : Math.max(50, Math.min(options.telemetryTimeoutMs ?? 250, 250));
      await telemetryManager.flush(flushTimeoutMs);
      const telemetrySnapshot = telemetryManager.snapshot();
      mergeTelemetryFailureStats(
        telemetryFailureStats,
        telemetrySnapshot.stats
      );
      if (telemetrySnapshot.telemetryBackoffUntil) {
        telemetryBackoffUntil = telemetrySnapshot.telemetryBackoffUntil;
      }
      telemetryRuntimeState = telemetrySnapshot.runtimeState;
      options.onTelemetryRuntimeState?.(telemetrySnapshot.runtimeState);
    }
  }

  if (stopReason === null) {
    stopReason = "invalid_state";
    stopDetails = {
      phase: result.nextState.phase,
      message: "Self-play exited without an explicit stop reason."
    };
  }

  emitDecisionDiagnostic(options, "selfplay_stop", {
    game_id: gameId,
    hand_id: lastHandId,
    hand_number: currentHandNumber,
    stop_reason: stopReason,
    last_phase: lastPhase,
    last_actor: lastActor,
    last_action_type: lastActionType,
    ...stopDetails
  });

  const handsPlayed = startedHands.size;
  const teamScores = cloneTeamScores(result.nextState.matchScore);
  const historyMetrics = summarizeMatchHistory(result.nextState.matchHistory);
  const scoreMargin = Math.abs(teamScores["team-0"] - teamScores["team-1"]);
  const winningTeam =
    teamScores["team-0"] === teamScores["team-1"]
      ? "tie"
      : teamScores["team-0"] > teamScores["team-1"]
        ? "team-0"
        : "team-1";

  return {
    gameId,
    handId: lastHandId,
    firstHandId,
    lastHandId,
    handsPlayed,
    decisions: decisionIndex,
    events: eventIndex,
    durationMs: Date.now() - startedAt,
    providerUsage,
    fallbackCount,
    decisionsByPhase,
    eventsByPhase,
    teamScores,
    winningTeam,
    handWinCountsByTeam: historyMetrics.handWinCountsByTeam,
    doubleVictoryCountsByTeam: historyMetrics.doubleVictoryCountsByTeam,
    tichuCalls: historyMetrics.tichuCalls,
    tichuSuccesses: historyMetrics.tichuSuccesses,
    grandTichuCalls: historyMetrics.grandTichuCalls,
    grandTichuSuccesses: historyMetrics.grandTichuSuccesses,
    matchComplete: result.nextState.matchComplete,
    matchWinner: result.nextState.matchWinner,
    scoreMargin,
    passActions,
    playActions,
    bombPlays,
    wishSatisfiedPlays,
    wishActiveDecisions,
    invalidDecisions,
    ...telemetryFailureStats,
    telemetryBackoffUntil,
    telemetryRuntime: telemetryRuntimeState,
    stopReason,
    stopDetails,
    lastPhase,
    lastActor,
    lastActionType,
    latencyByProvider: summarizeLatency(latencyByProvider)
  };
}

function mergeCounts(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export async function runSelfPlayBatchDetailed(
  options: SelfPlayBatchOptions
): Promise<SelfPlayBatchDetailedResult> {
  const backendBaseUrl = normalizeBackendBaseUrl(
    options.backendBaseUrl ?? "http://localhost:4310"
  );
  const requestedProviders = new Set<DecisionMode>([
    options.defaultProvider,
    ...Object.values(options.seatProviders ?? {}).filter(
      (provider): provider is DecisionMode => provider !== undefined
    )
  ]);

  const usesBackendProvider = [...requestedProviders].some(
    (provider) => provider !== "local"
  );
  if (options.telemetryEnabled || usesBackendProvider) {
    try {
      await verifyBackend(backendBaseUrl, {
        ...(options.traceBackend ? { traceBackend: true } : {}),
        ...(options.quiet ? { quiet: true } : {}),
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      });
    } catch (error) {
      const telemetryRequiresBackend = false;
      const providerRequiresBackend =
        usesBackendProvider && options.serverFallbackEnabled === false;
      if (telemetryRequiresBackend || providerRequiresBackend) {
        throw error;
      }
      emitDecisionDiagnostic(options, "backend_health_check_failure", {
        fallback_allowed: true,
        fallback_used: usesBackendProvider,
        telemetry_degraded: options.telemetryEnabled,
        error: serializeError(error)
      });
    }
  }

  const summary: SelfPlayBatchSummary = {
    gamesPlayed: 0,
    handsPlayed: 0,
    decisionsRecorded: 0,
    eventsRecorded: 0,
    decisionsEvaluated: 0,
    decisionsByPhase: {},
    eventsByPhase: {},
    providerUsage: {},
    fallbackCount: 0,
    errors: 0,
    maxDecisionLimitHit: 0,
    averageGameDurationMs: 0,
    averageDecisionsPerHand: 0,
    exchangePhaseRecorded: false,
    passSelectRecorded: false,
    winCountsByTeam: {
      "team-0": 0,
      "team-1": 0,
      tie: 0
    },
    handWinCountsByTeam: {
      "team-0": 0,
      "team-1": 0,
      tie: 0
    },
    totalScoreByTeam: createTeamScoreBucket(),
    averageScoreMargin: 0,
    passRate: 0,
    bombUsageRate: 0,
    wishSatisfactionRate: null,
    tichuCallRate: null,
    tichuSuccessRate: null,
    grandTichuCallRate: null,
    grandTichuSuccessRate: null,
    doubleVictoryRate: null,
    doubleVictoryCountsByTeam: createTeamScoreBucket(),
    lastCompletedGameId: null,
    lastCompletedHandId: null,
    lastCompletedMatchWinner: null,
    lastCompletedMatchScore: createTeamScoreBucket(),
    invalidDecisionCount: 0,
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {},
    telemetryFailureByKind: {},
    telemetryBackoffUntil: null,
    telemetryRuntime: null,
    averageLatencyByProvider: {}
  };

  let totalDuration = 0;
  let totalScoreMargin = 0;
  let totalPassActions = 0;
  let totalPlayActions = 0;
  let totalBombPlays = 0;
  let totalWishSatisfiedPlays = 0;
  let totalWishActiveDecisions = 0;
  let totalTichuCalls = 0;
  let totalTichuSuccesses = 0;
  let totalGrandTichuCalls = 0;
  let totalGrandTichuSuccesses = 0;
  const latencyTotals: Record<string, { count: number; totalMs: number }> = {};
  const games: SelfPlayGameResult[] = [];

  for (let index = 0; index < options.games; index += 1) {
    try {
      const game = await runSingleGame(index, options, backendBaseUrl);
      games.push(game);
      summary.gamesPlayed += 1;
      summary.handsPlayed += game.handsPlayed;
      summary.decisionsRecorded += game.decisions;
      summary.eventsRecorded += game.events;
      summary.decisionsEvaluated += game.decisions;
      summary.fallbackCount += game.fallbackCount;
      if (game.stopReason === "terminal_game_finished") {
        summary.lastCompletedGameId = game.gameId;
        summary.lastCompletedHandId = game.lastHandId;
        summary.lastCompletedMatchWinner = game.winningTeam;
        summary.lastCompletedMatchScore = cloneTeamScores(game.teamScores);
      }
      summary.invalidDecisionCount += game.invalidDecisions;
      summary.telemetryDecisionFailures += game.telemetryDecisionFailures;
      summary.telemetryEventFailures += game.telemetryEventFailures;
      summary.telemetryFailuresTotal += game.telemetryFailuresTotal;
      summary.telemetryBackoffUntil =
        game.telemetryBackoffUntil ?? summary.telemetryBackoffUntil;
      if (game.telemetryRuntime !== null) {
        summary.telemetryRuntime = game.telemetryRuntime;
      }
      mergeCounts(
        summary.telemetryFailureByEndpoint,
        game.telemetryFailureByEndpoint
      );
      mergeCounts(summary.telemetryFailureByKind, game.telemetryFailureByKind);
      totalDuration += game.durationMs;
      totalScoreMargin += game.scoreMargin;
      totalPassActions += game.passActions;
      totalPlayActions += game.playActions;
      totalBombPlays += game.bombPlays;
      totalWishSatisfiedPlays += game.wishSatisfiedPlays;
      totalWishActiveDecisions += game.wishActiveDecisions;
      totalTichuCalls += game.tichuCalls;
      totalTichuSuccesses += game.tichuSuccesses;
      totalGrandTichuCalls += game.grandTichuCalls;
      totalGrandTichuSuccesses += game.grandTichuSuccesses;
      mergeCounts(summary.decisionsByPhase, game.decisionsByPhase);
      mergeCounts(summary.eventsByPhase, game.eventsByPhase);
      mergeCounts(summary.providerUsage, game.providerUsage);
      mergeCounts(summary.totalScoreByTeam, game.teamScores);
      mergeCounts(summary.handWinCountsByTeam, game.handWinCountsByTeam);
      mergeCounts(
        summary.doubleVictoryCountsByTeam,
        game.doubleVictoryCountsByTeam
      );
      countByKey(summary.winCountsByTeam, game.winningTeam);
      if (game.stopReason !== "terminal_game_finished") {
        summary.errors += 1;
      }
      if (game.stopReason === "max_steps_guard") {
        summary.maxDecisionLimitHit += 1;
      }
      summary.exchangePhaseRecorded =
        summary.exchangePhaseRecorded ||
        game.decisionsByPhase.pass_select !== undefined ||
        game.eventsByPhase.exchange_complete !== undefined ||
        game.eventsByPhase.pass_reveal !== undefined;
      summary.passSelectRecorded =
        summary.passSelectRecorded ||
        game.decisionsByPhase.pass_select !== undefined;
      for (const [provider, metrics] of Object.entries(
        game.latencyByProvider
      )) {
        const bucket = latencyTotals[provider] ?? { count: 0, totalMs: 0 };
        bucket.count += metrics.count;
        bucket.totalMs += metrics.totalMs;
        latencyTotals[provider] = bucket;
      }

      if (!options.quiet && options.progress) {
        console.log(
          JSON.stringify({
            game: index + 1,
            game_id: game.gameId,
            decisions: game.decisions,
            events: game.events,
            duration_ms: game.durationMs,
            stop_reason: game.stopReason
          })
        );
      }
    } catch (error) {
      summary.errors += 1;
      if (error instanceof MaxDecisionLimitError) {
        summary.maxDecisionLimitHit += 1;
        summary.decisionsEvaluated += error.decisionsEvaluated;
        summary.handsPlayed += error.handsPlayed;
      }
      if (shouldEmitDiagnostic(options)) {
        const gameId = buildGameId({
          baseSeed: options.baseSeed,
          index,
          gameIdPrefix: options.gameIdPrefix
        });
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "game_error",
            game: index + 1,
            game_id: gameId,
            error: serializeError(error)
          })
        );
      }
    }
  }

  summary.averageGameDurationMs =
    summary.gamesPlayed > 0
      ? Math.round(totalDuration / summary.gamesPlayed)
      : 0;
  summary.averageDecisionsPerHand =
    summary.handsPlayed > 0
      ? Number((summary.decisionsRecorded / summary.handsPlayed).toFixed(2))
      : 0;
  summary.averageScoreMargin =
    summary.gamesPlayed > 0
      ? Number((totalScoreMargin / summary.gamesPlayed).toFixed(2))
      : 0;
  summary.passRate =
    totalPassActions + totalPlayActions > 0
      ? Number(
          (totalPassActions / (totalPassActions + totalPlayActions)).toFixed(4)
        )
      : 0;
  summary.bombUsageRate =
    totalPlayActions > 0
      ? Number((totalBombPlays / totalPlayActions).toFixed(4))
      : 0;
  summary.wishSatisfactionRate =
    totalWishActiveDecisions > 0
      ? Number((totalWishSatisfiedPlays / totalWishActiveDecisions).toFixed(4))
      : null;
  summary.tichuCallRate =
    summary.handsPlayed > 0
      ? Number((totalTichuCalls / summary.handsPlayed).toFixed(4))
      : null;
  summary.tichuSuccessRate =
    totalTichuCalls > 0
      ? Number((totalTichuSuccesses / totalTichuCalls).toFixed(4))
      : null;
  summary.grandTichuCallRate =
    summary.handsPlayed > 0
      ? Number((totalGrandTichuCalls / summary.handsPlayed).toFixed(4))
      : null;
  summary.grandTichuSuccessRate =
    totalGrandTichuCalls > 0
      ? Number((totalGrandTichuSuccesses / totalGrandTichuCalls).toFixed(4))
      : null;
  summary.doubleVictoryRate =
    summary.handsPlayed > 0
      ? Number(
          (
            (summary.doubleVictoryCountsByTeam["team-0"] +
              summary.doubleVictoryCountsByTeam["team-1"]) /
            summary.handsPlayed
          ).toFixed(4)
        )
      : null;
  summary.averageLatencyByProvider = Object.fromEntries(
    Object.entries(latencyTotals).map(([provider, metrics]) => [
      provider,
      metrics.count > 0
        ? Number((metrics.totalMs / metrics.count).toFixed(2))
        : 0
    ])
  );

  return {
    summary,
    games
  };
}

export async function runSelfPlayBatch(
  options: SelfPlayBatchOptions
): Promise<SelfPlayBatchSummary> {
  const detailed = await runSelfPlayBatchDetailed(options);
  return detailed.summary;
}
