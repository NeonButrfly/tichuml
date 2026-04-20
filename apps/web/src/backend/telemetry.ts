import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION,
  serializeLegalAction
} from "@tichuml/telemetry";
import {
  SYSTEM_ACTOR,
  type EngineAction,
  type EngineEvent,
  type EngineResult
} from "@tichuml/engine";
import type { BackendRuntimeSettings } from "@tichuml/shared";
import { postTelemetryDecision, postTelemetryEvent } from "./client";

export type TelemetryDecisionWriteResult = {
  kind: "decision";
  payload: ReturnType<typeof buildDecisionPayload>;
  telemetryId: number | null;
};

export type TelemetryEventWriteResult = {
  kind: "event";
  payloads: ReturnType<typeof buildEventPayload>[];
  telemetryIds: number[];
};

function isTrackedDecisionAction(action: EngineAction, phase: string): boolean {
  return (
    action.type === "call_grand_tichu" ||
    action.type === "call_tichu" ||
    action.type === "select_pass" ||
    action.type === "pass_turn" ||
    action.type === "play_cards" ||
    (action.type === "advance_phase" &&
      (phase === "pass_reveal" || phase === "exchange_complete"))
  );
}

function toDecisionActor(action: EngineAction): string {
  if ("seat" in action) {
    return action.seat;
  }

  if ("actor" in action) {
    return action.actor;
  }

  return SYSTEM_ACTOR;
}

export function emitDecisionTelemetry(config: {
  settings: BackendRuntimeSettings;
  action: EngineAction;
  phase: string;
  gameId: string;
  handId: string;
  decisionIndex: number;
  stateRaw: EngineResult["nextState"];
  stateNorm: EngineResult["derivedView"];
  legalActions: EngineResult["legalActions"];
  policyName: string;
  policySource: string;
  metadata?: Record<string, unknown>;
}): Promise<TelemetryDecisionWriteResult | null> {
  if (!config.settings.telemetryEnabled) {
    return Promise.resolve(null);
  }

  if (!isTrackedDecisionAction(config.action, config.phase)) {
    return Promise.resolve(null);
  }

  const payload = buildDecisionPayload(config);

  return postTelemetryDecision(config.settings.backendBaseUrl, payload)
    .then((response) => ({
      kind: "decision" as const,
      payload,
      telemetryId: response.telemetry_id ?? null
    }))
    .catch((error) => {
      console.warn("[telemetry] decision upload failed", {
        error: error instanceof Error ? error.message : String(error),
        action: config.action.type
      });
      throw error;
    });
}

function buildDecisionPayload(config: {
  action: EngineAction;
  phase: string;
  gameId: string;
  handId: string;
  decisionIndex: number;
  stateRaw: EngineResult["nextState"];
  stateNorm: EngineResult["derivedView"];
  legalActions: EngineResult["legalActions"];
  policyName: string;
  policySource: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: toDecisionActor(config.action),
    decision_index: config.decisionIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    policy_name: config.policyName,
    policy_source: config.policySource,
    state_raw: config.stateRaw as unknown as Record<string, unknown>,
    state_norm: config.stateNorm as unknown as Record<string, unknown>,
    legal_actions: Object.fromEntries(
      Object.entries(config.legalActions).map(([actor, actions]) => [
        actor,
        (actions ?? []).map((action) => serializeLegalAction(action))
      ])
    ),
    chosen_action: config.action as unknown as Record<string, unknown>,
    metadata: (config.metadata ?? {}) as Record<string, unknown>,
    antipattern_tags: []
  };
}

export function emitEventTelemetry(config: {
  settings: BackendRuntimeSettings;
  events: EngineEvent[];
  phase: string;
  actorSeat: string | null;
  gameId: string;
  handId: string;
  metadata?: Record<string, unknown>;
}): Promise<TelemetryEventWriteResult | null> {
  if (!config.settings.telemetryEnabled || config.events.length === 0) {
    return Promise.resolve(null);
  }

  const payloads = config.events.map((event) => buildEventPayload(config, event));

  return Promise.all(
    payloads.map((payload) =>
      postTelemetryEvent(config.settings.backendBaseUrl, payload)
    )
  )
    .then((responses) => ({
      kind: "event" as const,
      payloads,
      telemetryIds: responses.flatMap((response) =>
        typeof response.telemetry_id === "number" ? [response.telemetry_id] : []
      )
    }))
    .catch((error) => {
      console.warn("[telemetry] event upload failed", {
        error: error instanceof Error ? error.message : String(error),
        eventTypes: config.events.map((event) => event.type)
      });
      throw error;
    });
}

function buildEventPayload(
  config: {
    phase: string;
    actorSeat: string | null;
    gameId: string;
    handId: string;
    metadata?: Record<string, unknown>;
  },
  event: EngineEvent
) {
  return {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    event_type: event.type,
    actor_seat: config.actorSeat,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    payload: event as unknown as Record<string, unknown>,
    metadata: (config.metadata ?? {}) as Record<string, unknown>
  };
}
