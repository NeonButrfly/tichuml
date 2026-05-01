import {
  getOpponentSeats,
  getPartnerSeat,
  getTeamForSeat,
  type Card,
  type GameState,
  type SeatId
} from "@tichuml/engine";
import { buildHandEvaluation } from "./HandAnalysis.js";

type HandEvaluation = ReturnType<typeof buildHandEvaluation>;

export type TichuCallReason =
  | "call_strong_control_exit_path"
  | "call_fast_coherent_hand"
  | "call_score_context_risk"
  | "decline_below_threshold"
  | "decline_fragmented_hand"
  | "decline_insufficient_control"
  | "decline_too_many_exit_steps"
  | "decline_partner_called"
  | "decline_score_context"
  | "decline_opponent_pressure";

export type TichuCallEvaluation = {
  decision: "call" | "decline";
  call_type: "tichu" | "grand_tichu";
  score: number;
  threshold: number;
  confidence: number;
  reason: TichuCallReason;
  risk_flags: string[];
  premium_count: number;
  unknown_card_risk: number | null;
  first8_exit_proxy: number | null;
  feature_scores: {
    hand_quality: number;
    exit_path: number;
    control: number;
    fragmentation: number;
    premium_cards: number;
    bomb_value: number;
    combo_coherence: number;
    low_card_burden: number;
    lead_recovery: number;
    partner_context: number;
    opponent_pressure: number;
    score_context: number;
  };
  predicted: {
    estimated_exit_steps: number;
    winner_groups: number;
    loser_groups: number;
    control_recoveries: number;
    deadwood_count: number;
    needs_partner_help: boolean;
    first_out_probability_proxy: number;
  };
  context_notes: string[];
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hasSpecial(cards: readonly Card[], special: "dragon" | "phoenix" | "mahjong" | "dog"): boolean {
  return cards.some((card) => card.kind === "special" && card.special === special);
}

function countStandardRank(cards: readonly Card[], rank: number): number {
  return cards.filter((card) => card.kind === "standard" && card.rank === rank).length;
}

function countRanksAtLeast(cards: readonly Card[], rank: number): number {
  return cards.filter((card) => card.kind === "standard" && card.rank >= rank).length;
}

function scoreContextModifier(state: GameState, seat: SeatId): number {
  const team = getTeamForSeat(seat);
  const opponentTeam = team === "team-0" ? "team-1" : "team-0";
  const ownScore = state.matchScore[team] ?? 0;
  const opponentScore = state.matchScore[opponentTeam] ?? 0;
  const scoreDelta = ownScore - opponentScore;
  let modifier = 0;

  if (scoreDelta <= -500) modifier += 45;
  else if (scoreDelta <= -250) modifier += 28;
  else if (scoreDelta <= -100) modifier += 14;

  if (scoreDelta >= 500) modifier -= 55;
  else if (scoreDelta >= 250) modifier -= 34;
  else if (scoreDelta >= 100) modifier -= 14;

  if (ownScore >= 900 && ownScore > opponentScore) modifier -= 35;
  if (opponentScore >= 900 && ownScore < opponentScore) modifier += 22;

  return modifier;
}

function estimateExitSteps(config: {
  handSize: number;
  analysis: HandEvaluation;
  phoenix: boolean;
}): number {
  const packedByStraight = Math.max(0, config.analysis.longestStraightLength - 1);
  const packedByPairs = Math.max(0, config.analysis.longestPairSequenceLength - 2);
  const packedBySets =
    config.analysis.pairCount +
    config.analysis.trioCount * 2 +
    config.analysis.bombCount * 3;
  const phoenixFlex = config.phoenix ? 1 : 0;
  return clamp(
    Math.ceil(
      config.handSize -
        packedByStraight -
        packedByPairs -
        packedBySets -
        phoenixFlex
    ),
    2,
    Math.max(2, config.handSize)
  );
}

function buildCommonFeatures(config: {
  state: GameState;
  seat: SeatId;
  analysis: HandEvaluation;
  callType: "tichu" | "grand_tichu";
}) {
  const cards = config.state.hands[config.seat];
  const dragon = hasSpecial(cards, "dragon");
  const phoenix = hasSpecial(cards, "phoenix");
  const mahjong = hasSpecial(cards, "mahjong");
  const dog = hasSpecial(cards, "dog");
  const aceCount = countStandardRank(cards, 14);
  const kingCount = countStandardRank(cards, 13);
  const queenCount = countStandardRank(cards, 12);
  const premiumCount =
    (dragon ? 1 : 0) +
    (phoenix ? 1 : 0) +
    aceCount +
    (mahjong ? 1 : 0) +
    (dog ? 1 : 0);
  const partner = getPartnerSeat(config.seat);
  const partnerCalled =
    config.state.calls[partner].smallTichu ||
    config.state.calls[partner].grandTichu;
  const opponentCallCount = getOpponentSeats(config.seat).filter(
    (opponent) =>
      config.state.calls[opponent].smallTichu ||
      config.state.calls[opponent].grandTichu
  ).length;
  const controlRecoveries =
    (dragon ? 1 : 0) +
    (phoenix ? 1 : 0) +
    aceCount +
    Math.min(1, config.analysis.bombCount) +
    Math.floor((kingCount + queenCount) / 3);
  const estimatedExitSteps = estimateExitSteps({
    handSize: cards.length,
    analysis: config.analysis,
    phoenix
  });
  const lowSingles =
    config.analysis.isolatedLowSinglesCount +
    Math.max(0, config.analysis.loserCount - config.analysis.bombCount);
  const winnerGroups =
    controlRecoveries +
    config.analysis.bombCount +
    config.analysis.highClusterCount +
    Math.floor(config.analysis.longestStraightLength / 5) +
    Math.floor(config.analysis.longestPairSequenceLength / 4);
  const loserGroups =
    config.analysis.loserCount +
    Math.max(0, config.analysis.deadSingleCount - controlRecoveries);
  const handQuality = clamp(
    config.analysis.handQualityScore * 1.35 +
      config.analysis.legacyCallStrength * 1.8 +
      config.analysis.handSpeed * 24,
    0,
    260
  );
  const premiumCards = clamp(
    (dragon ? 88 : 0) +
      (phoenix ? 76 : 0) +
      aceCount * 40 +
      (mahjong ? 24 : 0) +
      (dog ? 18 : 0) +
      kingCount * 11 +
      queenCount * 7,
    0,
    250
  );
  const bombValue = clamp(config.analysis.bombCount * 52, 0, 105);
  const comboCoherence = clamp(
    config.analysis.longestStraightLength * 15 +
      config.analysis.longestPairSequenceLength * 12 +
      config.analysis.pairRunsCount * 26 +
      config.analysis.straightsCount * 12 +
      config.analysis.trioCount * 13 -
      config.analysis.deadSingleCount * 11,
    0,
    210
  );
  const exitPath = clamp(
    235 -
      Math.max(0, estimatedExitSteps - (config.callType === "grand_tichu" ? 4 : 5)) *
        42 +
      comboCoherence * 0.36 +
      config.analysis.expectedTrickWins * 7,
    0,
    255
  );
  const control = clamp(
    controlRecoveries * 58 +
      config.analysis.expectedTrickWins * 12 +
      config.analysis.highClusterCount * 18,
    0,
    245
  );
  const fragmentation = clamp(
    config.analysis.fragmentation * 50 +
      config.analysis.deadSingleCount * 26 +
      config.analysis.isolatedLowSinglesCount * 32 +
      Math.max(0, estimatedExitSteps - 6) * 35,
    0,
    240
  );
  const lowCardBurden = clamp(lowSingles * 34 + config.analysis.loserCount * 13, 0, 190);
  const leadRecovery = clamp(
    controlRecoveries * 46 +
      (dragon ? 24 : 0) +
      (phoenix ? 18 : 0) +
      Math.min(1, config.analysis.bombCount) * 28 -
      lowSingles * 14,
    0,
    210
  );
  const partnerContext = partnerCalled ? -170 : 0;
  const opponentPressure = opponentCallCount > 0 ? (controlRecoveries >= 4 ? -12 : -46) : 0;
  const scoreContext = scoreContextModifier(config.state, config.seat);
  const firstOutProbabilityProxy = clamp(
    0.08 +
      controlRecoveries * 0.09 +
      winnerGroups * 0.045 -
      loserGroups * 0.035 -
      Math.max(0, estimatedExitSteps - 5) * 0.055 +
      scoreContext * 0.0008,
    0,
    0.93
  );

  return {
    cards,
    dragon,
    phoenix,
    mahjong,
    dog,
    aceCount,
    premiumCount,
    partnerCalled,
    opponentCallCount,
    controlRecoveries,
    estimatedExitSteps,
    lowSingles,
    winnerGroups,
    loserGroups,
    feature_scores: {
      hand_quality: round(handQuality),
      exit_path: round(exitPath),
      control: round(control),
      fragmentation: round(fragmentation),
      premium_cards: round(premiumCards),
      bomb_value: round(bombValue),
      combo_coherence: round(comboCoherence),
      low_card_burden: round(lowCardBurden),
      lead_recovery: round(leadRecovery),
      partner_context: round(partnerContext),
      opponent_pressure: round(opponentPressure),
      score_context: round(scoreContext)
    },
    predicted: {
      estimated_exit_steps: estimatedExitSteps,
      winner_groups: winnerGroups,
      loser_groups: loserGroups,
      control_recoveries: controlRecoveries,
      deadwood_count: config.analysis.deadSingleCount,
      needs_partner_help:
        controlRecoveries < 3 || winnerGroups <= loserGroups || estimatedExitSteps >= 8,
      first_out_probability_proxy: round(firstOutProbabilityProxy)
    }
  };
}

export function evaluateTichuCall(config: {
  state: GameState;
  seat: SeatId;
  analysis?: HandEvaluation;
}): TichuCallEvaluation {
  const analysis = config.analysis ?? buildHandEvaluation(config.state, config.seat);
  const common = buildCommonFeatures({
    state: config.state,
    seat: config.seat,
    analysis,
    callType: "tichu"
  });
  const rawScore =
    common.feature_scores.hand_quality +
    common.feature_scores.exit_path +
    common.feature_scores.control +
    common.feature_scores.premium_cards +
    common.feature_scores.bomb_value +
    common.feature_scores.combo_coherence * 0.55 +
    common.feature_scores.lead_recovery +
    common.feature_scores.partner_context +
    common.feature_scores.opponent_pressure +
    common.feature_scores.score_context -
    common.feature_scores.fragmentation -
    common.feature_scores.low_card_burden;
  const threshold = clamp(700 - common.feature_scores.score_context * 0.85, 635, 780);
  const exceptionalStructure =
    common.predicted.estimated_exit_steps <= 5 &&
    common.predicted.winner_groups >= common.predicted.loser_groups + 2;
  const hardDecline =
    common.partnerCalled ||
    common.predicted.estimated_exit_steps > 8 ||
    common.controlRecoveries < 2 ||
    (common.predicted.needs_partner_help && common.controlRecoveries < 3) ||
    common.predicted.winner_groups <= common.predicted.loser_groups ||
    common.feature_scores.fragmentation >= 175 ||
    (common.opponentCallCount > 0 && common.controlRecoveries < 3) ||
    (common.feature_scores.score_context <= -40 &&
      common.controlRecoveries <= 3 &&
      common.premiumCount <= 4);
  const decision =
    !hardDecline &&
    rawScore >= threshold &&
    (common.controlRecoveries >= 3 || exceptionalStructure)
      ? "call"
      : "decline";
  const reason: TichuCallReason =
    decision === "call"
      ? common.feature_scores.score_context >= 25 && rawScore < threshold + 35
        ? "call_score_context_risk"
        : exceptionalStructure
          ? "call_fast_coherent_hand"
          : "call_strong_control_exit_path"
      : common.partnerCalled
        ? "decline_partner_called"
        : common.predicted.estimated_exit_steps > 8
          ? "decline_too_many_exit_steps"
          : common.controlRecoveries < 2
            ? "decline_insufficient_control"
            : common.predicted.needs_partner_help && common.controlRecoveries < 3
              ? "decline_insufficient_control"
            : common.feature_scores.fragmentation >= 175
              ? "decline_fragmented_hand"
          : common.opponentCallCount > 0 && common.controlRecoveries < 3
                ? "decline_opponent_pressure"
                : common.feature_scores.score_context <= -40 && rawScore < threshold
                  ? "decline_score_context"
                  : "decline_below_threshold";
  const riskFlags = [
    ...(common.partnerCalled ? ["partner_already_called"] : []),
    ...(common.controlRecoveries < 2 ? ["insufficient_control", "low_control"] : []),
    ...(common.predicted.needs_partner_help && common.controlRecoveries < 3
      ? ["needs_partner_help"]
      : []),
    ...(common.predicted.estimated_exit_steps > 8 ? ["too_many_exit_steps"] : []),
    ...(common.feature_scores.fragmentation >= 145 ? ["fragmented_hand"] : []),
    ...(common.lowSingles >= 4 ? ["low_card_burden"] : []),
    ...(common.opponentCallCount > 0 ? ["opponent_tichu_pressure"] : []),
    ...(common.feature_scores.score_context <= -40 &&
    common.controlRecoveries <= 3 &&
    common.premiumCount <= 4
      ? ["conservative_score_context"]
      : [])
  ];

  return {
    decision,
    call_type: "tichu",
    score: round(rawScore),
    threshold: round(threshold),
    confidence: round(clamp(rawScore / Math.max(1, threshold), 0, 1.35)),
    reason,
    risk_flags: riskFlags,
    premium_count: common.premiumCount,
    unknown_card_risk: null,
    first8_exit_proxy: null,
    feature_scores: common.feature_scores,
    predicted: common.predicted,
    context_notes: [
      "predictive_regular_tichu_exit_control_formula",
      `premium_count=${common.premiumCount}`,
      `control_recoveries=${common.controlRecoveries}`,
      `winner_loser=${common.winnerGroups}/${common.loserGroups}`
    ]
  };
}

export function evaluateGrandTichuCall(config: {
  state: GameState;
  seat: SeatId;
  analysis?: HandEvaluation;
}): TichuCallEvaluation {
  const analysis = config.analysis ?? buildHandEvaluation(config.state, config.seat);
  const common = buildCommonFeatures({
    state: config.state,
    seat: config.seat,
    analysis,
    callType: "grand_tichu"
  });
  const hasPremiumPair =
    (common.dragon && common.phoenix) ||
    (common.dragon && common.aceCount >= 1) ||
    (common.phoenix && common.aceCount >= 1) ||
    common.aceCount >= 2;
  const extremeAces = common.aceCount >= 3;
  const unknownCardRisk = clamp(
    132 -
      common.premiumCount * 14 -
      common.feature_scores.combo_coherence * 0.12 -
      common.feature_scores.control * 0.1,
    28,
    140
  );
  const first8ExitProxy = clamp(
    100 -
      common.predicted.estimated_exit_steps * 10 +
      common.feature_scores.combo_coherence * 0.16 +
      common.controlRecoveries * 12,
    0,
    100
  );
  const rawScore =
    common.feature_scores.hand_quality * 0.95 +
    common.feature_scores.exit_path * 0.85 +
    common.feature_scores.control * 1.2 +
    common.feature_scores.premium_cards * 1.25 +
    common.feature_scores.bomb_value * 0.55 +
    common.feature_scores.combo_coherence * 0.45 +
    common.feature_scores.lead_recovery +
    common.feature_scores.score_context * 0.7 -
    common.feature_scores.fragmentation * 1.15 -
    common.feature_scores.low_card_burden * 1.1 -
    unknownCardRisk;
  const threshold = clamp(810 - common.feature_scores.score_context * 0.65, 760, 875);
  const structuralException =
    common.predicted.estimated_exit_steps <= 3 &&
    common.predicted.winner_groups >= common.predicted.loser_groups + 3 &&
    common.feature_scores.combo_coherence >= 150;
  const hardDecline =
    common.partnerCalled ||
    common.premiumCount < 3 ||
    (!hasPremiumPair && !extremeAces && !structuralException) ||
    common.controlRecoveries < 3 ||
    common.feature_scores.fragmentation >= 145 ||
    common.predicted.estimated_exit_steps > 6;
  const decision = !hardDecline && rawScore >= threshold ? "call" : "decline";
  const reason: TichuCallReason =
    decision === "call"
      ? structuralException
        ? "call_fast_coherent_hand"
        : common.feature_scores.score_context >= 25 && rawScore < threshold + 35
          ? "call_score_context_risk"
          : "call_strong_control_exit_path"
      : common.partnerCalled
        ? "decline_partner_called"
        : common.predicted.estimated_exit_steps > 6
          ? "decline_too_many_exit_steps"
          : common.controlRecoveries < 3 || common.premiumCount < 3
            ? "decline_insufficient_control"
            : common.feature_scores.fragmentation >= 145
              ? "decline_fragmented_hand"
              : common.feature_scores.score_context <= -35 && rawScore < threshold
                ? "decline_score_context"
                : "decline_below_threshold";
  const riskFlags = [
    ...(common.partnerCalled ? ["partner_already_called"] : []),
    ...(common.premiumCount < 3 ? ["too_few_premium_cards"] : []),
    ...(!hasPremiumPair && !extremeAces && !structuralException
      ? ["missing_gt_premium_cluster"]
      : []),
    ...(common.controlRecoveries < 3 ? ["insufficient_control"] : []),
    ...(common.predicted.estimated_exit_steps > 6 ? ["too_many_exit_steps"] : []),
    ...(common.feature_scores.fragmentation >= 120 ? ["fragmented_first8"] : []),
    ...(unknownCardRisk >= 100 ? ["unknown_card_risk"] : [])
  ];

  return {
    decision,
    call_type: "grand_tichu",
    score: round(rawScore),
    threshold: round(threshold),
    confidence: round(clamp(rawScore / Math.max(1, threshold), 0, 1.35)),
    reason,
    risk_flags: riskFlags,
    premium_count: common.premiumCount,
    unknown_card_risk: round(unknownCardRisk),
    first8_exit_proxy: round(first8ExitProxy),
    feature_scores: common.feature_scores,
    predicted: common.predicted,
    context_notes: [
      "predictive_grand_tichu_first8_premium_formula",
      `premium_count=${common.premiumCount}`,
      `unknown_card_risk=${round(unknownCardRisk)}`,
      hasPremiumPair ? "premium_pair_present" : "premium_pair_absent"
    ]
  };
}
