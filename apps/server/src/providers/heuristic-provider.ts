import { heuristicsV1Policy, type ChosenDecision } from "@tichuml/ai-heuristics";
import type { GameState, LegalActionMap } from "@tichuml/engine";
import type {
  DecisionRequestPayload,
  JsonObject,
  RequestedDecisionProvider,
  TelemetryDecisionPayload
} from "@tichuml/shared";

export type RoutedDecision = {
  providerUsed: RequestedDecisionProvider;
  providerReason: string;
  chosen: ChosenDecision;
  telemetryPayload: TelemetryDecisionPayload;
};

function isUsableState(value: unknown): value is GameState {
  return (
    typeof value === "object" &&
    value !== null &&
    "phase" in value &&
    "hands" in value &&
    "activeSeat" in value
  );
}

function isUsableLegalActionMap(value: unknown): value is LegalActionMap {
  return typeof value === "object" && value !== null;
}

function getDecisionIndex(payload: DecisionRequestPayload): number {
  const candidate = payload.metadata.decision_index;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : 0;
}

export function routeHeuristicDecision(
  payload: DecisionRequestPayload
): RoutedDecision {
  if (!isUsableState(payload.state_raw)) {
    throw new Error(
      "Decision requests for the server heuristic require a full state_raw payload."
    );
  }

  if (!isUsableLegalActionMap(payload.legal_actions)) {
    throw new Error("Decision requests require a legal_actions map.");
  }

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
    providerReason: "Resolved through the shared heuristics-v1 policy on the backend.",
    chosen,
    telemetryPayload: {
      ts: new Date().toISOString(),
      game_id: payload.game_id,
      hand_id: payload.hand_id,
      phase: payload.phase,
      actor_seat: payload.actor_seat,
      decision_index: getDecisionIndex(payload),
      schema_version: payload.schema_version,
      engine_version: payload.engine_version,
      sim_version: payload.sim_version,
      policy_name: heuristicsV1Policy.name,
      policy_source: "server_heuristic",
      state_raw: payload.state_raw,
      state_norm: payload.state_norm,
      legal_actions: payload.legal_actions,
      chosen_action: chosen.action as unknown as JsonObject,
      metadata: {
        ...payload.metadata,
        provider_reason: "Resolved through the shared heuristics-v1 policy on the backend."
      } as JsonObject,
      antipattern_tags:
        chosen.explanation.selectedTags.length > 0
          ? chosen.explanation.selectedTags
          : []
    }
  };
}
