import {
  applyEngineAction,
  getCanonicalCardIdsKey,
  getOpponentSeats,
  getPartnerSeat,
  type EngineAction,
  type SeatId
} from "@tichuml/engine";
import { buildUrgencyProfile, canOpponentBeatCombination, currentWinnerIsPartner } from "./HeuristicContext.js";
import { buildHandEvaluation } from "./HandAnalysis.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import type {
  CandidateDecision,
  HeadlessDecisionContext,
  PlayLegalAction,
  PolicyTag,
  TacticalBucket
} from "./types.js";
import { appendUniqueTags, isPlayLegalAction } from "./utils.js";

function getPlayLegalAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  action: EngineAction
): PlayLegalAction | null {
  if (action.type !== "play_cards") {
    return null;
  }

  const targetKey = getCanonicalCardIdsKey(action.cardIds);
  return (ctx.legalActions[actor] ?? []).find(
    (candidate): candidate is PlayLegalAction =>
      isPlayLegalAction(candidate) &&
      getCanonicalCardIdsKey(candidate.cardIds) === targetKey &&
      (candidate.phoenixAsRank ?? null) === (action.phoenixAsRank ?? null)
  ) ?? null;
}

function classifyCandidateBucket(
  ctx: HeadlessDecisionContext,
  candidate: CandidateDecision
): TacticalBucket {
  const actor = ctx.state.activeSeat;
  if (!actor) {
    return "fallback";
  }

  const urgency = buildUrgencyProfile(ctx.state, actor);
  if (candidate.action.type === "pass_turn") {
    if (candidate.actor !== actor) {
      return "fallback";
    }
    return currentWinnerIsPartner(ctx.state, actor) ? "support_pass" : "fallback";
  }

  if (candidate.action.type !== "play_cards") {
    return "fallback";
  }

  if (candidate.actor === "system") {
    return "fallback";
  }

  const legalAction = getPlayLegalAction(ctx, candidate.actor, candidate.action);
  if (!legalAction) {
    return "fallback";
  }

  if (candidate.actor !== actor) {
    return legalAction.combination.isBomb
      ? urgency.opponentOutUrgent
        ? "urgent_stop"
        : "control_lead"
      : "fallback";
  }

  const handCountAfter = ctx.state.hands[actor].length - legalAction.cardIds.length;

  if (ctx.state.currentTrick === null) {
    if (urgency.selfNearOut || handCountAfter <= 2) {
      return "endgame";
    }

    if (legalAction.combination.kind === "dog") {
      return "partner_support";
    }

    if (
      legalAction.combination.kind === "straight" ||
      legalAction.combination.kind === "pair-sequence" ||
      legalAction.combination.kind === "full-house" ||
      legalAction.cardIds.length >= 4
    ) {
      return "shedding_lead";
    }

    if (
      legalAction.combination.isBomb ||
      legalAction.cardIds.includes("dragon") ||
      legalAction.combination.primaryRank >= 13
    ) {
      return "control_lead";
    }

    return "tempo_win";
  }

  if (urgency.opponentOutUrgent || legalAction.combination.isBomb) {
    return "urgent_stop";
  }

  if (currentWinnerIsPartner(ctx.state, actor)) {
    return "partner_support";
  }

  const currentRank = ctx.state.currentTrick.currentCombination.primaryRank;
  if (
    legalAction.cardIds.length <= 2 &&
    legalAction.combination.primaryRank - currentRank <= 2
  ) {
    return "cheap_win";
  }

  if (urgency.selfNearOut || handCountAfter <= 2) {
    return "endgame";
  }

  return "tempo_win";
}

