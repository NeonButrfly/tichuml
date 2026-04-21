import type {
  DecisionRequestPayload,
  DecisionResponsePayload,
  JsonObject
} from "@tichuml/shared";
import type { TelemetryRepository } from "./telemetry-repository.js";
import { routeHeuristicDecision } from "../providers/heuristic-provider.js";
import { routeLightgbmDecision } from "../providers/lightgbm-provider.js";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";

export async function handleDecisionRequest(
  repository: TelemetryRepository,
  payload: DecisionRequestPayload,
  dependencies: {
    lightgbmScorer?: LightgbmScorer;
  } = {}
): Promise<DecisionResponsePayload> {
  const startedAt = Date.now();
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
            } satisfies LightgbmScorer)
        )
      : routeHeuristicDecision(payload);
  const latencyMs = Date.now() - startedAt;
  routed.telemetryPayload.metadata = {
    ...routed.telemetryPayload.metadata,
    latency_ms: latencyMs
  };
  const telemetryId = await repository.insertDecision(routed.telemetryPayload);

  return {
    accepted: true,
    chosen_action: routed.chosen.action as unknown as JsonObject,
    provider_used: routed.providerUsed,
    provider_reason: routed.providerReason,
    metadata: {
      ...(routed.responseMetadata ?? {}),
      latency_ms: latencyMs
    },
    telemetry_id: telemetryId
  };
}
