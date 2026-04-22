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

export type SelfPlayBatchOptions = {
  games: number;
  baseSeed: string;
  defaultProvider: DecisionMode;
  seatProviders?: SeatProviderOverrides;
  telemetryEnabled: boolean;
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
  workerId?: string;
  controllerMode?: boolean;
};

function countByKey(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
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

function buildControllerMetadata(config: {
  workerId?: string;
  controllerMode?: boolean;
}): JsonObject {
  return {
    ...(config.workerId ? { worker_id: config.workerId } : {}),
    ...(config.controllerMode ? { controller_mode: true } : {})
  };
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
  body?: JsonObject
): Promise<{ status: number; payload: JsonObject }> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = {
      "content-type": "application/json"
    };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const payload = (await response.json()) as JsonObject;
  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return { status: response.status, payload };
}

async function verifyBackend(baseUrl: string): Promise<void> {
  await requestJson("GET", `${baseUrl}${BACKEND_HEALTH_PATH}`);
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
  latencyMs: number;
  workerId?: string;
  controllerMode?: boolean;
}): TelemetryDecisionPayload {
  const providerUsed =
    config.actorSeat === SYSTEM_ACTOR ? "system_local" : "local_heuristic";
  const explanation = config.chosen.explanation as unknown as JsonObject;
  const actorLegalActions = extractActorScopedLegalActions(
    config.legalActions as unknown as JsonObject,
    String(config.actorSeat)
  );

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
    fallback_used: false,
    policy_name: heuristicsV1Policy.name,
    policy_source: providerUsed,
    state_raw: config.stateRaw,
    state_norm: config.stateNorm,
    legal_actions: actorLegalActions,
    chosen_action: config.chosen.action as unknown as JsonObject,
    explanation,
    candidateScores: config.chosen.explanation.candidateScores as unknown as JsonObject[],
    stateFeatures:
      config.chosen.explanation.stateFeatures === undefined
        ? null
        : (config.chosen.explanation.stateFeatures as unknown as JsonObject),
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: providerUsed,
      fallback_used: false,
      simulation_mode: true,
      ...buildControllerMetadata(config),
      ...buildDecisionContextMetadata(
        config.stateRaw as unknown as GameState,
        actorLegalActions,
        config.latencyMs
      ),
      explanation: config.chosen.explanation
    },
    antipattern_tags: config.chosen.explanation.selectedTags
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

async function persistEvent(
  event: EngineEvent,
  stateNorm: JsonObject,
  config: PersistedEventConfig
): Promise<void> {
  if (!config.telemetryEnabled) {
    return;
  }

  const payload: TelemetryEventPayload = {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: stateNorm.phase as string,
    event_type: event.type,
    actor_seat: extractActorSeatFromEvent(event, config.actorSeat),
    event_index: config.eventIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    requested_provider: config.requestedProvider,
    provider_used: config.providerUsed,
    fallback_used: config.providerUsed !== config.requestedProvider,
    state_norm: stateNorm,
    payload: {
      engine_event: event,
      state_norm: stateNorm
    },
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: config.providerUsed,
      simulation_mode: true,
      ...buildControllerMetadata(config),
      event_index: config.eventIndex
    }
  };

  await requestJson("POST", `${config.backendBaseUrl}${TELEMETRY_EVENT_PATH}`, payload as unknown as JsonObject);
}

