import type { EngineAction, GameState, SeatId } from "@tichuml/engine";
import type { HeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { buildHandEvaluation, buildHandEvaluationAfterRemovingCards } from "./HandAnalysis.js";
import { partnerHasCalledTichu } from "./HeuristicContext.js";
import type { CandidateDecision, CardPassMetrics, HandEvaluation, PassScoringContext } from "./types.js";
import { appendUniqueTags, cardStrength, isPointCard } from "./utils.js";

function scoreCardForOpponentPass(
  analysis: HandEvaluation,
  projectedAnalysis: HandEvaluation,
  metric: CardPassMetrics,
  context: PassScoringContext
): number {
  const weights = HEURISTIC_WEIGHTS.pass.opponent;
  let score = 0;

  if (metric.isDog && analysis.tichuViable && !context.selfCalled) {
    score += weights.tichuDumpDog;
  }

  if (metric.card.kind === "standard") {
    score += (15 - metric.card.rank) * weights.lowRankBase;
    if (metric.card.rank <= 6) {
      score += weights.smallRankBonus;
    } else if (metric.card.rank <= 9) {
      score += weights.midRankBonus;
    }
  } else if (!metric.isDog) {
    score -= 220;
  }

  if (metric.comboCount <= 1) {
    score += weights.lowComboCount;
  }
  if (metric.rankCount === 1) {
    score += weights.singleton;
  }
  if (metric.neighborCount === 0) {
    score += weights.isolated;
  }
  if (metric.pairLikeCount === 0 && metric.straightLikeCount === 0) {
    score += weights.nonStructured;
  }
  if (isPointCard(metric.card)) {
    score -= weights.pointPenalty;
  }

  if (context.selfCalled) {
    score -= metric.supportScore * weights.selfCalledStructurePenalty;
    if (metric.isDog) {
      score -= weights.selfCalledDogPenalty;
    }
  }

  if (analysis.protectedCardIds.has(metric.card.id)) {
    score -= weights.protectedPenalty;
  }
  if (metric.isControl) {
    score -= weights.controlPenalty;
  }
  if (metric.isHighRank) {
    score -= weights.highRankPenalty;
  }

  score += (projectedAnalysis.finishPlanScore - analysis.finishPlanScore) * 1.15;
  score += (analysis.deadSingleCount - projectedAnalysis.deadSingleCount) * 18;
  score += (projectedAnalysis.fragmentation - analysis.fragmentation) * -12;

  return score;
}

function scoreCardForPartnerPass(
  analysis: HandEvaluation,
  projectedAnalysis: HandEvaluation,
  metric: CardPassMetrics,
  context: PassScoringContext
): number {
  const weights = HEURISTIC_WEIGHTS.pass.partner;
  let score = 0;

  if (metric.card.kind === "standard") {
    if (metric.card.rank >= 7 && metric.card.rank <= 10) {
      score += weights.connectorRange;
    } else if (metric.card.rank >= 11 && !analysis.tichuViable && !context.selfCalled) {
      score += weights.premiumWithoutTichu;
    } else if (metric.card.rank <= 4) {
      score -= weights.lowRankPenalty;
    }
  }

  score += metric.neighborCount * weights.neighbor;
  if (metric.rankCount === 2 && metric.card.kind === "standard" && metric.card.rank <= 10) {
    score += weights.pairGift;
  }
  if (metric.straightLikeCount > 0 && metric.maxComboSize >= 5) {
    score += weights.straightGift;
  }
  if (metric.comboCount <= 1) {
    score -= weights.isolatedPenalty;
  }
  if (context.partnerCalled) {
    score += metric.supportScore * weights.partnerCalledSupportScalar;
    if (metric.card.kind === "standard" && metric.card.rank >= 9) {
      score += weights.partnerCalledHighBonus;
    }
  }
  if (context.selfCalled) {
    score -= metric.supportScore * weights.selfCalledSupportPenaltyScalar;
    if (metric.card.kind === "standard" && metric.card.rank >= 11) {
      score -= weights.selfCalledHighPenalty;
    }
  }

  if (analysis.protectedCardIds.has(metric.card.id)) {
    score -= weights.protectedPenalty;
  }
  if (metric.isControl) {
    score -= weights.controlPenalty;
  }
  if (metric.isDog && analysis.tichuViable) {
    score -= weights.dogTichuPenalty;
  }

  score += (projectedAnalysis.finishPlanScore - analysis.finishPlanScore) * 1.05;
  score += (analysis.deadSingleCount - projectedAnalysis.deadSingleCount) * 16;
  score +=
    (projectedAnalysis.longestStraightLength - analysis.longestStraightLength) * 9 +
    (projectedAnalysis.longestPairSequenceLength - analysis.longestPairSequenceLength) * 8;

  return score;
}

export function createPassSelectionAction(state: GameState, seat: SeatId): EngineAction {
  const available = [...state.hands[seat]];
  const analysis = buildHandEvaluation(state, seat);
  const projectedByCard = new Map(
    available.map((card) => [
      card.id,
      buildHandEvaluationAfterRemovingCards(state, seat, [card.id])
    ])
  );
  const context: PassScoringContext = {
    partnerCalled: partnerHasCalledTichu(state, seat),
    selfCalled: state.calls[seat].smallTichu || state.calls[seat].grandTichu
  };
  const byOpponentPriority = [...available].sort((left, right) => {
    const leftScore = scoreCardForOpponentPass(
      analysis,
      projectedByCard.get(left.id)!,
      analysis.cardMetrics.get(left.id)!,
      context
    );
    const rightScore = scoreCardForOpponentPass(
      analysis,
      projectedByCard.get(right.id)!,
      analysis.cardMetrics.get(right.id)!,
      context
    );
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const strengthDifference = cardStrength(left) - cardStrength(right);
    if (strengthDifference !== 0) {
      return strengthDifference;
    }

    return left.id.localeCompare(right.id);
  });
  const left = byOpponentPriority[0];
  const right = byOpponentPriority.find((card) => card.id !== left?.id);
  const remainingForPartner = available.filter(
    (card) => card.id !== left?.id && card.id !== right?.id
  );
  const partner = [...remainingForPartner].sort((leftCard, rightCard) => {
    const leftScore = scoreCardForPartnerPass(
      analysis,
      projectedByCard.get(leftCard.id)!,
      analysis.cardMetrics.get(leftCard.id)!,
      context
    );
    const rightScore = scoreCardForPartnerPass(
      analysis,
      projectedByCard.get(rightCard.id)!,
      analysis.cardMetrics.get(rightCard.id)!,
      context
    );
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const strengthDifference = cardStrength(leftCard) - cardStrength(rightCard);
    if (strengthDifference !== 0) {
      return strengthDifference;
    }

    return leftCard.id.localeCompare(rightCard.id);
  })[0];

  if (!left || !right || !partner) {
    throw new Error(`Seat ${seat} cannot choose a full pass selection.`);
  }

  return {
    type: "select_pass",
    seat,
    left: left.id,
    partner: partner.id,
    right: right.id
  };
}

export function scorePassSelection(
  state: GameState,
  seat: SeatId,
  action: EngineAction,
  analyzer?: HeuristicFeatureAnalyzer
): CandidateDecision {
  if (action.type !== "select_pass") {
    return {
      actor: seat,
      action,
      score: 0,
      tags: [],
      reasons: ["not a pass-selection action"]
    };
  }

  const leftCard = state.hands[seat].find((card) => card.id === action.left);
  const partnerCard = state.hands[seat].find((card) => card.id === action.partner);
  const rightCard = state.hands[seat].find((card) => card.id === action.right);

  if (!leftCard || !partnerCard || !rightCard) {
    throw new Error("Selected pass cards must come from the acting seat hand.");
  }

  const analysis = buildHandEvaluation(state, seat);
  const leftProjected = buildHandEvaluationAfterRemovingCards(state, seat, [leftCard.id]);
  const partnerProjected = buildHandEvaluationAfterRemovingCards(state, seat, [partnerCard.id]);
  const rightProjected = buildHandEvaluationAfterRemovingCards(state, seat, [rightCard.id]);
  const context: PassScoringContext = {
    partnerCalled: partnerHasCalledTichu(state, seat),
    selfCalled: state.calls[seat].smallTichu || state.calls[seat].grandTichu
  };
  let score =
    HEURISTIC_WEIGHTS.pass.selectionBase +
    scoreCardForPartnerPass(
      analysis,
      partnerProjected,
      analysis.cardMetrics.get(partnerCard.id)!,
      context
    ) +
    scoreCardForOpponentPass(
      analysis,
      leftProjected,
      analysis.cardMetrics.get(leftCard.id)!,
      context
    ) +
    scoreCardForOpponentPass(
      analysis,
      rightProjected,
      analysis.cardMetrics.get(rightCard.id)!,
      context
    );
  const reasons = [
    context.selfCalled || analysis.tichuViable
      ? "protects Tichu-grade control, structure, and point cards while bleeding weak cards away"
      : "keeps higher-value combo pieces while distributing weaker cards",
    context.partnerCalled
      ? "partner lane feeds useful structure because partner already has an active Tichu line"
      : "partner lane prioritizes useful connectors over premium control cards"
  ];
  const tags: CandidateDecision["tags"] = [];
  const features = analyzer?.getCandidateFeatures(seat, action);

  appendUniqueTags(tags, "GIFT_PARTNER", "DUMP_LOW_IMPACT", "PASS_GIFT_PARTNER", "PASS_DUMP_LOW_IMPACT");
  if (
    analysis.protectedCardIds.has(partnerCard.id) ||
    analysis.protectedCardIds.has(leftCard.id) ||
    analysis.protectedCardIds.has(rightCard.id)
  ) {
    appendUniqueTags(tags, "PRESERVE_BOMB");
  }

  if (features) {
    const projected = features.projected_state;
    score += features.future_hand_quality_delta * 0.12;
    score += features.structure_preservation_score * 0.08;
    score += features.dead_singles_reduction * 4;
    score -= features.resource_cost_score * 0.03;

    if ((projected?.combo_count ?? features.combo_count_before) >= features.combo_count_before) {
      reasons.push("shared tactical features keep or improve projected combo density after the pass");
      appendUniqueTags(tags, "PRESERVE_STRUCTURE");
    }
  }

  return {
    actor: seat,
    action,
    score,
    tags,
    reasons,
    ...(features ? { features } : {})
  };
}
