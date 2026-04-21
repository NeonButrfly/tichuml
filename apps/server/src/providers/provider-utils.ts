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
import {
  getCanonicalActiveSeatFromState,
  validateLegalActionsForCanonicalActor
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

function legalActionTypesForDiagnostics(legalActions: LegalActionMap): string[] {
  return Object.values(legalActions)
    .flat()
    .slice(0, 6)
    .map((action) => action.type);
}

export function formatActorMismatchDiagnostics(config: {
  payload: DecisionRequestPayload;
  canonicalActorSeat: string;
  derivedActorSeat: string;
  legalActionIssues?: string[];
}): string {
  const stateRaw = config.payload.state_raw;
  const stateNorm = config.payload.state_norm;
  const legalActions = config.payload.legal_actions as unknown as LegalActionMap;
  const turnMetadata = {
    stateRawActiveSeat:
      isUsableState(stateRaw) ? stateRaw.activeSeat : undefined,
    stateNormActiveSeat:
      stateNorm && typeof stateNorm.activeSeat === "string"
        ? stateNorm.activeSeat
        : undefined,
    phase: stateRaw?.phase ?? stateNorm?.phase ?? config.payload.phase
  };

  return [
    "Actor mismatch:",
    `request.actor_seat=${config.payload.actor_seat}`,
    `canonical.state.activeSeat=${config.canonicalActorSeat}`,
    `derivedActorSeat=${config.derivedActorSeat}`,
    `phase=${config.payload.phase}`,
    `legalActions=[${legalActionTypesForDiagnostics(legalActions).join(", ")}]`,
    `game_id=${config.payload.game_id}`,
    `hand_id=${config.payload.hand_id}`,
    `turnMetadata=${JSON.stringify(turnMetadata)}`,
    ...(config.legalActionIssues ?? [])
  ].join("\n");
}

export function validateDecisionRequestActorContract(
  payload: DecisionRequestPayload
): SeatId {
  if (!isUsableState(payload.state_raw)) {
    throw new Error(
      "Decision requests require a full state_raw payload before actor validation."
    );
  }

  const canonicalActorSeat = getCanonicalActiveSeatFromState(payload.state_raw);
  const legalActions = payload.legal_actions as unknown as LegalActionMap;
  const legalActionIssues = validateLegalActionsForCanonicalActor({
    legalActions,
    actor: canonicalActorSeat
  });

  if (payload.actor_seat !== canonicalActorSeat || legalActionIssues.length > 0) {
    throw new Error(
      formatActorMismatchDiagnostics({
        payload,
        canonicalActorSeat,
        derivedActorSeat: canonicalActorSeat,
        legalActionIssues
      })
    );
  }

  return canonicalActorSeat;
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

function summarizeCurrentCombination(state: GameState): JsonObject | null {
  const combination = state.currentTrick?.currentCombination;
  return combination
    ? {
        kind: combination.kind,
        primaryRank: combination.primaryRank,
        cardCount: combination.cardCount,
        isBomb: combination.isBomb
      }
    : null;
}

function legalActionFulfillsWish(state: GameState, legalAction: LegalAction): boolean {
  if (state.currentWish === null || legalAction.type !== "play_cards") {
    return false;
  }

  return (
    legalAction.combination.primaryRank === state.currentWish ||
    legalAction.combination.actualRanks.includes(state.currentWish)
  );
}

function buildDecisionContextMetadata(config: {
  state: GameState;
  actorLegalActions: LegalAction[];
}): JsonObject {
  const wishActive = config.state.currentWish !== null;
  const wishSatisfiable =
    wishActive &&
    config.actorLegalActions.some((action) =>
      legalActionFulfillsWish(config.state, action)
    );

  return {
    seed: config.state.seed,
    current_lead_seat: config.state.currentTrick?.currentWinner ?? null,
    current_combination: summarizeCurrentCombination(config.state),
    wish_active: wishActive,
    current_wish: config.state.currentWish,
    wish_satisfiable: wishSatisfiable,
    active_wish_no_legal_fulfilling_move: wishActive && !wishSatisfiable
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
  const stateRaw = config.payload.state_raw;
  const actorLegalActions =
    isUsableState(stateRaw) ? extractActorLegalActions(config.payload) : [];
  const explanation =
    config.metadata?.explanation && typeof config.metadata.explanation === "object"
      ? config.metadata.explanation
      : null;
  const candidateScores =
    explanation &&
    typeof explanation === "object" &&
    "candidateScores" in explanation
      ? ((explanation as JsonObject).candidateScores ?? null)
      : null;
  const stateFeatures =
    explanation &&
    typeof explanation === "object" &&
    "stateFeatures" in explanation &&
    typeof (explanation as JsonObject).stateFeatures === "object" &&
    (explanation as JsonObject).stateFeatures !== null &&
    !Array.isArray((explanation as JsonObject).stateFeatures)
      ? ((explanation as JsonObject).stateFeatures as JsonObject)
      : null;
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
    requested_provider: config.payload.requested_provider,
    provider_used: config.providerUsed,
    fallback_used:
      typeof config.metadata?.fallback_used === "boolean"
        ? config.metadata.fallback_used
        : config.providerUsed !== config.payload.requested_provider,
    policy_name: config.policyName,
    policy_source: config.providerUsed,
    state_raw: config.payload.state_raw ?? {},
    state_norm: config.payload.state_norm,
    legal_actions: config.payload.legal_actions,
    chosen_action: config.chosenAction as unknown as JsonObject,
    explanation,
    candidateScores,
    stateFeatures,
    metadata: {
      ...config.payload.metadata,
      ...(isUsableState(stateRaw)
        ? buildDecisionContextMetadata({
            state: stateRaw,
            actorLegalActions
          })
        : {}),
      requested_provider: config.payload.requested_provider,
      provider_used: config.providerUsed,
      provider_reason: config.providerReason,
      fallback_used:
        typeof config.metadata?.fallback_used === "boolean"
          ? config.metadata.fallback_used
          : config.providerUsed !== config.payload.requested_provider,
      ...(config.metadata ?? {})
    } as JsonObject,
    antipattern_tags: config.antipatternTags ?? []
  };
}
