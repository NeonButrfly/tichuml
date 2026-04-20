import {
  SYSTEM_ACTOR,
  applyEngineAction,
  getOpponentSeats,
  getPartnerSeat,
  type EngineAction,
  type GameState,
  type LegalAction,
  type SeatId
} from "@tichuml/engine";
import {
  buildHandEvaluation,
  buildHandEvaluationAfterRemovingCards,
  getStructurePenaltyForPlay
} from "./HandAnalysis.js";
import {
  buildUrgencyProfile,
  canOpponentBeatCombination,
  currentWinnerIsPartner,
  hasOpponentCalledTichu,
  partnerHasCalledTichu,
  cloneState
} from "./HeuristicContext.js";
import type {
  CandidateActionFeatureSnapshot,
  HandEvaluation,
  HeadlessDecisionContext,
  TacticalFeatureSnapshot,
  UrgencyMode
} from "./types.js";
import { getConcreteActionSortKey } from "./utils.js";

export type HeuristicFeatureAnalyzer = {
  getHandEvaluation(seat: SeatId): HandEvaluation;
  getStateFeatures(seat: SeatId): TacticalFeatureSnapshot;
  getCandidateFeatures(
    actor: SeatId | typeof SYSTEM_ACTOR,
    action: EngineAction,
    legalAction?: LegalAction
  ): CandidateActionFeatureSnapshot | null;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveUrgencyMode(state: GameState, seat: SeatId): UrgencyMode {
  const urgency = buildUrgencyProfile(state, seat);
  if (
    (urgency.opponentOutUrgent && urgency.selfNearOut) ||
    (urgency.selfNearOut && urgency.partnerNearOut)
  ) {
    return "endgame";
  }
  if (urgency.opponentOutUrgent) {
    return "opponent_near_out";
  }
  if (urgency.selfNearOut) {
    return "self_near_out";
  }
  if (urgency.yieldToPartner || urgency.partnerNearOut) {
    return "partner_support";
  }
  return "normal";
}

function buildEndgamePressure(state: GameState, seat: SeatId): number {
  const urgency = buildUrgencyProfile(state, seat);
  const selfCards = state.hands[seat].length;
  const partnerCards = state.hands[getPartnerSeat(seat)].length;
  const minOpponentCards = urgency.minOpponentCards;
  return round2(
    (urgency.opponentOutUrgent ? 55 : 0) +
      (urgency.selfNearOut ? 45 : 0) +
      (urgency.partnerNearOut ? 30 : 0) +
      Math.max(0, 8 - selfCards) * 3 +
      Math.max(0, 8 - partnerCards) * 1.5 +
      Math.max(0, 8 - minOpponentCards) * 2.2
  );
}

function buildOpponentThreatEstimate(
  state: GameState,
  seat: SeatId
): number {
  const urgency = buildUrgencyProfile(state, seat);
  const currentWinner = state.currentTrick?.currentWinner;
  return round2(
    (urgency.minOpponentCards <= 1
      ? 100
      : urgency.minOpponentCards <= 2
        ? 82
        : urgency.minOpponentCards <= 3
          ? 58
          : urgency.minOpponentCards <= 5
            ? 30
            : 12) +
      (hasOpponentCalledTichu(state, seat) ? 16 : 0) +
      (currentWinner !== null &&
      currentWinner !== undefined &&
      currentWinner !== seat &&
      currentWinner !== getPartnerSeat(seat)
        ? 10
        : 0)
  );
}

function buildPartnerAdvantageEstimate(
  state: GameState,
  seat: SeatId,
  getEvaluation: (seatId: SeatId) => HandEvaluation
): number {
  const partner = getPartnerSeat(seat);
  const partnerEval = getEvaluation(partner);
  const opponentBest = Math.max(
    ...getOpponentSeats(seat).map((opponent) => {
      const opponentEval = getEvaluation(opponent);
      return opponentEval.handQualityScore - state.hands[opponent].length * 9;
    })
  );
  const partnerScore =
    partnerEval.handQualityScore -
    state.hands[partner].length * 9 +
    (partnerHasCalledTichu(state, seat) ? 10 : 0);

  return round2((partnerScore - opponentBest) / 10);
}

function buildControlValueScore(
  state: GameState,
  seat: SeatId,
  evaluation: HandEvaluation,
  opponentThreatEstimate: number
): number {
  const urgency = buildUrgencyProfile(state, seat);
  return round2(
    evaluation.controlCount * 16 +
      evaluation.bombCount * 24 +
      (state.currentTrick === null ? 8 : 0) +
      opponentThreatEstimate * 0.35 -
      (urgency.yieldToPartner ? 8 : 0)
  );
}

function buildPremiumResourcePressure(
  evaluation: HandEvaluation,
  opponentThreatEstimate: number,
  endgamePressure: number
): number {
  const resourceCushion =
    evaluation.bombCount * 24 +
    evaluation.controlCount * 10 +
    (evaluation.dragonAvailable ? 12 : 0) +
    (evaluation.phoenixAvailable ? 8 : 0);

  return round2(
    Math.max(
      0,
      opponentThreatEstimate * 0.6 + endgamePressure * 0.45 - resourceCushion
    )
  );
}

function buildSnapshotFromState(
  state: GameState,
  seat: SeatId,
  getEvaluation: (seatId: SeatId) => HandEvaluation
): TacticalFeatureSnapshot {
  const evaluation = getEvaluation(seat);
  const opponentThreatEstimate = buildOpponentThreatEstimate(state, seat);
  const endgamePressure = buildEndgamePressure(state, seat);

  return {
    seat,
    hand_size: state.hands[seat].length,
    hand_quality_score: round2(evaluation.handQualityScore),
    finishability_score: round2(evaluation.finishPlanScore),
    singles_count: evaluation.singlesCount,
    dead_singles_count: evaluation.deadSingleCount,
    pairs_count: evaluation.pairCount,
    triples_count: evaluation.trioCount,
    straights_count: evaluation.straightsCount,
    pair_runs_count: evaluation.pairRunsCount,
    bombs_count: evaluation.bombCount,
    control_cards_count: evaluation.controlCount,
    isolated_high_singles_count: evaluation.isolatedHighSinglesCount,
    isolated_low_singles_count: evaluation.isolatedLowSinglesCount,
    combo_count: evaluation.comboCount,
    control_value_score: buildControlValueScore(
      state,
      seat,
      evaluation,
      opponentThreatEstimate
    ),
    partner_advantage_estimate: buildPartnerAdvantageEstimate(
      state,
      seat,
      getEvaluation
    ),
    opponent_threat_estimate: opponentThreatEstimate,
    urgency_mode: resolveUrgencyMode(state, seat),
    endgame_pressure: endgamePressure,
    bomb_count_in_hand: evaluation.bombCount,
    dragon_in_hand: evaluation.dragonAvailable,
    phoenix_in_hand: evaluation.phoenixAvailable,
    dog_in_hand: evaluation.dogAvailable,
    mahjong_in_hand: evaluation.mahjongAvailable,
    premium_resource_pressure: buildPremiumResourcePressure(
      evaluation,
      opponentThreatEstimate,
      endgamePressure
    )
  };
}

function extractActionCardIds(action: EngineAction): string[] {
  switch (action.type) {
    case "play_cards":
      return action.cardIds;
    case "select_pass":
      return [action.left, action.partner, action.right];
    default:
      return [];
  }
}

function buildProjectedStateForAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  action: EngineAction,
  nextState: GameState | null
): GameState {
  if (action.type === "select_pass") {
    const projectedState = cloneState(ctx.state);
    projectedState.hands[actor] = projectedState.hands[actor].filter(
      (card) => ![action.left, action.partner, action.right].includes(card.id)
    );
    return projectedState;
  }

  if (nextState) {
    return nextState;
  }

  if (action.type === "play_cards") {
    const projectedState = cloneState(ctx.state);
    projectedState.hands[actor] = projectedState.hands[actor].filter(
      (card) => !action.cardIds.includes(card.id)
    );
    return projectedState;
  }

  return ctx.state;
}

