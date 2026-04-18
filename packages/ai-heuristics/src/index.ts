import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  type EngineAction,
  type LegalAction,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { engineFoundation } from "@tichuml/engine";
import { chooseWishRank } from "./HandAnalysis.js";
import { createPassSelectionAction, scorePassSelection } from "./PassHeuristicEngine.js";
import { scorePlayAction, scorePassTurn } from "./PlayHeuristicEngine.js";
import { deepenTacticalCandidates } from "./TacticalLookahead.js";
import { scoreDragonGift, scoreGrandTichu, scoreTichu } from "./TichuDecisionEngine.js";
import type {
  CandidateDecision,
  ChosenDecision,
  HeadlessDecisionContext,
  HeuristicPolicy,
  PassLegalAction,
  PlayLegalAction
} from "./types.js";
import { getConcreteActionSortKey, isPassLegalAction, isPlayLegalAction } from "./utils.js";

export type {
  ChosenDecision,
  HeadlessDecisionContext,
  HeuristicPolicy,
  PolicyExplanation,
  PolicyTag,
  TeamplaySnapshot
} from "./types.js";

function filterWishLockedActions(
  actions: LegalAction[],
  currentWish: StandardRank | null
): LegalAction[] {
  if (currentWish === null) {
    return actions;
  }

  const wishPlayActions = actions.filter(
    (action): action is PlayLegalAction =>
      isPlayLegalAction(action) && action.combination.actualRanks.includes(currentWish)
  );

  return wishPlayActions.length > 0 ? wishPlayActions : actions;
}

function toConcreteAction(
  state: HeadlessDecisionContext["state"],
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction
): EngineAction {
  if (legalAction.type === "select_pass") {
    return createPassSelectionAction(state, legalAction.seat);
  }

  if (legalAction.type === "play_cards" && legalAction.availableWishRanks) {
    return {
      type: "play_cards",
      seat: legalAction.seat,
      cardIds: legalAction.cardIds,
      ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {}),
      wishRank: chooseWishRank(state, legalAction.seat, legalAction.cardIds)
    };
  }

  if (legalAction.type === "assign_dragon_trick") {
    return {
      type: "assign_dragon_trick",
      seat: legalAction.seat,
      recipient: legalAction.recipient
    };
  }

  if (
    actor === SYSTEM_ACTOR ||
    legalAction.type === "call_grand_tichu" ||
    legalAction.type === "decline_grand_tichu" ||
    legalAction.type === "call_tichu" ||
    legalAction.type === "pass_turn" ||
    legalAction.type === "advance_phase"
  ) {
    return legalAction;
  }

  return {
    type: "play_cards",
    seat: legalAction.seat,
    cardIds: legalAction.cardIds,
    ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {})
  };
}

function scoreConcreteAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction,
  action: EngineAction
): CandidateDecision {
  if (actor === SYSTEM_ACTOR || action.type === "advance_phase") {
    return {
      actor,
      action,
      score: 5000,
      reasons: ["required system phase advancement"],
      tags: []
    };
  }

  if (action.type === "call_grand_tichu" || action.type === "decline_grand_tichu") {
    return scoreGrandTichu(ctx.state, actor, action);
  }

  if (action.type === "call_tichu") {
    return scoreTichu(ctx.state, actor, action);
  }

  if (action.type === "assign_dragon_trick") {
    return scoreDragonGift(ctx.state, actor, action);
  }

  if (action.type === "select_pass") {
    return scorePassSelection(ctx.state, actor, action);
  }

  if (action.type === "pass_turn") {
    return scorePassTurn(ctx, actor, action);
  }

  if (isPlayLegalAction(legalAction) && action.type === "play_cards") {
    return scorePlayAction(ctx, actor, legalAction, action);
  }

  return {
    actor,
    action,
    score: 0,
    reasons: ["fallback candidate"],
    tags: []
  };
}

function collectCandidates(ctx: HeadlessDecisionContext): CandidateDecision[] {
  const actors: Array<SeatId | typeof SYSTEM_ACTOR> = [SYSTEM_ACTOR, ...SEAT_IDS];
  const candidates: CandidateDecision[] = [];

  for (const actor of actors) {
    const rawLegalActions = ctx.legalActions[actor] ?? [];
    const legalActions =
      actor === ctx.state.activeSeat
        ? filterWishLockedActions(rawLegalActions, ctx.state.currentWish)
        : rawLegalActions;

    for (const legalAction of legalActions) {
      const action = toConcreteAction(ctx.state, actor, legalAction);
      candidates.push(scoreConcreteAction(ctx, actor, legalAction, action));
    }
  }

  const deepened = deepenTacticalCandidates(ctx, candidates);

  return deepened.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return getConcreteActionSortKey(left.action).localeCompare(
      getConcreteActionSortKey(right.action)
    );
  });
}

function summarizePlayCandidates(actions: LegalAction[]): string[] {
  return actions.filter(isPlayLegalAction).map((action) => action.combination.key);
}

function selectSeatEmergencyPassCandidate(
  ctx: HeadlessDecisionContext,
  actor: SeatId
): CandidateDecision | null {
  const passAction = (ctx.legalActions[actor] ?? []).find(
    (action): action is PassLegalAction => isPassLegalAction(action)
  );
  if (!passAction) {
    return null;
  }

  return {
    actor,
    action: passAction,
    score: Number.NEGATIVE_INFINITY,
    reasons: [
      "emergency fallback: forcing pass because the active turn could not resolve a progression action"
    ],
    tags: []
  };
}