function scoreControlRetention(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  candidate: CandidateDecision
): {
  score: number;
  reasons: string[];
  tags: PolicyTag[];
} {
  const { action } = candidate;
  let projection;
  let beforeEval;
  let afterEval;

  try {
    projection = applyEngineAction(ctx.state, action);
    beforeEval = buildHandEvaluation(ctx.state, actor);
    afterEval = buildHandEvaluation(projection.nextState, actor);
  } catch {
    return {
      score: 0,
      reasons: [],
      tags: []
    };
  }

  const nextState = projection.nextState;
  const weights = HEURISTIC_WEIGHTS.tactical;
  const tags: PolicyTag[] = [];
  const reasons: string[] = [];
  let score = 0;
  const cardsShed = ctx.state.hands[actor].length - nextState.hands[actor].length;

  score += cardsShed * weights.shedProgress;

  const finishDelta = afterEval.finishPlanScore - beforeEval.finishPlanScore;
  score += finishDelta * weights.finishPlanDelta;
  if (finishDelta > 0) {
    reasons.push("projected hand shape improves after the move");
  } else if (finishDelta < 0) {
    reasons.push("projected leftovers become less clean after the move");
  }

  const deadSingleDelta = beforeEval.deadSingleCount - afterEval.deadSingleCount;
  score += deadSingleDelta * weights.deadSingleReduction;
  if (deadSingleDelta > 0) {
    reasons.push("reduces dead singles in the projected hand");
  }

  const structureDelta =
    (afterEval.longestStraightLength - beforeEval.longestStraightLength) *
      weights.straightPlanGain +
    (afterEval.longestPairSequenceLength - beforeEval.longestPairSequenceLength) *
      weights.pairSequencePlanGain +
    (afterEval.pairCount - beforeEval.pairCount) * weights.pairPlanGain +
    (afterEval.trioCount - beforeEval.trioCount) * weights.trioPlanGain;
  score += structureDelta;
  if (structureDelta >= 0) {
    appendUniqueTags(tags, "PRESERVE_STRUCTURE");
  }

  if (nextState.hands[actor].length <= 2 && afterEval.finishPlanScore >= beforeEval.finishPlanScore) {
    score += weights.cleanEndgameCommit;
    reasons.push("commits to a cleaner endgame finish line");
    appendUniqueTags(tags, "ENDGAME_COMMIT", "SHED_FOR_FINISH");
  }

  if (nextState.hands[actor].length === 1) {
    score += weights.oneCardFinishSetup;
    reasons.push("sets up a one-card finish on the next turn");
    appendUniqueTags(tags, "ENDGAME_COMMIT", "SHED_FOR_FINISH");
  }

  let liveBeatCount = 0;
  if (
    action.type === "play_cards" &&
    nextState.currentTrick &&
    nextState.currentTrick.currentWinner === actor
  ) {
    liveBeatCount = getOpponentSeats(actor).filter((opponent) =>
      canOpponentBeatCombination(nextState, opponent, actor)
    ).length;
    score +=
      liveBeatCount === 0
        ? weights.perfectControlRetention
        : liveBeatCount === 1
          ? weights.partialControlRetention
          : -weights.controlLeakPenaltyPerBeat * liveBeatCount;
    if (liveBeatCount === 0) {
      reasons.push("projection suggests the move is hard to overtake immediately");
      appendUniqueTags(
        tags,
        ctx.state.currentTrick === null ? "CONTROL_LEAD" : "TEMPO_WIN"
      );
    } else if (liveBeatCount === 1) {
      reasons.push("projection suggests the move keeps decent tempo pressure");
      appendUniqueTags(tags, "TEMPO_WIN");
    } else {
      reasons.push("projection suggests opponents can retake control quickly");
    }
  }

  const partner = getPartnerSeat(actor);
  const partnerControlsNext = currentWinnerIsPartner(nextState, actor);
  const partnerBeatCount =
    partnerControlsNext && nextState.currentTrick
      ? getOpponentSeats(actor).filter((opponent) =>
          canOpponentBeatCombination(nextState, opponent, partner)
        ).length
      : 0;

  if (nextState.activeSeat === partner || (partnerControlsNext && partnerBeatCount === 0)) {
    score += weights.partnerTempoSupport;
    reasons.push("projection leaves the partner in a favorable tempo position");
    appendUniqueTags(tags, "PARTNER_SUPPORT");
  } else if (action.type === "pass_turn" && partnerControlsNext && partnerBeatCount > 0) {
    score -= partnerBeatCount * weights.passiveControlLeakPenaltyPerBeat;
    reasons.push("projection shows partner control is fragile after a passive line");
  }

  const urgency = buildUrgencyProfile(ctx.state, actor);
  if (urgency.opponentOutUrgent) {
    if (action.type === "play_cards" && nextState.currentTrick?.currentWinner === actor) {
      score += weights.urgentStopRetention;
      reasons.push("projection actively stops an opponent-out threat");
      appendUniqueTags(tags, "OPPONENT_STOP");
    } else if (action.type === "pass_turn") {
      score -= weights.urgentPassPenalty;
    }
  }

  if (candidate.teamplay?.justifiedPartnerBomb) {
    score += weights.justifiedBombSwing;
    reasons.push("projection treats the justified partner bomb as a team-saving swing move");
    appendUniqueTags(tags, "BOMB_PIVOT", "OPPONENT_STOP");
  }

  if (action.type === "play_cards" && action.cardIds.includes("dragon")) {
    if (nextState.hands[actor].length === 0 || score > 80) {
      score += weights.dragonDecisive;
      appendUniqueTags(tags, "DRAGON_DECISIVE");
    } else {
      score -= weights.dragonWastePenalty;
    }
  }

  if (action.type === "play_cards" && action.cardIds.includes("phoenix")) {
    if (deadSingleDelta > 0 || finishDelta > 0) {
      score += weights.phoenixShapeGain;
    } else {
      score -= weights.phoenixWastePenalty;
      reasons.push("projection suggests Phoenix is being spent without enough shape gain");
    }
  } else if (beforeEval.phoenixAvailable && afterEval.phoenixAvailable) {
    score += weights.phoenixPreserveBonus;
    appendUniqueTags(tags, "PHOENIX_FLEX_PRESERVE");
  }

  if (action.type === "play_cards" && projection.nextState.finishedOrder[0] === actor) {
    score += weights.finishNowBonus;
  }

  return { score, reasons, tags };
}

