import type {
  DecisionRequestPayload,
  DecisionResponsePayload,
  JsonObject
} from "@tichuml/shared";
import type { TelemetryRepository } from "./telemetry-repository.js";
import { routeHeuristicDecision } from "../providers/heuristic-provider.js";

export async function handleDecisionRequest(
  repository: TelemetryRepository,
  payload: DecisionRequestPayload
): Promise<DecisionResponsePayload> {
  const routed = routeHeuristicDecision(payload);
  const telemetryId = await repository.insertDecision(routed.telemetryPayload);

  return {
    accepted: true,
    chosen_action: routed.chosen.action as unknown as JsonObject,
    provider_used: routed.providerUsed,
    provider_reason: routed.providerReason,
    telemetry_id: telemetryId
  };
}
