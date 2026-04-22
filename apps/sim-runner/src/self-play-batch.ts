import {
  heuristicsV1Policy,
  type ChosenDecision
} from "@tichuml/ai-heuristics";
import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  TELEMETRY_EVENT_PATH,
  TELEMETRY_DECISION_PATH,
  normalizeBackendBaseUrl,
  extractActorScopedLegalActions,
  type DecisionMode,
  type DecisionProviderUsed,
  type DecisionRequestPayload,
  type DecisionResponsePayload,
  type JsonObject,
  type SeedJsonValue,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  applyEngineAction,
  createInitialGameState,
  getActorScopedLegalActions,
  getCanonicalActiveSeatFromState,
  SEAT_IDS,
  SYSTEM_ACTOR,
  validateLegalActionsForCanonicalActor,
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
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION
} from "@tichuml/telemetry";

export type SeatProviderOverrides = Partial<Record<SeatId, DecisionMode>>;
export type TelemetryMode = "minimal" | "full";

const DEFAULT_TELEMETRY_MAX_BYTES = 450 * 1024;

export type SelfPlayBatchOptions = {
  games: number;
  baseSeed: string;
  defaultProvider: DecisionMode;
  seatProviders?: SeatProviderOverrides;
  telemetryEnabled: boolean;
  serverFallbackEnabled?: boolean;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
  backendBaseUrl?: string;
  quiet?: boolean;
  progress?: boolean;
  maxDecisionsPerGame?: number;
  workerId?: string;
  controllerMode?: boolean;
};

export type SelfPlayGameResult = {
  gameId: string;
  handId: string;
  decisions: number;
  events: number;
  durationMs: number;
  providerUsage: Record<string, number>;
  fallbackCount: number;
  decisionsByPhase: Record<string, number>;
  eventsByPhase: Record<string, number>;
  teamScores: Record<TeamId, number>;
  winningTeam: TeamId | "tie";
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
  latencyByProvider: Record<string, { count: number; totalMs: number; averageMs: number }>;
};

export type SelfPlayBatchSummary = {
  gamesPlayed: number;
  handsPlayed: number;
  decisionsRecorded: number;
  eventsRecorded: number;
  decisionsByPhase: Record<string, number>;
  eventsByPhase: Record<string, number>;
  providerUsage: Record<string, number>;
  fallbackCount: number;
  errors: number;
  averageGameDurationMs: number;
  averageDecisionsPerHand: number;
  exchangePhaseRecorded: boolean;
  passSelectRecorded: boolean;
  winCountsByTeam: Record<TeamId | "tie", number>;
  totalScoreByTeam: Record<TeamId, number>;
  averageScoreMargin: number;
  passRate: number;
  bombUsageRate: number;
  wishSatisfactionRate: number | null;
  invalidDecisionCount: number;
  telemetryDecisionFailures: number;
  telemetryEventFailures: number;
  telemetryFailuresTotal: number;
  telemetryFailureByEndpoint: Record<string, number>;
  averageLatencyByProvider: Record<string, number>;
};

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
  quiet?: boolean;
  workerId?: string;
  controllerMode?: boolean;
};

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
  payload_summary?: JsonObject;
};

type BackendRequestResult = {
  status: number;
  payload: JsonObject;
  raw_body?: string;
  latency_ms: number;
};

type TelemetryWriteResult =
  | {
      ok: true;
      endpoint: string;
      method: string;
      request_kind: "telemetry_decision" | "telemetry_event";
      status: number;
      latency_ms: number;
    }
  | {
      ok: false;
      endpoint: string;
      method: string;
      request_kind: "telemetry_decision" | "telemetry_event";
      failure_kind: BackendFailureKind;
      status?: number;
      message: string;
      body?: JsonObject;
      raw_body?: string;
      cause?: string;
      latency_ms?: number;
      payload_bytes?: number;
      max_bytes?: number;
    };

type TelemetryFailureStats = {
  telemetryDecisionFailures: number;
  telemetryEventFailures: number;
  telemetryFailuresTotal: number;
  telemetryFailureByEndpoint: Record<string, number>;
};

type TelemetryFailureTracker = {
  emittedDetailedFailures: number;
  compactedFailures: number;
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

function createTelemetryFailureStats(): TelemetryFailureStats {
  return {
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {}
  };
}

function mergeTelemetryFailureStats(
  target: TelemetryFailureStats,
  source: TelemetryFailureStats
): void {
  target.telemetryDecisionFailures += source.telemetryDecisionFailures;
  target.telemetryEventFailures += source.telemetryEventFailures;
  target.telemetryFailuresTotal += source.telemetryFailuresTotal;
  mergeCounts(target.telemetryFailureByEndpoint, source.telemetryFailureByEndpoint);
}

function recordTelemetryFailure(
  stats: TelemetryFailureStats,
  result: TelemetryWriteResult
): void {
  if (result.ok) {
    return;
  }
  if (result.request_kind === "telemetry_decision") {
    stats.telemetryDecisionFailures += 1;
  } else {
    stats.telemetryEventFailures += 1;
  }
  stats.telemetryFailuresTotal += 1;
  countByKey(stats.telemetryFailureByEndpoint, result.endpoint);
}

function createTeamScoreBucket(): Record<TeamId, number> {
  return {
    "team-0": 0,
    "team-1": 0
  };
}

function cloneTeamScores(source?: Record<TeamId, number> | null): Record<TeamId, number> {
  return {
    "team-0": source?.["team-0"] ?? 0,
    "team-1": source?.["team-1"] ?? 0
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

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function resolveTelemetryMaxBytes(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : DEFAULT_TELEMETRY_MAX_BYTES;
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
            sortCardIds(candidate.cardIds) === sortCardIds(chosenAction.cardIds) &&
            candidate.phoenixAsRank === chosenAction.phoenixAsRank
          );
        case "select_pass":
          return chosenAction.type === "select_pass" && candidate.seat === chosenAction.seat;
        case "assign_dragon_trick":
          return (
            chosenAction.type === "assign_dragon_trick" &&
            candidate.recipient === chosenAction.recipient
          );
        case "advance_phase":
          return chosenAction.type === "advance_phase" && candidate.actor === chosenAction.actor;
        default:
          return true;
      }
    }) ?? null
  );
}

