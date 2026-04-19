import {
  chooseWishRank,
  type ChosenDecision,
  type PolicyTag
} from "@tichuml/ai-heuristics";
import type {
  EngineAction,
  GameState,
  LegalAction,
  LegalActionMap,
  SeatId
} from "@tichuml/engine";
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
  responseMetadata?: JsonObject;
};

export function isUsableState(value: unknown): value is GameState {
  return (
    typeof value === "object" &&
    value !== null &&
    "phase" in value &&
    "hands" in value &&
    "activeSeat" in value
  );
}

export function isUsableLegalActionMap(value: unknown): value is LegalActionMap {
  return typeof value === "object" && value !== null;
}

export function getDecisionIndex(payload: DecisionRequestPayload): number {
  const candidate = payload.metadata.decision_index;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : 0;
}

export function toConcreteActionForLegalAction(
  state: GameState,
  legalAction: LegalAction
): EngineAction {
  if (legalAction.type === "select_pass") {
    throw new Error(
      "select_pass decisions require heuristic expansion before they can become a concrete engine action."
    );
  }

  if (legalAction.type === "play_cards" && legalAction.availableWishRanks) {
    return {
      type: "play_cards",
      seat: legalAction.seat,
      cardIds: legalAction.cardIds,
      ...(legalAction.phoenixAsRank !== undefined
        ? { phoenixAsRank: legalAction.phoenixAsRank }
        : {}),
      wishRank: chooseWishRank(state, legalAction.seat, legalAction.cardIds)
    };
  }

  return legalAction as EngineAction;
}

export function extractActorLegalActions(
  payload: DecisionRequestPayload
): LegalAction[] {
  if (Array.isArray(payload.legal_actions)) {
    return payload.legal_actions as unknown as LegalAction[];
  }

  if (
    typeof payload.legal_actions === "object" &&
    payload.legal_actions !== null &&
    payload.actor_seat in payload.legal_actions
  ) {
    const actorActions = (
      payload.legal_actions as Record<string, unknown>
    )[payload.actor_seat];
    if (Array.isArray(actorActions)) {
      return actorActions as LegalAction[];
    }
  }

  throw new Error(
    `Decision requests require a legal action list for actor ${payload.actor_seat}.`
  );
}

export function toActionSortKey(action: EngineAction): string {
  switch (action.type) {
    case "play_cards":
      return [
        action.type,
        action.seat,
        [...action.cardIds].sort().join(","),
        String(action.phoenixAsRank ?? ""),
        String(action.wishRank ?? "")
      ].join("|");
    case "select_pass":
      return [
        action.type,
        action.seat,
        action.left,
        action.partner,
        action.right
      ].join("|");
    case "assign_dragon_trick":
      return [action.type, action.seat, action.recipient].join("|");
    case "advance_phase":
      return [action.type, action.actor].join("|");
    case "call_grand_tichu":
    case "decline_grand_tichu":
    case "call_tichu":
    case "pass_turn":
      return [action.type, "seat" in action ? action.seat : ""].join("|");
    default:
      return JSON.stringify(action);
  }
}

export function buildChosenDecision(
  actor: SeatId,
  action: EngineAction,
  policy: string,
  reasonSummary: string[],
  tags: PolicyTag[] = []
): ChosenDecision {
  return {
    actor,
    action,
    explanation: {
      policy,
      actor,
      candidateScores: [],
      selectedReasonSummary: reasonSummary,
      selectedTags: tags
    }
  };
}

export function createTelemetryPayload(config: {
  payload: DecisionRequestPayload;
  providerUsed: RequestedDecisionProvider;
  providerReason: string;
  policyName: string;
  chosenAction: EngineAction;
  antipatternTags?: string[];
  metadata?: JsonObject;
}): TelemetryDecisionPayload {
  return {
    ts: new Date().toISOString(),
    game_id: config.payload.game_id,
    hand_id: config.payload.hand_id,
    phase: config.payload.phase,
    actor_seat: config.payload.actor_seat,
    decision_index: getDecisionIndex(config.payload),
    schema_version: config.payload.schema_version,
    engine_version: config.payload.engine_version,
    sim_version: config.payload.sim_version,
    policy_name: config.policyName,
    policy_source: config.providerUsed,
    state_raw: config.payload.state_raw ?? {},
    state_norm: config.payload.state_norm,
    legal_actions: config.payload.legal_actions,
    chosen_action: config.chosenAction as unknown as JsonObject,
    metadata: {
      ...config.payload.metadata,
      requested_provider: config.payload.requested_provider,
      provider_reason: config.providerReason,
      ...(config.metadata ?? {})
    } as JsonObject,
    antipattern_tags: config.antipatternTags ?? []
  };
}
