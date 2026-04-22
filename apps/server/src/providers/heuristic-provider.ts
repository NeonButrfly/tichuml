import { heuristicsV1Policy } from "@tichuml/ai-heuristics";
import type { DecisionRequestPayload, JsonObject } from "@tichuml/shared";
import {
  createTelemetryPayload,
  formatActorMismatchDiagnostics,
  isUsableLegalActionMap,
  isUsableState,
  validateDecisionRequestActorContract,
  type RoutedDecision
} from "./provider-utils.js";

export function routeHeuristicDecision(
  payload: DecisionRequestPayload,
  options: {
    providerReason?: string;
    metadata?: Record<string, unknown>;
    traceDecisionRequests?: boolean;
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

  const canonicalActor = validateDecisionRequestActorContract(payload);
  const legalActionCount = Object.values(payload.legal_actions).flat().length;
  if (options.traceDecisionRequests) {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "decision_request_validated",
        game_id: payload.game_id,
        hand_id: payload.hand_id,
        phase: payload.phase,
        actor_seat: payload.actor_seat,
        requested_provider: payload.requested_provider,
        canonical_actor_seat: canonicalActor,
        legal_action_keys: Object.keys(payload.legal_actions),
        legal_action_count: legalActionCount,
        provider_path: "server_heuristic"
      })
    );
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
      formatActorMismatchDiagnostics({
        payload,
        canonicalActorSeat: canonicalActor,
        derivedActorSeat: chosen.actor,
        legalActionIssues: [
          `Server heuristic selected actor ${chosen.actor} for request actor ${payload.actor_seat}.`
        ]
      })
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
      metadata: {
        requested_provider: payload.requested_provider,
        provider_used: "server_heuristic",
        fallback_used: options.providerReason !== undefined,
        canonical_actor_seat: canonicalActor,
        legal_action_count: legalActionCount,
        request_validated: true,
        provider_path: "server_heuristic",
        explanation: chosen.explanation,
        ...(options.metadata ?? {})
      } as JsonObject
    }),
    responseMetadata: {
      explanation: chosen.explanation,
      chosen_action: chosen.action,
      requested_provider: payload.requested_provider,
      canonical_actor_seat: canonicalActor,
      legal_action_count: legalActionCount,
      request_validated: true,
      provider_path: "server_heuristic"
    } as JsonObject
  };
}