function getChosenCombination(legalAction: LegalAction | null): Combination | null {
  return legalAction?.type === "play_cards" ? legalAction.combination : null;
}

function actionSatisfiesWish(state: GameState, legalAction: LegalAction | null): boolean {
  if (!state.currentWish || legalAction?.type !== "play_cards") {
    return false;
  }

  const actualRanks = legalAction.combination.actualRanks;
  if (Array.isArray(actualRanks) && actualRanks.includes(state.currentWish)) {
    return true;
  }

  return legalAction.combination.primaryRank === state.currentWish;
}

function summarizeCurrentCombination(state: GameState): JsonObject | null {
  const combination = state.currentTrick?.currentCombination;
  return combination
    ? {
        kind: combination.kind,
        primaryRank: combination.primaryRank,
        cardCount: combination.cardCount,
        isBomb: combination.isBomb
      }
    : null;
}

function buildDecisionContextMetadata(
  state: GameState,
  actorLegalActions: SeedJsonValue[],
  latencyMs: number
): JsonObject {
  const wishActive = state.currentWish !== null;
  const wishSatisfiable =
    wishActive &&
    actorLegalActions.some(
      (action) =>
        typeof action === "object" &&
        action !== null &&
        "combination" in action &&
        typeof action.combination === "object" &&
        action.combination !== null &&
        ((action.combination as JsonObject).primaryRank === state.currentWish ||
          (Array.isArray((action.combination as JsonObject).actualRanks) &&
            ((action.combination as JsonObject).actualRanks as SeedJsonValue[]).includes(
              state.currentWish
            )))
    );

  return {
    seed: state.seed,
    latency_ms: latencyMs,
    current_lead_seat: state.currentTrick?.currentWinner ?? null,
    current_combination: summarizeCurrentCombination(state),
    wish_active: wishActive,
    current_wish: state.currentWish,
    wish_satisfiable: wishSatisfiable,
    active_wish_no_legal_fulfilling_move: wishActive && !wishSatisfiable
  };
}

function buildCompactDecisionMetadata(config: {
  stateRaw: GameState;
  actorLegalActions: SeedJsonValue[];
  latencyMs: number;
  telemetryMode: TelemetryMode;
}): JsonObject {
  const detail = buildDecisionContextMetadata(
    config.stateRaw,
    config.actorLegalActions,
    config.latencyMs
  );
  return {
    telemetry_mode: config.telemetryMode,
    latency_ms: detail.latency_ms ?? null,
    current_lead_seat: detail.current_lead_seat ?? null,
    current_combination: detail.current_combination ?? null,
    wish_active: detail.wish_active ?? false,
    current_wish: detail.current_wish ?? null,
    wish_satisfiable: detail.wish_satisfiable ?? false,
    legal_action_count: config.actorLegalActions.length
  };
}