function buildProjectedEvaluation(
  state: GameState,
  seat: SeatId,
  action: EngineAction
): HandEvaluation {
  const cardIds = extractActionCardIds(action);
  if (cardIds.length > 0) {
    return buildHandEvaluationAfterRemovingCards(state, seat, cardIds);
  }
  return buildHandEvaluation(state, seat);
}

function estimateControlRetention(
  state: GameState,
  actor: SeatId,
  action: EngineAction,
  nextState: GameState | null,
  likelyWinsCurrentTrick: boolean
): number {
  if (!nextState) {
    return 0;
  }

  if (action.type === "pass_turn") {
    if (!currentWinnerIsPartner(nextState, actor)) {
      return 0;
    }
    const liveBeatCount = getOpponentSeats(actor).filter((opponent) =>
      canOpponentBeatCombination(nextState, opponent, getPartnerSeat(actor))
    ).length;
    return round2(
      liveBeatCount === 0 ? 72 : liveBeatCount === 1 ? 44 : 18
    );
  }

  if (action.type !== "play_cards") {
    return 0;
  }

  if (!likelyWinsCurrentTrick) {
    if (action.cardIds.includes("dog") && nextState.activeSeat === getPartnerSeat(actor)) {
      return 62;
    }
    return 0;
  }

  if (!nextState.currentTrick) {
    return 55;
  }

  const liveBeatCount = getOpponentSeats(actor).filter((opponent) =>
    canOpponentBeatCombination(nextState, opponent, actor)
  ).length;

  return round2(
    liveBeatCount === 0 ? 100 : liveBeatCount === 1 ? 66 : liveBeatCount === 2 ? 32 : 12
  );
}

