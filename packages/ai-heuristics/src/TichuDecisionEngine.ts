import { getOpponentSeats, type EngineAction, type GameState, type SeatId } from "@tichuml/engine";
import type { HeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { buildHandEvaluation } from "./HandAnalysis.js";
import { partnerHasCalledTichu } from "./HeuristicContext.js";
import type { CandidateDecision, TichuCallMetadata } from "./types.js";
import { appendUniqueTags } from "./utils.js";

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toFixed(2));
}

function buildTichuCallMetadata(config: {
  kind: "regular" | "grand";
  score: number;
  threshold: number;
  reason: string;
  selected: boolean;
  riskFlags: string[];
  contextNotes: string[];
  analysis: ReturnType<typeof buildHandEvaluation>;
  stateFeatures: ReturnType<HeuristicFeatureAnalyzer["getStateFeatures"]> | undefined;
}): TichuCallMetadata {
  const controlScore =
    config.analysis.controlCount * 72 +
    config.analysis.bombCount * 115 +
    config.analysis.highClusterCount * 34 +
    config.analysis.highRankCount * 12;
  const exitPathScore =
    config.analysis.expectedTrickWins * 62 +
    config.analysis.finishPlanScore * 0.006 +
    config.analysis.handSpeed * 48 +
    config.analysis.longestStraightLength * 18 +
    config.analysis.longestPairSequenceLength * 14;
  const fragmentationPenalty =
    config.analysis.fragmentation * 64 +
    config.analysis.loserCount * 34 +
    config.analysis.deadSingleCount * 36 +
    config.analysis.isolatedLowSinglesCount * 18 +
    Math.max(0, config.analysis.singlesCount - 9) * 10;

  return {
    tichu_call_score: roundScore(config.score),
    tichu_call_threshold: roundScore(config.threshold),
    tichu_call_reason: config.reason,
    tichu_call_risk_flags: config.riskFlags,
    hand_quality_score: roundScore(
      config.analysis.legacyCallStrength * 1.4 +
        config.analysis.handQualityScore * 0.004 +
        (config.stateFeatures?.hand_quality_score ?? 0) * 0.002
    ),
    control_score: roundScore(controlScore),
    exit_path_score: roundScore(exitPathScore),
    fragmentation_penalty: roundScore(fragmentationPenalty),
    tichu_context_notes: config.contextNotes,
    tichu_call_selected: config.selected,
    tichu_call_kind: config.kind
  };
}

function collectTichuRiskFlags(config: {
  analysis: ReturnType<typeof buildHandEvaluation>;
  hasPartnerCall: boolean;
  opponentCallCount: number;
  handSize: number;
}): string[] {
  const flags: string[] = [];
  if (config.hasPartnerCall) flags.push("partner_already_called");
  if (config.analysis.controlCount < 2 && config.analysis.bombCount === 0) {
    flags.push("low_control");
  }
  if (config.analysis.fragmentation >= 3) flags.push("fragmented_hand");
  if (config.analysis.deadSingleCount >= 4) flags.push("too_many_dead_singles");
  if (config.analysis.loserCount >= 3) flags.push("too_many_low_losers");
  if (config.analysis.expectedTrickWins < 4 && config.handSize > 6) {
    flags.push("weak_exit_path");
  }
  if (config.opponentCallCount > 0) flags.push("opponent_tichu_pressure");
  if (config.analysis.dogAvailable && config.analysis.controlCount < 3) {
    flags.push("dog_without_control");
  }
  return flags;
}

function chooseTichuReason(config: {
  shouldCall: boolean;
  kind: "regular" | "grand";
  riskFlags: string[];
  analysis: ReturnType<typeof buildHandEvaluation>;
}): string {
  if (config.shouldCall) {
    if (config.kind === "grand") {
      return "premium_opening_control";
    }
    if (config.analysis.bombCount > 0) {
      return "bomb_control_exit_path";
    }
    if (config.analysis.controlCount >= 3) {
      return "strong_control_exit_path";
    }
    return "clear_exit_path";
  }

  if (config.riskFlags.includes("partner_already_called")) {
    return "decline_partner_already_called";
  }
  if (config.riskFlags.includes("low_control")) {
    return "decline_low_control";
  }
  if (config.riskFlags.includes("fragmented_hand")) {
    return "decline_fragmented";
  }
  if (config.riskFlags.includes("weak_exit_path")) {
    return "decline_weak_exit_path";
  }
  return config.kind === "grand"
    ? "decline_below_grand_threshold"
    : "decline_below_threshold";
}

