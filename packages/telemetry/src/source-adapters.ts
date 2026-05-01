import type {
  EngineAction,
  EngineEvent,
  EngineResult,
  LegalActionMap
} from "@tichuml/engine";
import { SYSTEM_ACTOR, type SeatId } from "@tichuml/engine";
import type { JsonObject, SeedJsonValue } from "@tichuml/shared";
import { inferTelemetryFallbackUsed } from "@tichuml/shared";
import {
  buildTelemetryDecisionPayloads,
  buildTelemetryEventPayloads,
  serializeLegalAction
} from "./builders.js";
import type {
  TelemetryDecisionBuildResult,
  TelemetryEventBuildResult,
  TelemetryMode,
  TelemetrySource
} from "./types.js";

export function isTrackedGameplayDecisionAction(
  action: EngineAction,
  phase: string
): boolean {
  return (
    action.type === "call_grand_tichu" ||
    action.type === "decline_grand_tichu" ||
    action.type === "call_tichu" ||
    action.type === "select_pass" ||
    action.type === "pass_turn" ||
    action.type === "play_cards" ||
    (action.type === "advance_phase" &&
      (phase === "pass_reveal" || phase === "exchange_complete"))
  );
}

export function toDecisionActor(action: EngineAction): string {
  if ("seat" in action) {
    return action.seat;
  }

  if ("actor" in action) {
    return action.actor;
  }

  return SYSTEM_ACTOR;
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBooleanMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): boolean | null {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function readExplanationMetadata(
  metadata: Record<string, unknown> | undefined
): SeedJsonValue | null {
  const value = metadata?.explanation ?? metadata?.policy_explanation;
  return typeof value === "object" && value !== null
    ? (value as SeedJsonValue)
    : null;
}

function serializeLegalActionMap(
  legalActions: EngineResult["legalActions"]
): JsonObject {
  return Object.fromEntries(
    Object.entries(legalActions).map(([actor, actions]) => [
      actor,
      (actions ?? []).map((action) => serializeLegalAction(action))
    ])
  ) as JsonObject;
}

export function buildGameplayDecisionTelemetry(config: {
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
  decisionMode: string;
  telemetryMode?: TelemetryMode;
  metadata?: Record<string, unknown>;
}): TelemetryDecisionBuildResult {
  const actorSeat = toDecisionActor(config.action);
  const requestedProvider =
    readStringMetadata(config.metadata, "requested_provider") ??
    (config.policySource === "human_ui" ? "human_ui" : config.decisionMode) ??
    config.policySource;
  const providerUsed =
    readStringMetadata(config.metadata, "provider_used") ?? config.policySource;
  const fallbackUsed = inferTelemetryFallbackUsed({
    requestedProvider,
    providerUsed,
    explicitFallbackUsed: readBooleanMetadata(config.metadata, "fallback_used")
  });
  const explanation = readExplanationMetadata(config.metadata);

  return buildTelemetryDecisionPayloads({
    source: "gameplay",
    mode: config.telemetryMode ?? "full",
    gameId: config.gameId,
    handId: config.handId,
    phase: config.phase,
    actorSeat,
    decisionIndex: config.decisionIndex,
    stateRaw: config.stateRaw as unknown as JsonObject,
    stateNorm: config.stateNorm as unknown as JsonObject,
    legalActions: serializeLegalActionMap(config.legalActions),
    chosenAction: config.action as unknown as JsonObject,
    policyName: config.policyName,
    policySource: config.policySource,
    requestedProvider,
    providerUsed,
    fallbackUsed,
    explanation,
    metadata: (config.metadata ?? {}) as JsonObject
  });
}

export function extractActorSeatFromEvent(
  event: EngineEvent,
  fallbackActor: SeatId | typeof SYSTEM_ACTOR | string | null
): SeatId | null {
  const candidate =
    "seat" in event && typeof event.seat === "string"
      ? event.seat
      : "actor" in event &&
          typeof event.actor === "string" &&
          event.actor.startsWith("seat-")
        ? event.actor
        : fallbackActor !== SYSTEM_ACTOR
          ? fallbackActor
          : null;
  return candidate && candidate.startsWith("seat-")
    ? (candidate as SeatId)
    : null;
}

export function buildGameplayEventTelemetry(config: {
  events: EngineEvent[];
  phase: string;
  actorSeat: string | null;
  gameId: string;
  handId: string;
  eventIndexBase?: number;
  telemetryMode?: TelemetryMode;
  metadata?: Record<string, unknown>;
}): TelemetryEventBuildResult[] {
  return config.events.map((event, index) =>
    buildTelemetryEventPayloads({
      source: "gameplay",
      mode: config.telemetryMode ?? "full",
      gameId: config.gameId,
      handId: config.handId,
      phase: config.phase,
      eventType: event.type,
      actorSeat: extractActorSeatFromEvent(event, config.actorSeat),
      eventIndex: (config.eventIndexBase ?? 0) + index,
      requestedProvider: readStringMetadata(
        config.metadata,
        "requested_provider"
      ),
      providerUsed: readStringMetadata(config.metadata, "provider_used"),
      fallbackUsed:
        readBooleanMetadata(config.metadata, "fallback_used") ?? false,
      stateNorm:
        typeof config.metadata?.state_norm === "object" &&
        config.metadata.state_norm !== null &&
        !Array.isArray(config.metadata.state_norm)
          ? (config.metadata.state_norm as JsonObject)
          : null,
      payload: event as unknown as JsonObject,
      metadata: (config.metadata ?? {}) as JsonObject
    })
  );
}

export function buildSelfPlayDecisionTelemetry(config: {
  source?: Extract<TelemetrySource, "selfplay" | "controller" | "eval">;
  mode: TelemetryMode;
  gameId: string;
  handId: string;
  phase: string;
  actorSeat: SeatId | typeof SYSTEM_ACTOR;
  decisionIndex: number;
  stateRaw: JsonObject;
  stateNorm: JsonObject;
  legalActions: LegalActionMap;
  chosenAction: EngineAction;
  policyName: string;
  requestedProvider: string;
  providerUsed: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  latencyMs: number;
  explanation?: SeedJsonValue;
  strictTelemetry?: boolean | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): TelemetryDecisionBuildResult {
  const actorScopedLegalActions = {
    [config.actorSeat]: (config.legalActions[config.actorSeat] ?? []).map(
      (action) => serializeLegalAction(action)
    )
  } as JsonObject;
  return buildTelemetryDecisionPayloads({
    source:
      config.source ?? (config.controllerMode ? "controller" : "selfplay"),
    mode: config.mode,
    gameId: config.gameId,
    handId: config.handId,
    phase: config.phase,
    actorSeat: String(config.actorSeat),
    decisionIndex: config.decisionIndex,
    stateRaw: config.stateRaw,
    stateNorm: config.stateNorm,
    legalActions: actorScopedLegalActions,
    chosenAction: config.chosenAction as unknown as JsonObject,
    policyName: config.policyName,
    policySource: config.providerUsed,
    requestedProvider: config.requestedProvider,
    providerUsed: config.providerUsed,
    fallbackUsed: config.fallbackUsed,
    latencyMs: config.latencyMs,
    explanation: config.explanation ?? null,
    metadata: {
      simulation_mode: true,
      strict_telemetry: config.strictTelemetry === true,
      ...(config.fallbackReason
        ? { fallback_reason: config.fallbackReason }
        : {})
    },
    workerId: config.workerId,
    controllerMode: config.controllerMode
  });
}

export function buildSelfPlayEventTelemetry(config: {
  source?: Extract<TelemetrySource, "selfplay" | "controller" | "eval">;
  mode: TelemetryMode;
  gameId: string;
  handId: string;
  event: EngineEvent;
  stateNorm: JsonObject;
  actorSeat: SeatId | typeof SYSTEM_ACTOR;
  eventIndex: number;
  requestedProvider: string;
  providerUsed: string;
  strictTelemetry?: boolean | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): TelemetryEventBuildResult {
  const actorSeat = extractActorSeatFromEvent(config.event, config.actorSeat);
  return buildTelemetryEventPayloads({
    source:
      config.source ?? (config.controllerMode ? "controller" : "selfplay"),
    mode: config.mode,
    gameId: config.gameId,
    handId: config.handId,
    phase: config.stateNorm.phase as string,
    eventType: config.event.type,
    actorSeat,
    eventIndex: config.eventIndex,
    requestedProvider: config.requestedProvider,
    providerUsed: config.providerUsed,
    fallbackUsed: inferTelemetryFallbackUsed({
      requestedProvider: config.requestedProvider,
      providerUsed: config.providerUsed
    }),
    stateNorm: config.stateNorm,
    payload: {
      event_type: config.event.type,
      actor_seat: actorSeat,
      phase: config.stateNorm.phase as string
    },
    fullPayload: {
      engine_event: config.event as unknown as JsonObject,
      state_norm: config.stateNorm
    },
    metadata: {
      simulation_mode: true,
      strict_telemetry: config.strictTelemetry === true
    },
    workerId: config.workerId,
    controllerMode: config.controllerMode
  });
}