async function resolveDecision(
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
    workerId?: string;
    controllerMode?: boolean;
  }
): Promise<SimulatedDecision> {
  const startedAt = Date.now();
  const actorScopedLegalActions: LegalActionMap = {
    [config.actor]: config.legalActions[config.actor] ?? []
  };
  if (config.actor === SYSTEM_ACTOR) {
    const chosen = heuristicsV1Policy.chooseAction({
      state: config.stateRaw as never,
      legalActions: actorScopedLegalActions
    });

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
        requestedProvider: "system_local",
        latencyMs: Date.now() - startedAt,
        ...(config.workerId ? { workerId: config.workerId } : {}),
        ...(config.controllerMode ? { controllerMode: true } : {})
      });
      await requestJson(
        "POST",
        `${config.backendBaseUrl}${TELEMETRY_DECISION_PATH}`,
        payload as unknown as JsonObject
      );
    }

    return {
      chosenAction: chosen.action,
      providerUsed: "system_local",
      requestedProvider: "system_local",
      providerReason: "Resolved locally for a system-owned phase transition.",
      explanation: chosen.explanation,
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt
    };
  }

  const requestedProvider = resolveRequestedProvider(
    config.actor,
    config.defaultProvider,
    config.seatProviders
  );

  if (requestedProvider === "local") {
    const chosen = heuristicsV1Policy.chooseAction({
      state: config.stateRaw as never,
      legalActions: actorScopedLegalActions
    });

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
        requestedProvider,
        latencyMs: Date.now() - startedAt,
        ...(config.workerId ? { workerId: config.workerId } : {}),
        ...(config.controllerMode ? { controllerMode: true } : {})
      });
      await requestJson(
        "POST",
        `${config.backendBaseUrl}${TELEMETRY_DECISION_PATH}`,
        payload as unknown as JsonObject
      );
    }

    return {
      chosenAction: chosen.action,
      providerUsed: "local_heuristic",
      requestedProvider,
      providerReason: "Resolved locally through heuristics-v1 during self-play simulation.",
      explanation: chosen.explanation,
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt
    };
  }

  const canonicalActor = getCanonicalActiveSeatFromState(config.stateRaw);
  if (config.actor !== canonicalActor) {
    throw new Error(
      `[server_heuristic] refusing inconsistent request source: actor=${config.actor}, canonical=${canonicalActor}, phase=${config.phase}, game_id=${config.gameId}, hand_id=${config.handId}`
    );
  }

  const decisionRequestPayload = buildDecisionRequestPayload({
    gameId: config.gameId,
    handId: config.handId,
    stateRaw: config.stateRaw,
    stateNorm: config.stateNorm,
    legalActions: getActorScopedLegalActions(config.legalActions, canonicalActor),
    phase: config.phase,
    requestedProvider,
    decisionIndex: config.decisionIndex,
    ...(config.workerId ? { workerId: config.workerId } : {}),
    ...(config.controllerMode ? { controllerMode: true } : {})
  });

  const decisionResponse = await requestJson(
    "POST",
    `${config.backendBaseUrl}${DECISION_REQUEST_PATH}`,
    decisionRequestPayload as unknown as JsonObject
  );

  const payload = decisionResponse.payload as unknown as DecisionResponsePayload;
  if (!payload.accepted || !payload.chosen_action || !payload.provider_used) {
    throw new Error(
      `Backend decision provider returned an unusable response: ${JSON.stringify(payload)}`
    );
  }

  const metadata = payload.metadata ?? {};
  const fallbackUsed =
    metadata.fallback_provider !== undefined ||
    metadata.fallback_used === true ||
    payload.provider_used !== requestedProvider;

  return {
    chosenAction: payload.chosen_action as unknown as EngineAction,
    providerUsed: payload.provider_used,
    requestedProvider,
    providerReason: payload.provider_reason ?? "Resolved through the backend decision provider.",
    ...(typeof metadata.explanation === "object" && metadata.explanation !== null
      ? { explanation: metadata.explanation as ChosenDecision["explanation"] }
      : {}),
    fallbackUsed,
    latencyMs: Date.now() - startedAt
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
  let fallbackCount = 0;
  let passActions = 0;
  let playActions = 0;
  let bombPlays = 0;
  let wishSatisfiedPlays = 0;
  let wishActiveDecisions = 0;
  let invalidDecisions = 0;

  for (const event of result.events) {
    countByKey(eventsByPhase, result.nextState.phase);
    await persistEvent(event, result.derivedView as unknown as JsonObject, {
      backendBaseUrl,
      telemetryEnabled: options.telemetryEnabled,
      gameId,
      handId,
      actorSeat: SYSTEM_ACTOR,
      eventIndex: eventIndex++,
      providerUsed: "system_local",
      requestedProvider: "system_local",
      ...(options.workerId ? { workerId: options.workerId } : {}),
      ...(options.controllerMode ? { controllerMode: true } : {})
    });
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
      ...(options.workerId ? { workerId: options.workerId } : {}),
      ...(options.controllerMode ? { controllerMode: true } : {})
    });

    countByKey(providerUsage, resolved.providerUsed);
    countByKey(decisionsByPhase, result.nextState.phase);
    recordLatency(latencyByProvider, resolved.providerUsed, resolved.latencyMs);
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
      await persistEvent(event, nextResult.derivedView as unknown as JsonObject, {
        backendBaseUrl,
        telemetryEnabled: options.telemetryEnabled,
        gameId,
        handId,
        actorSeat: actor,
        eventIndex: eventIndex++,
        providerUsed: resolved.providerUsed,
        requestedProvider: resolved.requestedProvider,
        ...(options.workerId ? { workerId: options.workerId } : {}),
        ...(options.controllerMode ? { controllerMode: true } : {})
      });
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

  if (
    options.telemetryEnabled ||
    [...requestedProviders].some((provider) => provider !== "local")
  ) {
    await verifyBackend(backendBaseUrl);
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
      if (!options.quiet) {
        console.error(
          JSON.stringify({
            game: index + 1,
            error: error instanceof Error ? error.message : String(error)
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