export function scoreGrandTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction,
  analyzer?: HeuristicFeatureAnalyzer
): CandidateDecision {
  const analysis = analyzer?.getHandEvaluation(seat) ?? buildHandEvaluation(state, seat);
  const stateFeatures = analyzer?.getStateFeatures(seat);
  const opponentCallCount = getOpponentSeats(seat).filter(
    (opponent) =>
      state.calls[opponent].smallTichu || state.calls[opponent].grandTichu
  ).length;
  const hasMahjong = state.hands[seat].some(
    (card) => card.kind === "special" && card.special === "mahjong"
  );
  const confidence =
    analysis.legacyCallStrength * 2.6 +
    analysis.expectedTrickWins * 92 +
    analysis.synergyScore * 8 +
    analysis.controlCount * 78 +
    analysis.bombCount * 118 -
    analysis.fragmentation * 42 -
    analysis.loserCount * 16 +
    analysis.finishPlanScore * 1.6 -
    analysis.deadSingleCount * 22 +
    (stateFeatures?.hand_quality_score ?? 0) * 0.004 +
    (hasMahjong ? 18 : 0);
  const riskFlags = collectTichuRiskFlags({
    analysis,
    hasPartnerCall: partnerHasCalledTichu(state, seat),
    opponentCallCount,
    handSize: state.hands[seat].length
  });
  const structuralEvidence =
    analysis.controlCount >= 3 ||
    analysis.bombCount > 0 ||
    (analysis.controlCount >= 2 && analysis.highClusterCount >= 2);
  const shouldCall =
    state.hands[seat].length === 8 &&
    analysis.legacyCallStrength >= HEURISTIC_WEIGHTS.calls.legacyGrandThreshold &&
    analysis.tichuViable &&
    structuralEvidence &&
    analysis.expectedTrickWins >= 5.5 &&
    analysis.loserCount <= 1 &&
    analysis.deadSingleCount <= 2 &&
    confidence >= HEURISTIC_WEIGHTS.calls.grandThreshold;
  const reason = chooseTichuReason({
    shouldCall,
    kind: "grand",
    riskFlags,
    analysis
  });
  const metadata = buildTichuCallMetadata({
    kind: "grand",
    score: confidence,
    threshold: HEURISTIC_WEIGHTS.calls.grandThreshold,
    reason,
    selected: shouldCall,
    riskFlags,
    contextNotes: [
      "grand_tichu_requires_pre_exchange_premium_control",
      structuralEvidence
        ? "premium_control_structure_present"
        : "premium_control_structure_absent"
    ],
    analysis,
    stateFeatures
  });

  if (action.type === "call_grand_tichu") {
    return {
      actor: seat,
      action,
      score: shouldCall ? 820 + confidence : -120,
      tags: [],
      reasons: shouldCall
        ? [
            "opening hand has enough control and combo density for Grand Tichu",
            "legacy call strength and current structure both clear the Grand Tichu threshold"
          ]
        : ["opening hand does not justify a Grand Tichu commitment"],
      tichuCall: metadata
    };
  }

  return {
    actor: seat,
    action,
    score: shouldCall ? 120 : 700,
    tags: [],
    reasons: shouldCall
      ? ["declining leaves value on the table despite a strong hand"]
      : ["declining Grand Tichu avoids a high-variance overcall"],
    tichuCall: {
      ...metadata,
      tichu_call_selected: !shouldCall,
      tichu_call_reason: shouldCall
        ? "decline_premium_hand_not_preferred"
        : reason
    }
  };
}

