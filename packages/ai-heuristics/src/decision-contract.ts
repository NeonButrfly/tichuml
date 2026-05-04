import {
  buildServerFastPathState,
  generateFastTrickPlayCandidates
} from "./serverFastPath.js";
import {
  getCanonicalActiveSeatFromState,
  getLegalActionOwner,
  getActorScopedLegalActions,
  SYSTEM_ACTOR,
  type ActorId,
  type EngineAction,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type PublicDerivedState,
  type SeatId
} from "@tichuml/engine";
import {
  type DecisionRequestPayload,
  type DecisionScoringPath,
  type JsonObject,
  type RequestedDecisionProvider
} from "@tichuml/shared";
import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION
} from "@tichuml/telemetry";

function createActorOnlyLegalActions(
  legalActions: LegalActionMap,
  actor: ActorId
): LegalActionMap {
  return {
    [actor]: legalActions[actor] ?? []
  } as LegalActionMap;
}

function isGrandTichuDecisionAction(
  action: LegalAction
): action is Extract<
  LegalAction,
  { type: "call_grand_tichu" | "decline_grand_tichu" }
> {
  return (
    action.type === "call_grand_tichu" || action.type === "decline_grand_tichu"
  );
}

function createGrandTichuDecisionLegalActions(
  legalActions: LegalActionMap,
  actorSeat: SeatId
): LegalActionMap {
  const actorActions = legalActions[actorSeat] ?? [];
  const canCallGrandTichu = actorActions.some(
    (action) => action.type === "call_grand_tichu"
  );
  const gtActions: LegalAction[] = canCallGrandTichu
    ? [
        { type: "call_grand_tichu", seat: actorSeat },
        { type: "decline_grand_tichu", seat: actorSeat }
      ]
    : [{ type: "decline_grand_tichu", seat: actorSeat }];

  return {
    [actorSeat]: gtActions
  } as LegalActionMap;
}

function createRequiredPassSelectDecisionLegalActions(
  state: GameState,
  legalActions: LegalActionMap,
  actorSeat: SeatId
): LegalActionMap {
  if (state.passSelections[actorSeat]) {
    return {
      [actorSeat]: []
    } as LegalActionMap;
  }

  const selectPassTemplate =
    (legalActions[actorSeat] ?? []).find(
      (
        action
      ): action is Extract<LegalAction, { type: "select_pass" }> =>
        action.type === "select_pass"
    ) ?? null;

  return {
    [actorSeat]: selectPassTemplate ? [selectPassTemplate] : []
  } as LegalActionMap;
}

function findMatchingLegalAction(
  legalActions: LegalActionMap,
  actor: SeatId,
  chosenAction: EngineAction
): LegalAction | null {
  const actorActions = legalActions[actor] ?? [];
  return (
    actorActions.find((candidate) => {
      if (candidate.type !== chosenAction.type) {
        return false;
      }

      switch (candidate.type) {
        case "play_cards":
          return (
            chosenAction.type === "play_cards" &&
            [...candidate.cardIds].sort().join("|") ===
              [...chosenAction.cardIds].sort().join("|") &&
            candidate.phoenixAsRank === chosenAction.phoenixAsRank
          );
        case "assign_dragon_trick":
          return (
            chosenAction.type === "assign_dragon_trick" &&
            candidate.recipient === chosenAction.recipient
          );
        default:
          return true;
      }
    }) ?? null
  );
}

