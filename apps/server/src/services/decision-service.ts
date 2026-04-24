import type {
  DecisionRequestPayload,
  DecisionResponsePayload,
  JsonObject
} from "@tichuml/shared";
import type { TelemetryRepository } from "./telemetry-repository.js";
import { routeHeuristicDecision } from "../providers/heuristic-provider.js";
import { routeLightgbmDecision } from "../providers/lightgbm-provider.js";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";

function logDecisionTrace(
  enabled: boolean,
  event: string,
  payload: Record<string, unknown>
): void {
  if (!enabled) {
    return;
  }
  console.info(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

export async function handleDecisionRequest(
  repository: TelemetryRepository,
  payload: DecisionRequestPayload,
  dependencies: {
    lightgbmScorer?: LightgbmScorer;
    traceDecisionRequests?: boolean;
    parseMs?: number;
    validateMs?: number;
    payloadBytes?: number;
  } = {}
): Promise<DecisionResponsePayload> {
  const startedAt = Date.now();
  logDecisionTrace(dependencies.traceDecisionRequests === true, "decision_request_received", {
    game_id: payload.game_id,
    hand_id: payload.hand_id,
    phase: payload.phase,
    actor_seat: payload.actor_seat,
    requested_provider: payload.requested_provider
  });
  const routed =
    payload.requested_provider === "lightgbm_model"
      ? await routeLightgbmDecision(
          payload,
          dependencies.lightgbmScorer ??
            ({
              score: async () => {
                throw new Error(
                  "LightGBM provider is not available. Bootstrap the ML environment and train a model first."
                );
              },
              close: async () => {}
            } satisfies LightgbmScorer),
          dependencies.traceDecisionRequests !== undefined
            ? { traceDecisionRequests: dependencies.traceDecisionRequests }
            : {}
        )
      : routeHeuristicDecision(payload, {
          ...(dependencies.traceDecisionRequests !== undefined
            ? { traceDecisionRequests: dependencies.traceDecisionRequests }
            : {})
        });
  const latencyMs = Date.now() - startedAt;
  let telemetryId: number | undefined;
  if (routed.telemetryPayload) {
    routed.telemetryPayload.metadata = {
      ...routed.telemetryPayload.metadata,
      latency_ms: latencyMs
    };
    telemetryId = await repository.insertDecision(routed.telemetryPayload);
  }
  const existingTiming =
    typeof routed.responseMetadata?.timing === "object" &&
    routed.responseMetadata.timing !== null
      ? (routed.responseMetadata.timing as JsonObject)
      : undefined;
  const providerWorkMs =
    (typeof existingTiming?.normalize_ms === "number"
      ? existingTiming.normalize_ms
      : 0) +
    (typeof existingTiming?.evaluate_ms === "number"
      ? existingTiming.evaluate_ms
      : 0);
  const timingMetadata = {
    parse_ms: dependencies.parseMs ?? 0,
    validate_ms: dependencies.validateMs ?? 0,
    response_ms: Math.max(
      0,
      latencyMs - (dependencies.parseMs ?? 0) - (dependencies.validateMs ?? 0) - providerWorkMs
    ),
    total_latency_ms: latencyMs,
    payload_bytes: dependencies.payloadBytes ?? 0
  } as JsonObject;
  logDecisionTrace(dependencies.traceDecisionRequests === true, "decision_request_resolved", {
    game_id: payload.game_id,
    hand_id: payload.hand_id,
    phase: payload.phase,
    actor_seat: payload.actor_seat,
    requested_provider: payload.requested_provider,
    provider_used: routed.providerUsed,
    telemetry_id: telemetryId,
    latency_ms: latencyMs,
    canonical_actor_seat: routed.responseMetadata?.canonical_actor_seat,
    legal_action_count: routed.responseMetadata?.legal_action_count,
    scoring_path: routed.responseMetadata?.scoring_path
  });

  return {
    accepted: true,
    chosen_action: routed.chosen.action as unknown as JsonObject,
    provider_used: routed.providerUsed,
    provider_reason: routed.providerReason,
    metadata: {
      ...(routed.responseMetadata ?? {}),
      latency_ms: latencyMs,
      timing: {
        ...((existingTiming ?? {}) as JsonObject),
        ...timingMetadata
      },
      ...(telemetryId !== undefined ? { telemetry_id: telemetryId } : {})
    },
    ...(telemetryId !== undefined ? { telemetry_id: telemetryId } : {})
  };
}