export function scoreTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction,
  analyzer?: HeuristicFeatureAnalyzer
): CandidateDecision {
  const analysis = analyzer?.getHandEvaluation(seat) ?? buildHandEvaluation(state, seat);
  const stateFeatures = analyzer?.getStateFeatures(seat);
  const opponentCallCount = getOpponentSeats(seat).filter(
    (opponent) =>
      state.calls[opponent].smallTichu || state.calls[opponent].grandTichu
  ).length;
  const partnerCalled = partnerHasCalledTichu(state, seat);
  const riskFlags = collectTichuRiskFlags({
    analysis,
    hasPartnerCall: partnerCalled,
    opponentCallCount,
    handSize: state.hands[seat].length
  });

  if (partnerHasCalledTichu(state, seat)) {
    const metadata = buildTichuCallMetadata({
      kind: "regular",
      score: Number.NEGATIVE_INFINITY,
      threshold: HEURISTIC_WEIGHTS.calls.tichuThreshold14,
      reason: "decline_partner_already_called",
      selected: false,
      riskFlags,
      contextNotes: ["partner_call_blocks_second_team_tichu_commitment"],
      analysis,
      stateFeatures
    });
    return {
      actor: seat,
      action,
      score: -1000,
      tags: [],
      reasons: ["partner already holds the team Tichu call slot"],
      tichuCall: metadata
    };
  }

  const hasMahjong = state.hands[seat].some(
    (card) => card.kind === "special" && card.special === "mahjong"
  );
  const confidence =
    analysis.legacyCallStrength * 1.8 +
    analysis.expectedTrickWins * 78 +
    analysis.synergyScore * 6 +
    analysis.controlCount * 64 +
    analysis.bombCount * 96 -
    analysis.fragmentation * 34 -
    state.hands[seat].length * 2 -
    analysis.loserCount * 14 +
    analysis.finishPlanScore * 1.35 -
    analysis.deadSingleCount * 18 +
    (stateFeatures?.hand_quality_score ?? 0) * 0.003 -
    (stateFeatures?.premium_resource_pressure ?? 0) * 0.005 +
    (hasMahjong ? 12 : 0);
  const callThreshold =
    state.hands[seat].length <= 6
      ? HEURISTIC_WEIGHTS.calls.tichuThreshold6
      : state.hands[seat].length <= 10
        ? HEURISTIC_WEIGHTS.calls.tichuThreshold10
        : HEURISTIC_WEIGHTS.calls.tichuThreshold14;
  const minimumLegacy =
    state.hands[seat].length <= 6
      ? HEURISTIC_WEIGHTS.calls.legacyTichuThreshold - 8
      : state.hands[seat].length <= 10
        ? HEURISTIC_WEIGHTS.calls.legacyTichuThreshold + 10
        : HEURISTIC_WEIGHTS.calls.legacyTichuThreshold + 24;
  const structuralEvidence =
    analysis.controlCount >= 3 ||
    analysis.bombCount > 0 ||
    (state.hands[seat].length <= 6 &&
      analysis.controlCount >= 1 &&
      analysis.expectedTrickWins >= 2.8);
  const exitEvidence =
    state.hands[seat].length <= 6
      ? analysis.expectedTrickWins >= 2.8 && analysis.deadSingleCount <= 1
      : analysis.expectedTrickWins >= 13 &&
        analysis.finishPlanScore >= 8_000 &&
        analysis.deadSingleCount <= 3;
  const shouldCall =
    analysis.legacyCallStrength >= minimumLegacy &&
    analysis.tichuViable &&
    structuralEvidence &&
    exitEvidence &&
    analysis.loserCount <= 2 &&
    analysis.fragmentation <= 2 &&
    confidence >= callThreshold;
  const reason = chooseTichuReason({
    shouldCall,
    kind: "regular",
    riskFlags,
    analysis
  });
  const metadata = buildTichuCallMetadata({
    kind: "regular",
    score: confidence,
    threshold: callThreshold,
    reason,
    selected: shouldCall,
    riskFlags,
    contextNotes: [
      `minimum_legacy=${minimumLegacy}`,
      structuralEvidence
        ? "structural_evidence_present"
        : "structural_evidence_absent",
      exitEvidence ? "exit_path_clear" : "exit_path_unclear",
      opponentCallCount > 0
        ? "opponent_call_context_considered"
        : "no_opponent_tichu_pressure"
    ],
    analysis,
    stateFeatures
  });

  return {
    actor: seat,
    action,
    score: shouldCall ? 760 + confidence : -2_000,
    tags: [],
    reasons: shouldCall
      ? [
          "control cards and combo density support a Tichu line",
          "legacy call strength agrees with the current structural evaluation"
        ]
      : ["hand quality is not strong enough to justify a Tichu call"],
    tichuCall: metadata
  };
}

export function scoreDragonGift(
  state: GameState,
  seat: SeatId,
  action: EngineAction
): CandidateDecision {
  const recipient = action.type === "assign_dragon_trick" ? action.recipient : getOpponentSeats(seat)[0]!;
  const nextLeader = state.pendingDragonGift?.nextLeader ?? null;
  const calledTichu = state.calls[recipient].smallTichu || state.calls[recipient].grandTichu;
  const threatScore =
    (state.hands[recipient].length <= 1
      ? 300
      : state.hands[recipient].length <= 2
        ? 180
        : state.hands[recipient].length <= 4
          ? 60
          : -state.hands[recipient].length * 32) +
    (calledTichu ? 90 : 0) +
    (recipient === nextLeader ? 70 : 0);
  const tags: CandidateDecision["tags"] = [];
  appendUniqueTags(tags, "DRAGON_SAFE_TARGET", "DRAGON_GIFT_LOWEST_THREAT");

  return {
    actor: seat,
    action,
    score:
      HEURISTIC_WEIGHTS.dragonGift.base - threatScore,
    tags,
    reasons: [
      state.hands[recipient].length >= 3
        ? "prefer giving Dragon points to the lower-threat opponent with more cards remaining"
        : "recipient pressure is already high, so this is the least threatening legal opponent",
      ...(recipient === nextLeader
        ? ["avoid giving the Dragon trick to the opponent who would convert initiative most efficiently"]
        : []),
      ...(calledTichu ? ["avoid feeding bonus points to a Tichu caller"] : [])
    ]
  };
}