function chooseCandidatesForDeepening(
  ctx: HeadlessDecisionContext,
  candidates: CandidateDecision[]
): Set<number> {
  const actor = ctx.state.activeSeat;
  if (!actor || ctx.state.phase !== "trick_play") {
    return new Set<number>();
  }

  const bucketMap = new Map<TacticalBucket, Array<{ index: number; score: number }>>();

  candidates.forEach((candidate, index) => {
    if (candidate.action.type !== "play_cards" && candidate.action.type !== "pass_turn") {
      return;
    }

    if (candidate.actor !== actor && candidate.action.type !== "play_cards") {
      return;
    }

    const bucket = classifyCandidateBucket(ctx, candidate);
    const existing = bucketMap.get(bucket) ?? [];
    existing.push({ index, score: candidate.score });
    existing.sort((left, right) => right.score - left.score);
    bucketMap.set(bucket, existing.slice(0, HEURISTIC_WEIGHTS.tactical.perBucketWindow));
  });

  const selected = new Set<number>();
  for (const items of bucketMap.values()) {
    for (const item of items) {
      selected.add(item.index);
    }
  }

  candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(
      ({ candidate }) =>
        candidate.action.type === "play_cards" ||
        (candidate.actor === actor && candidate.action.type === "pass_turn")
    )
    .sort((left, right) => right.candidate.score - left.candidate.score)
    .slice(0, HEURISTIC_WEIGHTS.tactical.topCandidateWindow)
    .forEach(({ index }) => {
      selected.add(index);
    });

  return selected;
}

export function deepenTacticalCandidates(
  ctx: HeadlessDecisionContext,
  candidates: CandidateDecision[]
): CandidateDecision[] {
  const actor = ctx.state.activeSeat;
  if (!actor || ctx.state.phase !== "trick_play") {
    return candidates;
  }

  const selected = chooseCandidatesForDeepening(ctx, candidates);
  if (selected.size === 0) {
    return candidates;
  }

  return candidates.map((candidate, index) => {
    if (!selected.has(index)) {
      return candidate;
    }

    if (candidate.action.type !== "play_cards" && candidate.action.type !== "pass_turn") {
      return candidate;
    }

    const projection = scoreControlRetention(ctx, actor, candidate);
    if (projection.reasons.length === 0 && projection.tags.length === 0 && projection.score === 0) {
      return candidate;
    }

    const mergedTags = [...candidate.tags];
    appendUniqueTags(mergedTags, ...projection.tags);

    return {
      ...candidate,
      score: candidate.score + projection.score,
      reasons: [...candidate.reasons, ...projection.reasons],
      tags: mergedTags
    };
  });
}
