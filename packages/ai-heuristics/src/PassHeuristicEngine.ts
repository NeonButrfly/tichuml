import { getLeftSeat, getRightSeat, type EngineAction, type GameState, type SeatId } from "@tichuml/engine";
import type { HeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { buildHandEvaluation, buildHandEvaluationAfterRemovingCards } from "./HandAnalysis.js";
import { partnerHasCalledTichu } from "./HeuristicContext.js";
import type {
  CandidateDecision,
  CardPassMetrics,
  HandEvaluation,
  PassScoringContext,
  PassSelectionMetadata
} from "./types.js";
import { appendUniqueTags, cardStrength, isPointCard } from "./utils.js";

type PreparedPassSelection = {
  analysis: HandEvaluation;
  cardsById: Map<string, ReturnType<typeof buildHandEvaluation>["cardMetrics"] extends Map<string, infer _T> ? CardPassMetrics["card"] : never>;
  context: PassScoringContext;
  leftRightOpponentSymmetric: boolean;
  singleSelfPreservationByCard: Map<string, number>;
  opponentScoreByCard: Map<string, number>;
  partnerScoreByCard: Map<string, number>;
  combinedProjectedByKey: Map<string, HandEvaluation>;
};

function sortedCardKey(cardIds: string[]): string {
  return [...cardIds].sort().join("|");
}

function preparePassSelection(
  state: GameState,
  seat: SeatId
): PreparedPassSelection {
  const analysis = buildHandEvaluation(state, seat);
  const cardsById = new Map(state.hands[seat].map((card) => [card.id, card]));
  const context: PassScoringContext = {
    partnerCalled: partnerHasCalledTichu(state, seat),
    selfCalled: state.calls[seat].smallTichu || state.calls[seat].grandTichu
  };
  const leftOpponent = getLeftSeat(seat);
  const rightOpponent = getRightSeat(seat);
  const leftRightOpponentSymmetric =
    (state.calls[leftOpponent].smallTichu || state.calls[leftOpponent].grandTichu) ===
    (state.calls[rightOpponent].smallTichu || state.calls[rightOpponent].grandTichu);
  const singleSelfPreservationByCard = new Map<string, number>();
  const opponentScoreByCard = new Map<string, number>();
  const partnerScoreByCard = new Map<string, number>();

  for (const card of state.hands[seat]) {
    const metric = analysis.cardMetrics.get(card.id)!;
    singleSelfPreservationByCard.set(
      card.id,
      scoreSingleCardRemovalApprox(analysis, metric, context)
    );
    opponentScoreByCard.set(
      card.id,
      scoreCardForOpponentPass(
        analysis,
        metric,
        context
      )
    );
    partnerScoreByCard.set(
      card.id,
      scoreCardForPartnerPass(
        analysis,
        metric,
        context
      )
    );
  }

  return {
    analysis,
    cardsById,
    context,
    leftRightOpponentSymmetric,
    singleSelfPreservationByCard,
    opponentScoreByCard,
    partnerScoreByCard,
    combinedProjectedByKey: new Map<string, HandEvaluation>()
  };
}

function getCombinedProjected(
  state: GameState,
  seat: SeatId,
  prepared: PreparedPassSelection,
  cardIds: string[]
): HandEvaluation {
  const cacheKey = sortedCardKey(cardIds);
  const cached = prepared.combinedProjectedByKey.get(cacheKey);
  if (cached) {
    return cached;
  }
  const projected = buildHandEvaluationAfterRemovingCards(state, seat, cardIds);
  prepared.combinedProjectedByKey.set(cacheKey, projected);
  return projected;
}

function scoreCardForOpponentPass(
  analysis: HandEvaluation,
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

  return score;
}

function scoreCardForPartnerPass(
  analysis: HandEvaluation,
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

  return score;
}

function scoreSelfPreservationDelta(
  analysis: HandEvaluation,
  projectedAnalysis: HandEvaluation
): number {
  return (
    (projectedAnalysis.finishPlanScore - analysis.finishPlanScore) * 1.4 +
    (analysis.deadSingleCount - projectedAnalysis.deadSingleCount) * 24 +
    (analysis.longestStraightLength - projectedAnalysis.longestStraightLength) * -10 +
    (analysis.longestPairSequenceLength -
      projectedAnalysis.longestPairSequenceLength) *
      -8 +
    (analysis.fragmentation - projectedAnalysis.fragmentation) * 16
  );
}

function scoreSingleCardRemovalApprox(
  analysis: HandEvaluation,
  metric: CardPassMetrics,
  context: PassScoringContext
): number {
  let score = 0;

  if (metric.comboCount <= 1) {
    score += 42;
  } else {
    score -= (metric.comboCount - 1) * 10;
  }
  if (metric.rankCount === 1) {
    score += 28;
  }
  if (metric.neighborCount === 0) {
    score += 24;
  } else {
    score -= metric.neighborCount * 7;
  }
  if (metric.pairLikeCount === 0 && metric.straightLikeCount === 0) {
    score += 18;
  }

  score -= metric.supportScore * 1.5;

  if (analysis.protectedCardIds.has(metric.card.id)) {
    score -= 140;
  }
  if (metric.isControl) {
    score -= 160;
  }
  if (metric.isHighRank) {
    score -= 50;
  }
  if (isPointCard(metric.card)) {
    score -= 18;
  }
  if (metric.isDog && analysis.tichuViable) {
    score -= context.selfCalled ? 180 : 120;
  }
  if (context.partnerCalled && metric.card.kind === "standard" && metric.card.rank >= 8) {
    score -= 20;
  }
  if (context.selfCalled) {
    score -= 30;
  }

  return score;
}

function comparePassActions(
  left: Extract<EngineAction, { type: "select_pass" }>,
  right: Extract<EngineAction, { type: "select_pass" }>
): number {
  return `${left.left}|${left.partner}|${left.right}`.localeCompare(
    `${right.left}|${right.partner}|${right.right}`
  );
}

function buildPassSelectionEvaluation(
  state: GameState,
  seat: SeatId,
  action: Extract<EngineAction, { type: "select_pass" }>,
  preparedInput?: PreparedPassSelection
): {
  score: number;
  reasons: string[];
  tags: CandidateDecision["tags"];
  passBundle: PassSelectionMetadata;
} {
  const prepared = preparedInput ?? preparePassSelection(state, seat);
  const leftCard = prepared.cardsById.get(action.left);
  const partnerCard = prepared.cardsById.get(action.partner);
  const rightCard = prepared.cardsById.get(action.right);

  if (!leftCard || !partnerCard || !rightCard) {
    throw new Error("Selected pass cards must come from the acting seat hand.");
  }

  const analysis = prepared.analysis;
  const combinedProjected = getCombinedProjected(state, seat, prepared, [
    leftCard.id,
    partnerCard.id,
    rightCard.id
  ]);
  const context = prepared.context;

  const leftScore = prepared.opponentScoreByCard.get(leftCard.id)!;
  const partnerScore = prepared.partnerScoreByCard.get(partnerCard.id)!;
  const rightScore = prepared.opponentScoreByCard.get(rightCard.id)!;
  const selfPreservationScore = scoreSelfPreservationDelta(
    analysis,
    combinedProjected
  );

  const score =
    HEURISTIC_WEIGHTS.pass.selectionBase +
    leftScore +
    partnerScore +
    rightScore +
    selfPreservationScore;

  const protectedCardPassed =
    analysis.protectedCardIds.has(leftCard.id) ||
    analysis.protectedCardIds.has(partnerCard.id) ||
    analysis.protectedCardIds.has(rightCard.id);
  const controlCardPassed =
    analysis.cardMetrics.get(leftCard.id)?.isControl === true ||
    analysis.cardMetrics.get(partnerCard.id)?.isControl === true ||
    analysis.cardMetrics.get(rightCard.id)?.isControl === true;
  const pointCardToOpponent = Number(isPointCard(leftCard)) + Number(isPointCard(rightCard));
  const pointCardToPartner = Number(isPointCard(partnerCard));
  const leftOpponent = getLeftSeat(seat);
  const rightOpponent = getRightSeat(seat);
  const leftOpponentCalledTichu =
    state.calls[leftOpponent].smallTichu || state.calls[leftOpponent].grandTichu;
  const rightOpponentCalledTichu =
    state.calls[rightOpponent].smallTichu || state.calls[rightOpponent].grandTichu;

  const passReasonTags: string[] = [];
  if (selfPreservationScore >= 0) {
    passReasonTags.push("preserve_self_structure");
  }
  if (context.partnerCalled) {
    passReasonTags.push("support_partner_tichu");
  }
  if (context.selfCalled || analysis.tichuViable) {
    passReasonTags.push("protect_tichu_line");
  }
  if (leftOpponentCalledTichu || rightOpponentCalledTichu) {
    passReasonTags.push("deny_opponent_tichu_help");
  }
  if (pointCardToOpponent === 0) {
    passReasonTags.push("avoid_point_gifts_to_opponents");
  }
  if (!protectedCardPassed && !controlCardPassed) {
    passReasonTags.push("avoid_protected_control_leaks");
  }

  const reasons = [
    context.selfCalled || analysis.tichuViable
      ? "protects Tichu-grade control, structure, and point cards while bleeding weak cards away"
      : "keeps higher-value combo pieces while distributing weaker cards",
    context.partnerCalled
      ? "partner lane feeds useful structure because partner already has an active Tichu line"
      : "partner lane prioritizes useful connectors over premium control cards",
  ];
  const tags: CandidateDecision["tags"] = [];
  appendUniqueTags(tags, "GIFT_PARTNER", "DUMP_LOW_IMPACT", "PASS_GIFT_PARTNER", "PASS_DUMP_LOW_IMPACT");
  if (!protectedCardPassed && selfPreservationScore >= 0) {
    appendUniqueTags(tags, "PRESERVE_STRUCTURE");
  }
  if (protectedCardPassed) {
    reasons.push("selected bundle still leaks at least one protected card because cleaner three-card assignments score worse overall");
  }

  return {
    score,
    reasons,
    tags,
    passBundle: {
      selected_left_card_id: leftCard.id,
      selected_partner_card_id: partnerCard.id,
      selected_right_card_id: rightCard.id,
      bundle_score: score,
      self_preservation_score: selfPreservationScore,
      opponent_dump_score_left: leftScore,
      opponent_dump_score_right: rightScore,
      partner_support_score: partnerScore,
      self_structure_delta: combinedProjected.finishPlanScore - analysis.finishPlanScore,
      dead_singles_delta: combinedProjected.deadSingleCount - analysis.deadSingleCount,
      protected_card_passed: protectedCardPassed,
      control_card_passed: controlCardPassed,
      point_card_to_opponent: pointCardToOpponent,
      point_card_to_partner: pointCardToPartner,
      partner_called_tichu: context.partnerCalled,
      self_called_tichu: context.selfCalled,
      left_opponent_called_tichu: leftOpponentCalledTichu,
      right_opponent_called_tichu: rightOpponentCalledTichu,
      pass_reason_tags: passReasonTags
    }
  };
}

type ApproximatePassBundle = {
  action: Extract<EngineAction, { type: "select_pass" }>;
  approximateScore: number;
};

function compareApproximateBundles(
  left: ApproximatePassBundle,
  right: ApproximatePassBundle
): number {
  if (right.approximateScore !== left.approximateScore) {
    return right.approximateScore - left.approximateScore;
  }
  return comparePassActions(left.action, right.action);
}

function pushApproximatePassBundle(
  target: ApproximatePassBundle[],
  candidate: ApproximatePassBundle,
  limit: number
): void {
  target.push(candidate);
  target.sort(compareApproximateBundles);
  if (target.length > limit) {
    target.length = limit;
  }
}

export function createPassSelectionAction(state: GameState, seat: SeatId): EngineAction {
  const available = [...state.hands[seat]];
  if (available.length < 3) {
    throw new Error(`Seat ${seat} cannot choose a full pass selection.`);
  }
  const prepared = preparePassSelection(state, seat);
  const opponentRanked = [...available]
    .sort((left, right) => {
      const leftScore = prepared.opponentScoreByCard.get(left.id)!;
      const rightScore = prepared.opponentScoreByCard.get(right.id)!;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      const strengthDifference = cardStrength(left) - cardStrength(right);
      if (strengthDifference !== 0) {
        return strengthDifference;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);
  const partnerRanked = [...available]
    .sort((left, right) => {
      const leftScore = prepared.partnerScoreByCard.get(left.id)!;
      const rightScore = prepared.partnerScoreByCard.get(right.id)!;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      const strengthDifference = cardStrength(left) - cardStrength(right);
      if (strengthDifference !== 0) {
        return strengthDifference;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);
  const selfPreservationRanked = [...available]
    .sort((left, right) => {
      const leftScore = prepared.singleSelfPreservationByCard.get(left.id)!;
      const rightScore = prepared.singleSelfPreservationByCard.get(right.id)!;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      const strengthDifference = cardStrength(left) - cardStrength(right);
      if (strengthDifference !== 0) {
        return strengthDifference;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);
  const candidateIds = new Set<string>([
    ...opponentRanked.map((card) => card.id),
    ...partnerRanked.map((card) => card.id),
    ...selfPreservationRanked.map((card) => card.id)
  ]);
  const opponentCandidates = available.filter((card) => candidateIds.has(card.id));
  const partnerCandidates = available.filter((card) => candidateIds.has(card.id));
  const approximateBundles: ApproximatePassBundle[] = [];
  const exactBundleLimit = 20;
  const cardOrder = new Map(available.map((card, index) => [card.id, index]));
  let bestAction: Extract<EngineAction, { type: "select_pass" }> | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const left of opponentCandidates) {
    for (const partner of partnerCandidates) {
      if (partner.id === left.id) {
        continue;
      }
      for (const right of opponentCandidates) {
        if (right.id === left.id || right.id === partner.id) {
          continue;
        }
        if (
          prepared.leftRightOpponentSymmetric &&
          (cardOrder.get(right.id) ?? 0) < (cardOrder.get(left.id) ?? 0)
        ) {
          continue;
        }
        const candidate: Extract<EngineAction, { type: "select_pass" }> = {
          type: "select_pass",
          seat,
          left: left.id,
          partner: partner.id,
          right: right.id
        };
        const approximateScore =
          HEURISTIC_WEIGHTS.pass.selectionBase +
          prepared.opponentScoreByCard.get(left.id)! +
          prepared.partnerScoreByCard.get(partner.id)! +
          prepared.opponentScoreByCard.get(right.id)! +
          prepared.singleSelfPreservationByCard.get(left.id)! +
          prepared.singleSelfPreservationByCard.get(partner.id)! +
          prepared.singleSelfPreservationByCard.get(right.id)!;
        pushApproximatePassBundle(
          approximateBundles,
          {
            action: candidate,
            approximateScore
          },
          exactBundleLimit
        );
      }
    }
  }

  for (const bundle of approximateBundles) {
    const evaluation = buildPassSelectionEvaluation(
      state,
      seat,
      bundle.action,
      prepared
    );
    if (
      evaluation.score > bestScore ||
      (evaluation.score === bestScore &&
        bestAction !== null &&
        comparePassActions(bundle.action, bestAction) < 0)
    ) {
      bestAction = bundle.action;
      bestScore = evaluation.score;
    } else if (bestAction === null) {
      bestAction = bundle.action;
      bestScore = evaluation.score;
    }
  }

  if (!bestAction) {
    throw new Error(`Seat ${seat} cannot choose a full pass selection.`);
  }
  return bestAction;
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

  const evaluation = buildPassSelectionEvaluation(state, seat, action);
  let score = evaluation.score;
  const reasons = [...evaluation.reasons];
  const tags: CandidateDecision["tags"] = [...evaluation.tags];
  const features = analyzer?.getCandidateFeatures(seat, action);

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
    passBundle: {
      ...evaluation.passBundle,
      bundle_score: score
    },
    ...(features ? { features } : {})
  };
}