function buildFastPathLegalActionPayload(
  state: GameState,
  actor: SeatId,
  actorActions: LegalAction[]
): LegalAction[] {
  const callTichuAction = actorActions.find(
    (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
      action.type === "call_tichu"
  );

  if (state.phase !== "trick_play") {
    return actorActions;
  }

  const fastState = buildServerFastPathState(state, actor);
  const candidates = generateFastTrickPlayCandidates({
    state: fastState,
    actor,
    legalActions: actorActions
  });
  if (candidates.length === 0) {
    return actorActions;
  }

  const scopedLegalActions = { [actor]: actorActions } as LegalActionMap;
  const boundedActions = candidates
    .map((candidate) =>
      findMatchingLegalAction(scopedLegalActions, actor, candidate.action)
    )
    .filter((candidate): candidate is LegalAction => candidate !== null);

  if (callTichuAction) {
    boundedActions.push(callTichuAction);
  }

  return boundedActions.length > 0 ? boundedActions : actorActions;
}

export function createCanonicalDecisionLegalActions(config: {
  state: GameState;
  legalActions: LegalActionMap;
  actor: ActorId;
  requestedProvider?: RequestedDecisionProvider;
  scoringPath?: DecisionScoringPath;
}): LegalActionMap {
  if (config.actor === SYSTEM_ACTOR) {
    return createActorOnlyLegalActions(config.legalActions, SYSTEM_ACTOR);
  }

  if (config.state.phase === "pass_select") {
    return createRequiredPassSelectDecisionLegalActions(
      config.state,
      config.legalActions,
      config.actor
    );
  }

  if (config.state.phase === "grand_tichu_window") {
    return createGrandTichuDecisionLegalActions(
      config.legalActions,
      config.actor
    );
  }

  const actorOnly = createActorOnlyLegalActions(config.legalActions, config.actor);
  if (
    config.requestedProvider === "server_heuristic" &&
    config.scoringPath === "fast_path"
  ) {
    actorOnly[config.actor] = buildFastPathLegalActionPayload(
      config.state,
      config.actor,
      actorOnly[config.actor] ?? []
    );
  }
  return actorOnly;
}

function determineScoringPath(config: {
  requestedProvider: RequestedDecisionProvider;
  fullStateDecisionRequests?: boolean;
}): DecisionScoringPath {
  if (config.requestedProvider === "lightgbm_model") {
    return "rich_path";
  }
  return config.fullStateDecisionRequests === true ? "rich_path" : "fast_path";
}

function buildDecisionRequestStateNorm(config: {
  state: GameState;
  derived: PublicDerivedState | JsonObject;
  actorSeat: SeatId;
  scoringPath: DecisionScoringPath;
}): JsonObject {
  return config.scoringPath === "fast_path"
    ? (buildServerFastPathState(
        config.state,
        config.actorSeat
      ) as unknown as JsonObject)
    : (config.derived as JsonObject);
}

function summarizeValidationResult(config: {
  phase: GameState["phase"];
  actorActions: LegalAction[];
  requestedProvider: RequestedDecisionProvider;
  scoringPath: DecisionScoringPath;
}):
  | "scoped"
  | "pass_select_required_only"
  | "grand_tichu_only"
  | "rich_path_provider" {
  if (config.scoringPath === "rich_path") {
    return "rich_path_provider";
  }
  if (config.phase === "pass_select") {
    return "pass_select_required_only";
  }
  if (
    config.phase === "grand_tichu_window" &&
    config.actorActions.every(isGrandTichuDecisionAction)
  ) {
    return "grand_tichu_only";
  }
  return "scoped";
}

export type CanonicalDecisionRequestBuildResult = {
  payload: DecisionRequestPayload;
  actorSeat: SeatId;
  actorActions: LegalAction[];
  scoringPath: DecisionScoringPath;
  fastPathUsed: boolean;
  validationResult:
    | "scoped"
    | "pass_select_required_only"
    | "grand_tichu_only"
    | "rich_path_provider";
  validationIssues: string[];
};

export function buildCanonicalDecisionRequest(config: {
  gameId: string;
  handId: string;
  state: GameState;
  derived: PublicDerivedState | JsonObject;
  legalActions: LegalActionMap;
  requestedProvider: RequestedDecisionProvider;
  decisionIndex: number;
  metadata?: JsonObject;
  fullStateDecisionRequests?: boolean;
  actorSeat?: SeatId;
}): CanonicalDecisionRequestBuildResult {
  const actorSeat = config.actorSeat ?? getCanonicalActiveSeatFromState(config.state);
  const scoringPath = determineScoringPath({
    requestedProvider: config.requestedProvider,
    ...(config.fullStateDecisionRequests !== undefined
      ? { fullStateDecisionRequests: config.fullStateDecisionRequests }
      : {})
  });
  const actorScopedLegalActions = createCanonicalDecisionLegalActions({
    state: config.state,
    legalActions: config.legalActions,
    actor: actorSeat,
    requestedProvider: config.requestedProvider,
    scoringPath
  });
  const actorActions =
    config.requestedProvider === "lightgbm_model"
      ? getActorScopedLegalActions(actorScopedLegalActions, actorSeat)[actorSeat] ?? []
      : actorScopedLegalActions[actorSeat] ?? [];
  const validationIssues = actorActions
    .filter((action) => {
      const owner = getLegalActionOwner(action);
      return owner !== null && owner !== actorSeat;
    })
    .map(
      (action) =>
        `Action ${action.type} belongs to ${String(getLegalActionOwner(action))}; expected ${actorSeat}.`
    );
  const validationResult = summarizeValidationResult({
    phase: config.state.phase,
    actorActions,
    requestedProvider: config.requestedProvider,
    scoringPath
  });

  return {
    payload: {
      game_id: config.gameId,
      hand_id: config.handId,
      phase: config.state.phase,
      actor_seat: actorSeat,
      schema_version: TELEMETRY_SCHEMA_VERSION,
      engine_version: TELEMETRY_ENGINE_VERSION,
      sim_version: TELEMETRY_SIM_VERSION,
      state_raw:
        scoringPath === "rich_path"
          ? (config.state as unknown as JsonObject)
          : null,
      state_norm: buildDecisionRequestStateNorm({
        state: config.state,
        derived: config.derived,
        actorSeat,
        scoringPath
      }),
      legal_actions: actorActions as unknown as JsonObject,
      requested_provider: config.requestedProvider,
      metadata: {
        decision_index: config.decisionIndex,
        scoring_path: scoringPath,
        fast_path_validation: validationResult,
        ...(config.metadata ?? {})
      }
    },
    actorSeat,
    actorActions,
    scoringPath,
    fastPathUsed: scoringPath === "fast_path",
    validationResult,
    validationIssues
  };
}
