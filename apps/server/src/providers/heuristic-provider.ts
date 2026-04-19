import { heuristicsV1Policy } from "@tichuml/ai-heuristics";
import type { DecisionRequestPayload, JsonObject } from "@tichuml/shared";
import {
  createTelemetryPayload,
  isUsableLegalActionMap,
  isUsableState,
  type RoutedDecision
} from "./provider-utils.js";

export function routeHeuristicDecision(
  payload: DecisionRequestPayload,
  options: {
    providerReason?: string;
    metadata?: Record<string, unknown>;
  } = {}
): RoutedDecision {
  if (!isUsableState(payload.state_raw)) {
    throw new Error(
      "Decision requests for the server heuristic require a full state_raw payload."
    );
  }

  if (!isUsableLegalActionMap(payload.legal_actions)) {
    throw new Error("Decision requests require a legal_actions map.");
  }

  const providerReason =
    options.providerReason ??
    "Resolved through the shared heuristics-v1 policy on the backend.";
  const chosen = heuristicsV1Policy.chooseAction({
    state: payload.state_raw,
    legalActions: payload.legal_actions
  });

  if (chosen.actor !== payload.actor_seat) {
    throw new Error(
      `Server heuristic selected actor ${chosen.actor} for request actor ${payload.actor_seat}.`
    );
  }

  return {
    providerUsed: "server_heuristic",
    providerReason,
    chosen,
    telemetryPayload: createTelemetryPayload({
      payload,
      providerUsed: "server_heuristic",
      providerReason,
      policyName: heuristicsV1Policy.name,
      chosenAction: chosen.action,
      antipatternTags:
        chosen.explanation.selectedTags.length > 0
          ? chosen.explanation.selectedTags
          : [],
      ...(options.metadata
        ? { metadata: options.metadata as JsonObject }
        : {})
    })
  };
}