function resolveComboMetadata(
  legalAction?: LegalAction
): {
  combo_type: string | null;
  combo_rank: number | null;
  combo_length: number | null;
  uses_bomb: boolean;
  satisfies_wish: boolean;
} {
  if (!legalAction || legalAction.type !== "play_cards") {
    return {
      combo_type: null,
      combo_rank: null,
      combo_length: null,
      uses_bomb: false,
      satisfies_wish: false
    };
  }

  return {
    combo_type: legalAction.combination.kind,
    combo_rank: legalAction.combination.primaryRank,
    combo_length: legalAction.combination.cardCount,
    uses_bomb: legalAction.combination.isBomb,
    satisfies_wish: false
  };
}

export function createHeuristicFeatureAnalyzer(
  ctx: HeadlessDecisionContext
): HeuristicFeatureAnalyzer {
  const evaluationCache = new Map<SeatId, HandEvaluation>();
  const stateFeatureCache = new Map<SeatId, TacticalFeatureSnapshot>();
  const candidateFeatureCache = new Map<string, CandidateActionFeatureSnapshot | null>();

  const getHandEvaluation = (seat: SeatId): HandEvaluation => {
    const cached = evaluationCache.get(seat);
    if (cached) {
      return cached;
    }
    const evaluation = buildHandEvaluation(ctx.state, seat);
    evaluationCache.set(seat, evaluation);
    return evaluation;
  };

  const getStateFeatures = (seat: SeatId): TacticalFeatureSnapshot => {
    const cached = stateFeatureCache.get(seat);
    if (cached) {
      return cached;
    }
    const snapshot = buildSnapshotFromState(ctx.state, seat, getHandEvaluation);
    stateFeatureCache.set(seat, snapshot);
    return snapshot;
  };

  const getCandidateFeatures = (
    actor: SeatId | typeof SYSTEM_ACTOR,
    action: EngineAction,
    legalAction?: LegalAction
  ): CandidateActionFeatureSnapshot | null => {
    if (actor === SYSTEM_ACTOR) {
      return null;
    }

    const cacheKey = `${actor}|${getConcreteActionSortKey(action)}`;
    if (candidateFeatureCache.has(cacheKey)) {
      return candidateFeatureCache.get(cacheKey) ?? null;
    }

    const beforeSnapshot = getStateFeatures(actor);
    let nextState: GameState | null = null;

    try {
      const projected = applyEngineAction(ctx.state, action);
      nextState = projected.nextState;
    } catch {
      nextState = null;
    }

    const projectedReferenceState = buildProjectedStateForAction(
      ctx,
      actor,
      action,
      nextState
    );
    const projectedEvaluation =
      action.type === "select_pass"
        ? buildHandEvaluation(projectedReferenceState, actor)
        : buildProjectedEvaluation(ctx.state, actor, action);
    const projectedStateSnapshot = buildSnapshotFromState(
      projectedReferenceState,
      actor,
      (seatId) =>
        seatId === actor
          ? projectedEvaluation
          : buildHandEvaluation(projectedReferenceState, seatId)
    );

    const comboMetadata = resolveComboMetadata(legalAction);
    const cardsUsedCount = extractActionCardIds(action).length;
    const deadSinglesReduction =
      beforeSnapshot.dead_singles_count - projectedStateSnapshot.dead_singles_count;
    const comboCountDelta =
      projectedStateSnapshot.combo_count - beforeSnapshot.combo_count;
    const structurePenalty =
      legalAction && legalAction.type === "play_cards"
        ? getStructurePenaltyForPlay(
            ctx.state.hands[actor],
            legalAction,
            Math.max(0, ctx.state.hands[actor].length - cardsUsedCount)
          )
        : 0;
    const structurePreservationScore = round2(
      (projectedStateSnapshot.straights_count - beforeSnapshot.straights_count) * 16 +
        (projectedStateSnapshot.pair_runs_count - beforeSnapshot.pair_runs_count) * 14 +
        (projectedStateSnapshot.pairs_count - beforeSnapshot.pairs_count) * 8 +
        (projectedStateSnapshot.triples_count - beforeSnapshot.triples_count) * 10 +
        deadSinglesReduction * 6 +
        comboCountDelta * 9 -
        structurePenalty * 3
    );

    const usesDragon = action.type === "play_cards" && action.cardIds.includes("dragon");
    const usesPhoenix = action.type === "play_cards" && action.cardIds.includes("phoenix");
    const usesDog = action.type === "play_cards" && action.cardIds.includes("dog");
    const usesMahjong = action.type === "play_cards" && action.cardIds.includes("mahjong");
    const usesBomb = comboMetadata.uses_bomb;
    const likelyWinsCurrentTrick =
      action.type === "play_cards"
        ? nextState?.currentTrick?.currentWinner === actor ||
          (ctx.state.currentTrick === null && !usesDog)
        : false;
    const controlRetentionEstimate = estimateControlRetention(
      ctx.state,
      actor,
      action,
      nextState,
      likelyWinsCurrentTrick
    );
    const satisfiesWish =
      legalAction?.type === "play_cards" && ctx.state.currentWish !== null
        ? legalAction.combination.actualRanks.includes(ctx.state.currentWish)
        : false;
    const overtakesPartner =
      currentWinnerIsPartner(ctx.state, actor) && likelyWinsCurrentTrick;
    const resourceCostScore = round2(
      (usesBomb ? 90 : 0) +
        (usesDragon ? 70 : 0) +
        (usesPhoenix ? 46 : 0) +
        (usesDog ? 18 : 0) +
        (usesMahjong ? 10 : 0) +
        Math.max(
          0,
          (beforeSnapshot.control_cards_count -
            projectedStateSnapshot.control_cards_count) * 18
        ) +
        Math.max(
          0,
          (beforeSnapshot.bombs_count - projectedStateSnapshot.bombs_count) * 34
        )
    );
    const shedValueScore = round2(
      cardsUsedCount * 18 +
        deadSinglesReduction * 12 +
        Math.max(0, projectedStateSnapshot.hand_quality_score - beforeSnapshot.hand_quality_score) *
          0.35 +
        Math.max(0, comboMetadata.combo_length ?? 0) * 4
    );

    const snapshot: CandidateActionFeatureSnapshot = {
      state: beforeSnapshot,
      projected_state: projectedStateSnapshot,
      future_hand_quality_delta: round2(
        projectedStateSnapshot.hand_quality_score - beforeSnapshot.hand_quality_score
      ),
      structure_preservation_score: structurePreservationScore,
      dead_singles_count_before: beforeSnapshot.dead_singles_count,
      dead_singles_count_after: projectedStateSnapshot.dead_singles_count,
      dead_singles_reduction: deadSinglesReduction,
      combo_count_before: beforeSnapshot.combo_count,
      combo_count_after: projectedStateSnapshot.combo_count,
      shed_value_score: shedValueScore,
      resource_cost_score: resourceCostScore,
      control_retention_estimate: controlRetentionEstimate,
      control_value_score: projectedStateSnapshot.control_value_score,
      partner_advantage_estimate: projectedStateSnapshot.partner_advantage_estimate,
      opponent_threat_estimate: projectedStateSnapshot.opponent_threat_estimate,
      urgency_mode: projectedStateSnapshot.urgency_mode,
      endgame_pressure: projectedStateSnapshot.endgame_pressure,
      bomb_count_in_hand: beforeSnapshot.bomb_count_in_hand,
      dragon_in_hand: beforeSnapshot.dragon_in_hand,
      phoenix_in_hand: beforeSnapshot.phoenix_in_hand,
      dog_in_hand: beforeSnapshot.dog_in_hand,
      mahjong_in_hand: beforeSnapshot.mahjong_in_hand,
      premium_resource_pressure: projectedStateSnapshot.premium_resource_pressure,
      satisfies_wish: satisfiesWish,
      overtakes_partner: overtakesPartner,
      likely_wins_current_trick: likelyWinsCurrentTrick,
      uses_bomb: usesBomb,
      uses_dragon: usesDragon,
      uses_phoenix: usesPhoenix,
      uses_dog: usesDog,
      uses_mahjong: usesMahjong,
      cards_used_count: cardsUsedCount,
      combo_type: comboMetadata.combo_type,
      combo_rank: comboMetadata.combo_rank,
      combo_length: comboMetadata.combo_length
    };

    candidateFeatureCache.set(cacheKey, snapshot);
    return snapshot;
  };

  return {
    getHandEvaluation,
    getStateFeatures,
    getCandidateFeatures
  };
}