function selectEmergencyPassCandidate(
  ctx: HeadlessDecisionContext
): CandidateDecision | null {
  for (const actor of SEAT_IDS) {
    const candidate = selectSeatEmergencyPassCandidate(ctx, actor);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function selectProgressionCandidateForActiveTurn(
  ctx: HeadlessDecisionContext,
  candidates: CandidateDecision[]
): CandidateDecision | null {
  const actor = ctx.state.activeSeat;
  if (
    !actor ||
    ctx.state.phase !== "trick_play" ||
    ctx.state.pendingDragonGift ||
    ctx.state.currentTrick === null ||
    ctx.state.currentTrick.currentCombination.kind !== "straight"
  ) {
    return null;
  }

  const actorActions = ctx.legalActions[actor] ?? [];
  const progressionCandidates = candidates.filter(
    (candidate) =>
      candidate.actor === actor &&
      (candidate.action.type === "play_cards" || candidate.action.type === "pass_turn")
  );

  console.info("[ai] Straight response options", {
    activeSeat: actor,
    leadCombo: ctx.state.currentTrick.currentCombination.key,
    legalResponseCount: actorActions.filter(isPlayLegalAction).length,
    normalizedResponseList: summarizePlayCandidates(actorActions),
    canPass: actorActions.some(isPassLegalAction),
    wishState: ctx.state.currentWish
  });

  const leadingCandidate = candidates[0] ?? null;
  if (
    leadingCandidate &&
    (leadingCandidate.action.type === "play_cards" ||
      leadingCandidate.action.type === "pass_turn")
  ) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: leadingCandidate.action,
      fallbackUsed: false
    });
    return leadingCandidate;
  }

  const selected = progressionCandidates[0] ?? null;
  if (selected) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: selected.action,
      fallbackUsed: false
    });
    return selected;
  }

  const fallbackPass = selectSeatEmergencyPassCandidate(ctx, actor);
  if (fallbackPass) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: fallbackPass.action,
      fallbackUsed: true
    });
  }

  return fallbackPass;
}

function toChosenDecision(
  selected: CandidateDecision,
  candidates: CandidateDecision[]
): ChosenDecision {
  return {
    actor: selected.actor,
    action: selected.action,
    explanation: {
      policy: "heuristics-v1",
      actor: selected.actor,
      candidateScores: candidates.map((candidate) => ({
        action: candidate.action,
        score: candidate.score,
        reasons: candidate.reasons,
        tags: candidate.tags,
        ...(candidate.teamplay ? { teamplay: candidate.teamplay } : {})
      })),
      selectedReasonSummary: selected.reasons,
      selectedTags: selected.tags,
      ...(selected.teamplay ? { selectedTeamplay: selected.teamplay } : {})
    }
  };
}

export const heuristicsV1Policy: HeuristicPolicy = {
  name: "heuristics-v1",
  chooseAction(ctx) {
    try {
      const candidates = collectCandidates(ctx);
      const progressionSelected = selectProgressionCandidateForActiveTurn(ctx, candidates);
      const selected =
        progressionSelected ?? candidates[0] ?? selectEmergencyPassCandidate(ctx);

      if (!selected) {
        throw new Error("No legal action candidates available for heuristics-v1.");
      }

      if (candidates.length === 0) {
        console.error(
          "[ai] No scored legal candidates were available; using emergency pass fallback.",
          {
            actor: selected.actor,
            action: selected.action,
            phase: ctx.state.phase,
            activeSeat: ctx.state.activeSeat,
            currentWish: ctx.state.currentWish
          }
        );
      }

      return toChosenDecision(selected, candidates);
    } catch (error) {
      const activeSeatFallback =
        ctx.state.activeSeat && ctx.state.phase === "trick_play"
          ? selectSeatEmergencyPassCandidate(ctx, ctx.state.activeSeat)
          : null;
      const fallback = activeSeatFallback ?? selectEmergencyPassCandidate(ctx);

      console.error(
        "[ai] Failed to resolve legal action candidates; attempting emergency pass fallback.",
        {
          error: error instanceof Error ? error.message : String(error),
          phase: ctx.state.phase,
          activeSeat: ctx.state.activeSeat,
          currentCombination: ctx.state.currentTrick?.currentCombination.key ?? null,
          currentWish: ctx.state.currentWish
        }
      );

      if (!fallback) {
        throw error;
      }

      if (
        ctx.state.phase === "trick_play" &&
        ctx.state.currentTrick?.currentCombination.kind === "straight"
      ) {
        console.info("[ai] Straight response selected", {
          activeSeat: fallback.actor,
          chosenAction: fallback.action,
          fallbackUsed: true
        });
      }

      return toChosenDecision(fallback, []);
    }
  }
};

export const deterministicBaselinePolicy = heuristicsV1Policy;

export const heuristicFoundation = {
  policyFamily: "team-aware-heuristics",
  dependsOn: engineFoundation.name,
  readyForHeadlessFlow: true,
  baselinePolicy: heuristicsV1Policy.name
};
