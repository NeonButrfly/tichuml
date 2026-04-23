import {
  buildGameplayDecisionTelemetry,
  buildGameplayEventTelemetry,
  emitTelemetryDecision,
  emitTelemetryEvent,
  isTrackedGameplayDecisionAction
} from "@tichuml/telemetry";
import {
  type EngineAction,
  type EngineEvent,
  type EngineResult
} from "@tichuml/engine";
import type { BackendRuntimeSettings } from "@tichuml/shared";

export type TelemetryDecisionWriteResult = {
  kind: "decision";
  payload: ReturnType<typeof buildGameplayDecisionTelemetry>["full"];
  telemetryId: number | null;
};

export type TelemetryEventWriteResult = {
  kind: "event";
  payloads: ReturnType<typeof buildGameplayEventTelemetry>[number]["full"][];
  telemetryIds: number[];
};

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

  if (!isTrackedGameplayDecisionAction(config.action, config.phase)) {
    return Promise.resolve(null);
  }

  const payloads = buildGameplayDecisionTelemetry({
    action: config.action,
    phase: config.phase,
    gameId: config.gameId,
    handId: config.handId,
    decisionIndex: config.decisionIndex,
    stateRaw: config.stateRaw,
    stateNorm: config.stateNorm,
    legalActions: config.legalActions,
    policyName: config.policyName,
    policySource: config.policySource,
    decisionMode: config.settings.decisionMode,
    telemetryMode: "full",
    metadata: config.metadata
  });

  return emitTelemetryDecision({
    telemetry: {
      enabled: config.settings.telemetryEnabled,
      strictTelemetry: false,
      backendBaseUrl: config.settings.backendBaseUrl,
      source: "gameplay",
      mode: "full"
    },
    payloads
  })
    .then((result) => ({
      kind: "decision" as const,
      payload: result.ok ? payloads.full : payloads.minimal,
      telemetryId: result.ok ? (result.telemetry_id ?? null) : null
    }))
    .catch((error) => {
      console.warn("[telemetry] decision upload failed", {
        error: error instanceof Error ? error.message : String(error),
        action: config.action.type
      });
      return null;
    });
}

export function emitEventTelemetry(config: {
  settings: BackendRuntimeSettings;
  events: EngineEvent[];
  phase: string;
  actorSeat: string | null;
  gameId: string;
  handId: string;
  eventIndexBase?: number;
  metadata?: Record<string, unknown>;
}): Promise<TelemetryEventWriteResult | null> {
  if (!config.settings.telemetryEnabled || config.events.length === 0) {
    return Promise.resolve(null);
  }

  const payloads = buildGameplayEventTelemetry({
    events: config.events,
    phase: config.phase,
    actorSeat: config.actorSeat,
    gameId: config.gameId,
    handId: config.handId,
    eventIndexBase: config.eventIndexBase,
    telemetryMode: "full",
    metadata: config.metadata
  });

  return Promise.all(
    payloads.map((payloadsForEvent) =>
      emitTelemetryEvent({
        telemetry: {
          enabled: config.settings.telemetryEnabled,
          strictTelemetry: false,
          backendBaseUrl: config.settings.backendBaseUrl,
          source: "gameplay",
          mode: "full"
        },
        payloads: payloadsForEvent
      })
    )
  )
    .then((responses) => ({
      kind: "event" as const,
      payloads: payloads.map((payload) => payload.full),
      telemetryIds: responses.flatMap((response) =>
        response.ok && typeof response.telemetry_id === "number"
          ? [response.telemetry_id]
          : []
      )
    }))
    .catch((error) => {
      console.warn("[telemetry] event upload failed", {
        error: error instanceof Error ? error.message : String(error),
        eventTypes: config.events.map((event) => event.type)
      });
      return null;
    });
}