function buildControllerMetadata(config: {
  workerId?: string;
  controllerMode?: boolean;
}): JsonObject {
  return {
    ...(config.workerId ? { worker_id: config.workerId } : {}),
    ...(config.controllerMode ? { controller_mode: true } : {})
  };
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

function shouldEmitDiagnostic(config: { quiet?: boolean; controllerMode?: boolean }): boolean {
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
  console.error(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

function traceBackendRequest(
  context: BackendRequestContext,
  event: "backend_request_start" | "backend_request_success" | "backend_request_failure",
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
      ...(context.decision_index !== undefined ? { decision_index: context.decision_index } : {}),
      ...(context.event_index !== undefined ? { event_index: context.event_index } : {}),
      ...(context.requested_provider ? { requested_provider: context.requested_provider } : {}),
      ...(context.payload_summary ? { payload_summary: context.payload_summary } : {}),
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
        has_state_raw: typeof body.state_raw === "object" && body.state_raw !== null,
        has_state_norm: typeof body.state_norm === "object" && body.state_norm !== null,
        legal_action_keys:
          typeof body.legal_actions === "object" && body.legal_actions !== null
            ? Object.keys(body.legal_actions as Record<string, unknown>)
            : []
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

function normalizeTelemetryFailureResult(
  endpoint: string,
  requestKind: "telemetry_decision" | "telemetry_event",
  error: unknown
): TelemetryWriteResult {
  if (error instanceof BackendRequestFailure) {
    const status =
      typeof error.details.status === "number" ? error.details.status : undefined;
    const body =
      typeof error.details.body === "object" &&
      error.details.body !== null &&
      !Array.isArray(error.details.body)
        ? (error.details.body as JsonObject)
        : undefined;
    const rawBody =
      typeof error.details.raw_body === "string" ? error.details.raw_body : undefined;
    const cause =
      typeof error.details.cause === "string" ? error.details.cause : undefined;
    const latencyMs =
      typeof error.details.latency_ms === "number" ? error.details.latency_ms : undefined;
    return {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: requestKind,
      failure_kind: error.kind,
      ...(status !== undefined ? { status } : {}),
      message: error.message,
      ...(body ? { body } : {}),
      ...(rawBody ? { raw_body: rawBody } : {}),
      ...(cause ? { cause } : {}),
      ...(latencyMs !== undefined ? { latency_ms: latencyMs } : {})
    };
  }

  return {
    ok: false,
    endpoint,
    method: "POST",
    request_kind: requestKind,
    failure_kind: "unexpected_failure",
    message: error instanceof Error ? error.message : String(error),
    cause: error instanceof Error ? error.name : "unknown"
  };
}

function emitTelemetryFailure(
  config: { quiet?: boolean; controllerMode?: boolean },
  tracker: TelemetryFailureTracker,
  result: TelemetryWriteResult,
  context: JsonObject
): void {
  if (result.ok || !shouldEmitDiagnostic(config)) {
    return;
  }
  const detailed = tracker.emittedDetailedFailures < 3;
  if (detailed) {
    tracker.emittedDetailedFailures += 1;
  } else {
    tracker.compactedFailures += 1;
  }
  const payload: JsonObject = {
    request_kind: result.request_kind,
    failure_kind: result.failure_kind,
    endpoint: result.endpoint,
    method: result.method,
    message: result.message,
    compact: !detailed,
    suppressed_after_threshold: tracker.compactedFailures,
    ...context
  };
  if (detailed) {
    if (result.status !== undefined) {
      payload.status = result.status;
    }
    if (result.body) {
      payload.body = result.body;
    }
    if (result.raw_body) {
      payload.raw_body = result.raw_body;
    }
    if (result.cause) {
      payload.cause = result.cause;
    }
    if (result.payload_bytes !== undefined) {
      payload.payload_bytes = result.payload_bytes;
    }
    if (result.max_bytes !== undefined) {
      payload.max_bytes = result.max_bytes;
    }
  }
  emitDecisionDiagnostic(config, "telemetry_persistence_failure", payload);
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

function buildGameId(baseSeed: string, index: number): string {
  return `selfplay-${baseSeed}-game-${String(index + 1).padStart(6, "0")}`;
}

function buildHandId(gameId: string): string {
  return `${gameId}-hand-1`;
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

function resolveNextActor(
  legalActions: LegalActionMap,
  state: GameState
): SeatId | typeof SYSTEM_ACTOR {
  if (getActorLegalActions(legalActions, SYSTEM_ACTOR).length > 0) {
    return SYSTEM_ACTOR;
  }

  try {
    const canonicalActor = getCanonicalActiveSeatFromState(state);
    if (getActorLegalActions(legalActions, canonicalActor).length > 0) {
      return canonicalActor;
    }
  } catch {
    // Non-seat phases are system-owned. If no system action exists, fall back to
    // the stable absolute engine seat order, never a presentation rotation.
  }

  for (const seat of SEAT_IDS) {
    if (getActorLegalActions(legalActions, seat).length > 0) {
      return seat;
    }
  }

  throw new Error("No legal actor was available for the next self-play decision.");
}

export function validateServerHeuristicDecisionRequestContract(
  request: DecisionRequestPayload
): void {
  if (
    typeof request.state_raw !== "object" ||
    request.state_raw === null ||
    !("phase" in request.state_raw) ||
    !("hands" in request.state_raw) ||
    !("activeSeat" in request.state_raw)
  ) {
    throw new Error(
      [
        "[server_heuristic] refusing incomplete request: full state_raw is required",
        `game_id=${request.game_id}`,
        `hand_id=${request.hand_id}`,
        `phase=${request.phase}`,
        "missing=[state_raw.phase, state_raw.hands, state_raw.activeSeat]"
      ].join("; ")
    );
  }

  const canonicalActorSeat = getCanonicalActiveSeatFromState(request.state_raw);
  const phase = request.state_raw?.phase;
  const legalActions = request.legal_actions as unknown as LegalActionMap;
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

  if (typeof config.stateRaw !== "object" || config.stateRaw === null) {
    missingFields.push("state_raw");
  } else {
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
      ? ({ [SYSTEM_ACTOR]: config.legalActions[SYSTEM_ACTOR] ?? [] } as LegalActionMap)
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
  if (config.stateRaw.phase !== config.phase) {
    issues.push(`phase mismatch: request=${config.phase}, state_raw=${String(config.stateRaw.phase)}`);
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
  workerId?: string;
  controllerMode?: boolean;
}): DecisionRequestPayload {
  const actorSeat = getCanonicalActiveSeatFromState(config.stateRaw);
  const payload: DecisionRequestPayload = {
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: actorSeat,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    state_raw: config.stateRaw,
    state_norm: config.stateNorm,
    legal_actions: config.legalActions as unknown as JsonObject,
    requested_provider: config.requestedProvider,
    metadata: {
      decision_index: config.decisionIndex,
      simulation_mode: true,
      ...buildControllerMetadata({
        ...(config.workerId ? { workerId: config.workerId } : {}),
        ...(config.controllerMode ? { controllerMode: true } : {})
      })
    } as JsonObject
  };

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
    ...(context?.decision_index !== undefined ? { decision_index: context.decision_index } : {}),
    ...(context?.event_index !== undefined ? { event_index: context.event_index } : {}),
    ...(context?.requested_provider ? { requested_provider: context.requested_provider } : {}),
    ...(context?.trace_backend ? { trace_backend: true } : {}),
    ...(context?.quiet ? { quiet: true } : {}),
    payload_summary: summarizeBackendPayload(context?.request_kind ?? "decision", body)
  };
  const startedAt = Date.now();
  traceBackendRequest(requestContext, "backend_request_start", {});
  const init: RequestInit = { method };
  if (body) {
    init.headers = {
      "content-type": "application/json"
    };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: "network_failure",
      latency_ms: latencyMs,
      message,
      cause: error instanceof Error ? error.name : "unknown"
    });
    throw new BackendRequestFailure(
      "network_failure",
      `Request to ${url} failed before receiving a response: ${message}`,
      {
        method,
        url,
        request_kind: requestContext.request_kind,
        latency_ms: latencyMs,
        cause: message
      }
    );
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: "unexpected_failure",
      latency_ms: latencyMs,
      status: response.status,
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

  let payload: JsonObject = {};
  let rawBody: string | undefined;
  if (responseText.length > 0) {
    try {
      payload = JSON.parse(responseText) as JsonObject;
    } catch {
      rawBody = responseText;
      payload = {};
    }
  }
  const latencyMs = Date.now() - startedAt;
  if (!response.ok) {
    traceBackendRequest(requestContext, "backend_request_failure", {
      failure_kind: "backend_rejection",
      latency_ms: latencyMs,
      status: response.status,
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
        ...(Object.keys(payload).length > 0 ? { body: payload } : {}),
        ...(rawBody ? { raw_body: rawBody } : {})
      }
    );
  }
  traceBackendRequest(requestContext, "backend_request_success", {
    latency_ms: latencyMs,
    status: response.status
  });
  return {
    status: response.status,
    payload,
    ...(rawBody ? { raw_body: rawBody } : {}),
    latency_ms: latencyMs
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
    ...(options.traceBackend ? { trace_backend: true } : {}),
    ...(options.quiet ? { quiet: true } : {}),
    ...(options.workerId ? { worker_id: options.workerId } : {}),
    ...(options.controllerMode ? { controller_mode: true } : {})
  });
}

function buildLocalDecisionTelemetry(config: {
  gameId: string;
  handId: string;
  phase: string;
  actorSeat: SeatId | typeof SYSTEM_ACTOR;
  decisionIndex: number;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  chosen: ChosenDecision;
  requestedProvider: DecisionMode | "system_local";
  fallbackUsed?: boolean;
  fallbackReason?: string;
  latencyMs: number;
  telemetryMode?: TelemetryMode;
  workerId?: string;
  controllerMode?: boolean;
}): TelemetryDecisionPayload {
  const providerUsed =
    config.actorSeat === SYSTEM_ACTOR ? "system_local" : "local_heuristic";
  const fallbackUsed = config.fallbackUsed === true;
  const telemetryMode = config.telemetryMode ?? "minimal";
  const fullTelemetry = telemetryMode === "full";
  const explanation = fullTelemetry
    ? (config.chosen.explanation as unknown as JsonObject)
    : null;
  const actorLegalActions = extractActorScopedLegalActions(
    config.legalActions as unknown as JsonObject,
    String(config.actorSeat)
  );
  const compactMetadata = buildCompactDecisionMetadata({
    stateRaw: config.stateRaw as unknown as GameState,
    actorLegalActions,
    latencyMs: config.latencyMs,
    telemetryMode
  });

  return {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: String(config.actorSeat),
    decision_index: config.decisionIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    requested_provider: config.requestedProvider,
    provider_used: providerUsed,
    fallback_used: fallbackUsed,
    policy_name: heuristicsV1Policy.name,
    policy_source: providerUsed,
    state_raw: fullTelemetry ? config.stateRaw : {},
    state_norm: fullTelemetry ? config.stateNorm : null,
    legal_actions: fullTelemetry ? actorLegalActions : [config.chosen.action],
    chosen_action: config.chosen.action as unknown as JsonObject,
    explanation,
    candidateScores: fullTelemetry
      ? (config.chosen.explanation.candidateScores as unknown as JsonObject[])
      : null,
    stateFeatures: fullTelemetry
      ? config.chosen.explanation.stateFeatures === undefined
        ? null
        : (config.chosen.explanation.stateFeatures as unknown as JsonObject)
      : compactMetadata,
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: providerUsed,
      fallback_used: fallbackUsed,
      ...(config.fallbackReason ? { fallback_reason: config.fallbackReason } : {}),
      simulation_mode: true,
      ...buildControllerMetadata(config),
      ...compactMetadata,
      ...(fullTelemetry ? { explanation: config.chosen.explanation } : {})
    },
    antipattern_tags: fullTelemetry ? config.chosen.explanation.selectedTags : []
  };
}

function extractActorSeatFromEvent(
  event: EngineEvent,
  fallbackActor: SeatId | typeof SYSTEM_ACTOR
): SeatId | null {
  const candidate =
    "seat" in event && typeof event.seat === "string"
      ? event.seat
      : "actor" in event && typeof event.actor === "string" && event.actor.startsWith("seat-")
        ? event.actor
        : fallbackActor !== SYSTEM_ACTOR
          ? fallbackActor
          : null;
  return candidate && candidate.startsWith("seat-") ? (candidate as SeatId) : null;
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
  const endpoint = `${config.backendBaseUrl}${TELEMETRY_DECISION_PATH}`;
  const payloadBytes = jsonByteLength(config.payload);
  const maxBytes = resolveTelemetryMaxBytes(config.maxBytes);
  if (payloadBytes > maxBytes) {
    return {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: "telemetry_decision",
      failure_kind: "backend_rejection",
      message: `Telemetry decision payload skipped locally because it is ${payloadBytes} bytes and exceeds ${maxBytes} bytes.`,
      cause: "local_oversize_guard",
      payload_bytes: payloadBytes,
      max_bytes: maxBytes
    };
  }
  try {
    const result = await requestJson(
      "POST",
      endpoint,
      config.payload as unknown as JsonObject,
      {
        request_kind: "telemetry_decision",
        game_id: config.payload.game_id,
        hand_id: config.payload.hand_id,
        phase: config.payload.phase,
        actor_seat: config.payload.actor_seat,
        decision_index: config.payload.decision_index,
        requested_provider: config.payload.requested_provider,
        ...(config.traceBackend ? { trace_backend: true } : {}),
        ...(config.quiet ? { quiet: true } : {}),
        ...(config.workerId ? { worker_id: config.workerId } : {}),
        ...(config.controllerMode ? { controller_mode: true } : {})
      }
    );
    return {
      ok: true,
      endpoint,
      method: "POST",
      request_kind: "telemetry_decision",
      status: result.status,
      latency_ms: result.latency_ms
    };
  } catch (error) {
    return normalizeTelemetryFailureResult(endpoint, "telemetry_decision", error);
  }
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
  const endpoint = `${config.backendBaseUrl}${TELEMETRY_EVENT_PATH}`;
  const payloadBytes = jsonByteLength(config.payload);
  const maxBytes = resolveTelemetryMaxBytes(config.maxBytes);
  if (payloadBytes > maxBytes) {
    return {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: "telemetry_event",
      failure_kind: "backend_rejection",
      message: `Telemetry event payload skipped locally because it is ${payloadBytes} bytes and exceeds ${maxBytes} bytes.`,
      cause: "local_oversize_guard",
      payload_bytes: payloadBytes,
      max_bytes: maxBytes
    };
  }
  try {
    const result = await requestJson(
      "POST",
      endpoint,
      config.payload as unknown as JsonObject,
      {
        request_kind: "telemetry_event",
        game_id: config.payload.game_id,
        hand_id: config.payload.hand_id,
        phase: config.payload.phase,
        event_index: config.payload.event_index,
        ...(config.payload.requested_provider
          ? { requested_provider: config.payload.requested_provider }
          : {}),
        ...(config.payload.actor_seat ? { actor_seat: config.payload.actor_seat } : {}),
        ...(config.traceBackend ? { trace_backend: true } : {}),
        ...(config.quiet ? { quiet: true } : {}),
        ...(config.workerId ? { worker_id: config.workerId } : {}),
        ...(config.controllerMode ? { controller_mode: true } : {})
      }
    );
    return {
      ok: true,
      endpoint,
      method: "POST",
      request_kind: "telemetry_event",
      status: result.status,
      latency_ms: result.latency_ms
    };
  } catch (error) {
    return normalizeTelemetryFailureResult(endpoint, "telemetry_event", error);
  }
}

async function resolveLocalHeuristicDecision(config: {
  backendBaseUrl: string;
  telemetryEnabled: boolean;
  strictTelemetry?: boolean;
  traceBackend?: boolean;
  telemetryMode?: TelemetryMode;
  telemetryMaxBytes?: number;
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
  workerId?: string;
  controllerMode?: boolean;
}): Promise<SimulatedDecision> {
  const telemetryFailureStats = createTelemetryFailureStats();
  let telemetryFailure: TelemetryWriteResult | undefined;
  const actorScopedLegalActions: LegalActionMap = {
    [config.actor]: config.legalActions[config.actor] ?? []
  };
  const chosen = heuristicsV1Policy.chooseAction({
    state: config.stateRaw as never,
    legalActions: actorScopedLegalActions
  });
  const latencyMs = Date.now() - config.startedAt;

  if (config.telemetryEnabled) {
    const payload = buildLocalDecisionTelemetry({
      gameId: config.gameId,
      handId: config.handId,
      phase: config.phase,
      actorSeat: config.actor,
      decisionIndex: config.decisionIndex,
      stateRaw: config.stateRaw,
      stateNorm: config.stateNorm,
      legalActions: config.legalActions,
      chosen,
      requestedProvider: config.requestedProvider,
      fallbackUsed: config.fallbackUsed,
      ...(config.fallbackReason ? { fallbackReason: config.fallbackReason } : {}),
      latencyMs,
      telemetryMode: config.telemetryMode ?? "minimal",
      ...(config.workerId ? { workerId: config.workerId } : {}),
      ...(config.controllerMode ? { controllerMode: true } : {})
    });
    const result = await safePostTelemetryDecision({
      backendBaseUrl: config.backendBaseUrl,
      payload,
      ...(config.traceBackend ? { traceBackend: true } : {}),
      ...(config.quiet ? { quiet: true } : {}),
      ...(config.telemetryMaxBytes !== undefined
        ? { maxBytes: config.telemetryMaxBytes }
        : {}),
      ...(config.workerId ? { workerId: config.workerId } : {}),
      ...(config.controllerMode ? { controllerMode: true } : {})
    });
    recordTelemetryFailure(telemetryFailureStats, result);
    if (!result.ok) {
      telemetryFailure = result;
      if (config.strictTelemetry === true) {
        throw new Error(
          `Strict telemetry decision persistence failed (${result.failure_kind}) at ${result.endpoint}: ${result.message}`
        );
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

  const telemetryMode = config.telemetryMode ?? "minimal";
  const fullTelemetry = telemetryMode === "full";
  const actorSeat = extractActorSeatFromEvent(event, config.actorSeat);
  const payload: TelemetryEventPayload = {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: stateNorm.phase as string,
    event_type: event.type,
    actor_seat: actorSeat,
    event_index: config.eventIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    requested_provider: config.requestedProvider,
    provider_used: config.providerUsed,
    fallback_used: config.providerUsed !== config.requestedProvider,
    state_norm: fullTelemetry ? stateNorm : null,
    payload: fullTelemetry
      ? {
          engine_event: event,
          state_norm: stateNorm
        }
      : {
          event_type: event.type,
          actor_seat: actorSeat,
          phase: stateNorm.phase as string
        },
    metadata: {
      telemetry_mode: telemetryMode,
      requested_provider: config.requestedProvider,
      provider_used: config.providerUsed,
      simulation_mode: true,
      ...buildControllerMetadata(config),
      event_index: config.eventIndex
    }
  };

  const result = await safePostTelemetryEvent({
    backendBaseUrl: config.backendBaseUrl,
    payload,
    ...(config.traceBackend ? { traceBackend: true } : {}),
    ...(config.quiet ? { quiet: true } : {}),
    ...(config.telemetryMaxBytes !== undefined
      ? { maxBytes: config.telemetryMaxBytes }
      : {}),
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {})
  });
  if (!result.ok && config.strictTelemetry === true) {
    throw new Error(
      `Strict telemetry event persistence failed (${result.failure_kind}) at ${result.endpoint}: ${result.message}`
    );
  }
  return result;
}

export async function resolveDecision(
  config: {
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
    quiet?: boolean;
    workerId?: string;
    controllerMode?: boolean;
  }
): Promise<SimulatedDecision> {
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
      providerReason: "Resolved locally through heuristics-v1 during self-play simulation.",
      fallbackUsed: false,
      startedAt
    });
  }

  const fallbackAllowed = config.serverFallbackEnabled !== false;
  const fallbackLocally = async (failure: DecisionRequestFailure): Promise<SimulatedDecision> => {
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
    const fallback = await resolveLocalHeuristicDecision({
      ...config,
      requestedProvider,
      providerReason: `Backend ${requestedProvider} decision failed; resolved through local heuristics-v1 fallback.`,
      fallbackUsed: true,
      fallbackReason: failure.message,
      startedAt
    });
    emitDecisionDiagnostic(config, "decision_fallback", {
      kind: failure.kind,
      requested_provider: requestedProvider,
      provider_used: fallback.providerUsed,
      fallback_used: true,
      context: failure.context
    });
    return fallback;
  };

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
    ...(config.controllerMode ? { controllerMode: true } : {})
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
    decisionRequestPayload = buildDecisionRequestPayload({
      gameId: config.gameId,
      handId: config.handId,
      stateRaw: config.stateRaw,
      stateNorm: config.stateNorm,
      legalActions: validation.actorLegalActions,
      phase: config.phase,
      requestedProvider,
      decisionIndex: config.decisionIndex,
      ...(config.workerId ? { workerId: config.workerId } : {}),
      ...(config.controllerMode ? { controllerMode: true } : {})
    });
  } catch (error) {
    return fallbackLocally(
      new DecisionRequestFailure(
        "payload_validation",
        error instanceof Error ? error.message : String(error),
        context
      )
    );
  }

  let decisionResponse: { status: number; payload: JsonObject };
  try {
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
        ...(config.traceBackend ? { trace_backend: true } : {}),
        ...(config.quiet ? { quiet: true } : {}),
        ...(config.workerId ? { worker_id: config.workerId } : {}),
        ...(config.controllerMode ? { controller_mode: true } : {})
      }
    );
  } catch (error) {
    if (error instanceof BackendRequestFailure) {
      return fallbackLocally(
        new DecisionRequestFailure(error.kind, error.message, context, error.details)
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

  const payload = decisionResponse.payload as unknown as DecisionResponsePayload;
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
  if (!findMatchingLegalAction(config.legalActions, config.actor, chosenAction)) {
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
    metadata.fallback_used === true ||
    payload.provider_used !== requestedProvider;

  return {
    chosenAction,
    providerUsed: payload.provider_used,
    requestedProvider,
    providerReason: payload.provider_reason ?? "Resolved through the backend decision provider.",
    ...(typeof metadata.explanation === "object" && metadata.explanation !== null
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
  const gameId = buildGameId(options.baseSeed, index);
  const handId = buildHandId(gameId);
  const startedAt = Date.now();
  let result = createInitialGameState(`${options.baseSeed}-${index}`);
  let decisionIndex = 0;
  let eventIndex = 0;
  const providerUsage: Record<string, number> = {};
  const decisionsByPhase: Record<string, number> = {};
  const eventsByPhase: Record<string, number> = {};
  const latencyByProvider: Record<string, { count: number; totalMs: number }> = {};
  const telemetryFailureStats = createTelemetryFailureStats();
  const telemetryFailureTracker: TelemetryFailureTracker = {
    emittedDetailedFailures: 0,
    compactedFailures: 0
  };
  let fallbackCount = 0;
  let passActions = 0;
  let playActions = 0;
  let bombPlays = 0;
  let wishSatisfiedPlays = 0;
  let wishActiveDecisions = 0;
  let invalidDecisions = 0;

  for (const event of result.events) {
    countByKey(eventsByPhase, result.nextState.phase);
    const currentEventIndex = eventIndex++;
    const telemetryResult = await persistEvent(event, result.derivedView as unknown as JsonObject, {
      backendBaseUrl,
      telemetryEnabled: options.telemetryEnabled,
      ...(options.strictTelemetry !== undefined
        ? { strictTelemetry: options.strictTelemetry }
        : {}),
      ...(options.traceBackend !== undefined ? { traceBackend: options.traceBackend } : {}),
      ...(options.telemetryMode !== undefined ? { telemetryMode: options.telemetryMode } : {}),
      ...(options.telemetryMaxBytes !== undefined
        ? { telemetryMaxBytes: options.telemetryMaxBytes }
        : {}),
      ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
      gameId,
      handId,
      actorSeat: SYSTEM_ACTOR,
      eventIndex: currentEventIndex,
      providerUsed: "system_local",
      requestedProvider: "system_local",
      ...(options.workerId ? { workerId: options.workerId } : {}),
      ...(options.controllerMode ? { controllerMode: true } : {})
    });
    if (telemetryResult) {
      recordTelemetryFailure(telemetryFailureStats, telemetryResult);
      emitTelemetryFailure(options, telemetryFailureTracker, telemetryResult, {
        game_id: gameId,
        hand_id: handId,
        phase: result.nextState.phase,
        event_index: currentEventIndex
      });
    }
  }

  while (result.nextState.phase !== "finished") {
    if (
      options.maxDecisionsPerGame !== undefined &&
      decisionIndex >= options.maxDecisionsPerGame
    ) {
      throw new Error(
        `Soft lock protection tripped after ${options.maxDecisionsPerGame} decisions for ${gameId}.`
      );
    }

    const actor = resolveNextActor(result.legalActions, result.nextState);
    const resolved = await resolveDecision({
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
      ...(options.seatProviders ? { seatProviders: options.seatProviders } : {}),
      ...(options.serverFallbackEnabled !== undefined
        ? { serverFallbackEnabled: options.serverFallbackEnabled }
        : {}),
      ...(options.strictTelemetry !== undefined
        ? { strictTelemetry: options.strictTelemetry }
        : {}),
      ...(options.traceBackend !== undefined ? { traceBackend: options.traceBackend } : {}),
      ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
      ...(options.workerId ? { workerId: options.workerId } : {}),
      ...(options.controllerMode ? { controllerMode: true } : {})
    });

    countByKey(providerUsage, resolved.providerUsed);
    countByKey(decisionsByPhase, result.nextState.phase);
    recordLatency(latencyByProvider, resolved.providerUsed, resolved.latencyMs);
    mergeTelemetryFailureStats(telemetryFailureStats, resolved.telemetryFailureStats);
    if (resolved.telemetryFailure) {
      emitTelemetryFailure(options, telemetryFailureTracker, resolved.telemetryFailure, {
        game_id: gameId,
        hand_id: handId,
        phase: result.nextState.phase,
        actor_seat: String(actor),
        decision_index: decisionIndex
      });
    }
    if (resolved.fallbackUsed) {
      fallbackCount += 1;
    }

    const matchedLegalAction = findMatchingLegalAction(
      result.legalActions,
      actor,
      resolved.chosenAction
    );

    if (!matchedLegalAction) {
      invalidDecisions += 1;
      throw new Error(
        `Resolved action for actor ${actor} did not match a legal action: ${JSON.stringify(resolved.chosenAction)}`
      );
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

    const nextResult = applyEngineAction(result.nextState, resolved.chosenAction);
    for (const event of nextResult.events) {
      countByKey(eventsByPhase, nextResult.nextState.phase);
      const currentEventIndex = eventIndex++;
      const telemetryResult = await persistEvent(event, nextResult.derivedView as unknown as JsonObject, {
        backendBaseUrl,
        telemetryEnabled: options.telemetryEnabled,
        ...(options.strictTelemetry !== undefined
          ? { strictTelemetry: options.strictTelemetry }
          : {}),
        ...(options.traceBackend !== undefined ? { traceBackend: options.traceBackend } : {}),
        ...(options.telemetryMode !== undefined ? { telemetryMode: options.telemetryMode } : {}),
        ...(options.telemetryMaxBytes !== undefined
          ? { telemetryMaxBytes: options.telemetryMaxBytes }
          : {}),
        ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
        gameId,
        handId,
        actorSeat: actor,
        eventIndex: currentEventIndex,
        providerUsed: resolved.providerUsed,
        requestedProvider: resolved.requestedProvider,
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      });
      if (telemetryResult) {
        recordTelemetryFailure(telemetryFailureStats, telemetryResult);
        emitTelemetryFailure(options, telemetryFailureTracker, telemetryResult, {
          game_id: gameId,
          hand_id: handId,
          phase: nextResult.nextState.phase,
          actor_seat: String(actor),
          event_index: currentEventIndex
        });
      }
    }

    result = nextResult;
    decisionIndex += 1;
  }

  const teamScores = cloneTeamScores(result.nextState.roundSummary?.teamScores);
  const scoreMargin = Math.abs(teamScores["team-0"] - teamScores["team-1"]);
  const winningTeam =
    teamScores["team-0"] === teamScores["team-1"]
      ? "tie"
      : teamScores["team-0"] > teamScores["team-1"]
        ? "team-0"
        : "team-1";

  return {
    gameId,
    handId,
    decisions: decisionIndex,
    events: eventIndex,
    durationMs: Date.now() - startedAt,
    providerUsage,
    fallbackCount,
    decisionsByPhase,
    eventsByPhase,
    teamScores,
    winningTeam,
    scoreMargin,
    passActions,
    playActions,
    bombPlays,
    wishSatisfiedPlays,
    wishActiveDecisions,
    invalidDecisions,
    ...telemetryFailureStats,
    latencyByProvider: summarizeLatency(latencyByProvider)
  };
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export async function runSelfPlayBatch(
  options: SelfPlayBatchOptions
): Promise<SelfPlayBatchSummary> {
  const backendBaseUrl = normalizeBackendBaseUrl(
    options.backendBaseUrl ?? "http://localhost:4310"
  );
  const requestedProviders = new Set<DecisionMode>([
    options.defaultProvider,
    ...Object.values(options.seatProviders ?? {}).filter(
      (provider): provider is DecisionMode => provider !== undefined
    )
  ]);

  const usesBackendProvider = [...requestedProviders].some((provider) => provider !== "local");
  if (options.telemetryEnabled || usesBackendProvider) {
    try {
      await verifyBackend(backendBaseUrl, {
        ...(options.traceBackend ? { traceBackend: true } : {}),
        ...(options.quiet ? { quiet: true } : {}),
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      });
    } catch (error) {
      const telemetryRequiresBackend = options.telemetryEnabled && options.strictTelemetry === true;
      const providerRequiresBackend = usesBackendProvider && options.serverFallbackEnabled === false;
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
    decisionsByPhase: {},
    eventsByPhase: {},
    providerUsage: {},
    fallbackCount: 0,
    errors: 0,
    averageGameDurationMs: 0,
    averageDecisionsPerHand: 0,
    exchangePhaseRecorded: false,
    passSelectRecorded: false,
    winCountsByTeam: {
      "team-0": 0,
      "team-1": 0,
      tie: 0
    },
    totalScoreByTeam: createTeamScoreBucket(),
    averageScoreMargin: 0,
    passRate: 0,
    bombUsageRate: 0,
    wishSatisfactionRate: null,
    invalidDecisionCount: 0,
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {},
    averageLatencyByProvider: {}
  };

  let totalDuration = 0;
  let totalScoreMargin = 0;
  let totalPassActions = 0;
  let totalPlayActions = 0;
  let totalBombPlays = 0;
  let totalWishSatisfiedPlays = 0;
  let totalWishActiveDecisions = 0;
  const latencyTotals: Record<string, { count: number; totalMs: number }> = {};

  for (let index = 0; index < options.games; index += 1) {
    try {
      const game = await runSingleGame(index, options, backendBaseUrl);
      summary.gamesPlayed += 1;
      summary.handsPlayed += 1;
      summary.decisionsRecorded += game.decisions;
      summary.eventsRecorded += game.events;
      summary.fallbackCount += game.fallbackCount;
      summary.invalidDecisionCount += game.invalidDecisions;
      summary.telemetryDecisionFailures += game.telemetryDecisionFailures;
      summary.telemetryEventFailures += game.telemetryEventFailures;
      summary.telemetryFailuresTotal += game.telemetryFailuresTotal;
      mergeCounts(
        summary.telemetryFailureByEndpoint,
        game.telemetryFailureByEndpoint
      );
      totalDuration += game.durationMs;
      totalScoreMargin += game.scoreMargin;
      totalPassActions += game.passActions;
      totalPlayActions += game.playActions;
      totalBombPlays += game.bombPlays;
      totalWishSatisfiedPlays += game.wishSatisfiedPlays;
      totalWishActiveDecisions += game.wishActiveDecisions;
      mergeCounts(summary.decisionsByPhase, game.decisionsByPhase);
      mergeCounts(summary.eventsByPhase, game.eventsByPhase);
      mergeCounts(summary.providerUsage, game.providerUsage);
      mergeCounts(summary.totalScoreByTeam, game.teamScores);
      countByKey(summary.winCountsByTeam, game.winningTeam);
      summary.exchangePhaseRecorded =
        summary.exchangePhaseRecorded ||
        game.decisionsByPhase.pass_select !== undefined ||
        game.eventsByPhase.exchange_complete !== undefined ||
        game.eventsByPhase.pass_reveal !== undefined;
      summary.passSelectRecorded =
        summary.passSelectRecorded || game.decisionsByPhase.pass_select !== undefined;
      for (const [provider, metrics] of Object.entries(game.latencyByProvider)) {
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
            duration_ms: game.durationMs
          })
        );
      }
    } catch (error) {
      summary.errors += 1;
      if (shouldEmitDiagnostic(options)) {
        const gameId = buildGameId(options.baseSeed, index);
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
    summary.gamesPlayed > 0 ? Math.round(totalDuration / summary.gamesPlayed) : 0;
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
      ? Number((totalPassActions / (totalPassActions + totalPlayActions)).toFixed(4))
      : 0;
  summary.bombUsageRate =
    totalPlayActions > 0
      ? Number((totalBombPlays / totalPlayActions).toFixed(4))
      : 0;
  summary.wishSatisfactionRate =
    totalWishActiveDecisions > 0
      ? Number((totalWishSatisfiedPlays / totalWishActiveDecisions).toFixed(4))
      : null;
  summary.averageLatencyByProvider = Object.fromEntries(
    Object.entries(latencyTotals).map(([provider, metrics]) => [
      provider,
      metrics.count > 0 ? Number((metrics.totalMs / metrics.count).toFixed(2)) : 0
    ])
  );

  return summary;
}
