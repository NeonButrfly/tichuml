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
  type DecisionMode,
  type DecisionProviderUsed,
  type DecisionResponsePayload,
  type JsonObject,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  applyEngineAction,
  createInitialGameState,
  SEAT_IDS,
  SYSTEM_ACTOR,
  type EngineAction,
  type EngineEvent,
  type LegalActionMap,
  type SeatId
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
};

type SimulatedDecision = {
  chosenAction: EngineAction;
  providerUsed: DecisionProviderUsed | "system_local";
  requestedProvider: DecisionMode | "system_local";
  providerReason: string;
  explanation?: ChosenDecision["explanation"];
  fallbackUsed: boolean;
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
};

function countByKey(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
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

function resolveNextActor(legalActions: LegalActionMap, activeSeat: SeatId | null): SeatId | typeof SYSTEM_ACTOR {
  if (getActorLegalActions(legalActions, SYSTEM_ACTOR).length > 0) {
    return SYSTEM_ACTOR;
  }

  if (activeSeat && getActorLegalActions(legalActions, activeSeat).length > 0) {
    return activeSeat;
  }

  for (const seat of SEAT_IDS) {
    if (getActorLegalActions(legalActions, seat).length > 0) {
      return seat;
    }
  }

  throw new Error("No legal actor was available for the next self-play decision.");
}

function buildDecisionRequestPayload(config: {
  gameId: string;
  handId: string;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  actorSeat: SeatId;
  phase: string;
  requestedProvider: Exclude<DecisionMode, "local">;
  decisionIndex: number;
}): JsonObject {
  return {
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: config.actorSeat,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    state_raw: config.stateRaw,
    state_norm: config.stateNorm,
    legal_actions: config.legalActions as unknown as JsonObject,
    requested_provider: config.requestedProvider,
    metadata: {
      decision_index: config.decisionIndex,
      simulation_mode: true
    } as JsonObject
  };
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
}): TelemetryDecisionPayload {
  const providerUsed =
    config.actorSeat === SYSTEM_ACTOR ? "system_local" : "local_heuristic";

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
    policy_name: heuristicsV1Policy.name,
    policy_source: providerUsed,
    state_raw: config.stateRaw,
    state_norm: config.stateNorm,
    legal_actions: config.legalActions as unknown as JsonObject,
    chosen_action: config.chosen.action as unknown as JsonObject,
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: providerUsed,
      fallback_used: false,
      simulation_mode: true,
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
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    payload: {
      engine_event: event,
      state_norm: stateNorm
    },
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: config.providerUsed,
      simulation_mode: true,
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
  }
): Promise<SimulatedDecision> {
  if (config.actor === SYSTEM_ACTOR) {
    const chosen = heuristicsV1Policy.chooseAction({
      state: config.stateRaw as never,
      legalActions: config.legalActions
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
        requestedProvider: "system_local"
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
      fallbackUsed: false
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
      legalActions: config.legalActions
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
        requestedProvider
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
      fallbackUsed: false
    };
  }

  const decisionResponse = await requestJson(
    "POST",
    `${config.backendBaseUrl}${DECISION_REQUEST_PATH}`,
    buildDecisionRequestPayload({
      gameId: config.gameId,
      handId: config.handId,
      stateRaw: config.stateRaw,
      stateNorm: config.stateNorm,
      legalActions: config.legalActions,
      actorSeat: config.actor,
      phase: config.phase,
      requestedProvider,
      decisionIndex: config.decisionIndex
    })
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
    fallbackUsed
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
  let fallbackCount = 0;

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
      requestedProvider: "system_local"
    });
  }

  while (result.nextState.phase !== "finished") {
    const actor = resolveNextActor(result.legalActions, result.nextState.activeSeat);
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
        ...(options.seatProviders ? { seatProviders: options.seatProviders } : {})
      });

    countByKey(providerUsage, resolved.providerUsed);
    countByKey(decisionsByPhase, result.nextState.phase);
    if (resolved.fallbackUsed) {
      fallbackCount += 1;
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
        requestedProvider: resolved.requestedProvider
      });
    }

    result = nextResult;
    decisionIndex += 1;
  }

  return {
    gameId,
    handId,
    decisions: decisionIndex,
    events: eventIndex,
    durationMs: Date.now() - startedAt,
    providerUsage,
    fallbackCount,
    decisionsByPhase,
    eventsByPhase
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

  if (options.telemetryEnabled || options.defaultProvider !== "local") {
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
    passSelectRecorded: false
  };

  let totalDuration = 0;

  for (let index = 0; index < options.games; index += 1) {
    try {
      const game = await runSingleGame(index, options, backendBaseUrl);
      summary.gamesPlayed += 1;
      summary.handsPlayed += 1;
      summary.decisionsRecorded += game.decisions;
      summary.eventsRecorded += game.events;
      summary.fallbackCount += game.fallbackCount;
      totalDuration += game.durationMs;
      mergeCounts(summary.decisionsByPhase, game.decisionsByPhase);
      mergeCounts(summary.eventsByPhase, game.eventsByPhase);
      mergeCounts(summary.providerUsage, game.providerUsage);
      summary.exchangePhaseRecorded =
        summary.exchangePhaseRecorded ||
        game.decisionsByPhase.pass_select !== undefined ||
        game.eventsByPhase.exchange_complete !== undefined ||
        game.eventsByPhase.pass_reveal !== undefined;
      summary.passSelectRecorded =
        summary.passSelectRecorded || game.decisionsByPhase.pass_select !== undefined;

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

  return summary;
}
