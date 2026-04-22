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
  routed.telemetryPayload.metadata = {
    ...routed.telemetryPayload.metadata,
    latency_ms: latencyMs
  };
  const telemetryId = await repository.insertDecision(routed.telemetryPayload);
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
    legal_action_count: routed.responseMetadata?.legal_action_count
  });

  return {
    accepted: true,
    chosen_action: routed.chosen.action as unknown as JsonObject,
    provider_used: routed.providerUsed,
    provider_reason: routed.providerReason,
    metadata: {
      ...(routed.responseMetadata ?? {}),
      latency_ms: latencyMs,
      telemetry_id: telemetryId
    },
    telemetry_id: telemetryId
  };
}
