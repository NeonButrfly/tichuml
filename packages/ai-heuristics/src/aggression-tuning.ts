import type { EngineAction } from "@tichuml/engine";
import {
  clampOutcomeNumber,
  type AggressionContextV1,
  type GrandTichuAggressionV1,
  type PassReductionV1,
  type TichuAggressionV1
} from "@tichuml/shared";
import {
  classifyAggressionRisk,
  getControlledAggressionConfig
} from "./aggression-config.js";

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computePassReductionV1(config: {
  legalPlayCount: number;
  bestPlayScore: number | null;
  passScore: number;
  clearlyWeakHand: boolean;
  forcedPass: boolean;
}): PassReductionV1 | null {
  const tuning = getControlledAggressionConfig();
  if (
    !tuning.passReductionEnabled ||
    config.legalPlayCount <= 0 ||
    config.forcedPass ||
    config.clearlyWeakHand ||
    config.bestPlayScore === null
  ) {
    return null;
  }
  const scoreGap = Math.max(0, config.bestPlayScore - config.passScore);
  const scaledPenalty =
    tuning.passReductionBasePenalty +
    Math.min(16, Math.floor(scoreGap / 20) * 2);
  const penalty = Math.min(
    tuning.passReductionMaxPenalty,
    Math.max(2, scaledPenalty)
  );
  const reason =
    scoreGap >= 120
      ? "strong_play_available"
      : scoreGap >= 40
        ? "play_available"
        : "marginal_play_available";
  return {
    penalty: -penalty,
    legal_play_count: config.legalPlayCount,
    best_play_score: roundToTenth(config.bestPlayScore),
    reason
  };
}

export function computeTichuAggressionV1(config: {
  shouldCall: boolean;
  confidence: number;
  riskFlags: string[];
}): TichuAggressionV1 | null {
  const tuning = getControlledAggressionConfig();
  if (!tuning.tichuAggressionEnabled || !config.shouldCall) {
    return null;
  }
  const confidence = clampOutcomeNumber(config.confidence, 0, 1);
  const rawBonus = 5 + confidence * 30 - config.riskFlags.length * 4;
  const bonus = clampOutcomeNumber(
    Math.round(rawBonus),
    5,
    tuning.tichuAggressionMaxBonus
  );
  return {
    bonus,
    confidence: roundToTenth(confidence),
    reason:
      confidence >= 0.8
        ? "strong_control_exit_path"
        : "positive_call_edge",
    risk_flags: [...config.riskFlags]
  };
}

export function computeGrandTichuAggressionV1(config: {
  shouldCall: boolean;
  confidence: number;
  riskFlags: string[];
}): GrandTichuAggressionV1 | null {
  const tuning = getControlledAggressionConfig();
  if (!tuning.grandTichuAggressionEnabled || !config.shouldCall) {
    return null;
  }
  const confidence = clampOutcomeNumber(config.confidence, 0, 1);
  const rawBonus = 5 + confidence * 45 - config.riskFlags.length * 8;
  const bonus = clampOutcomeNumber(
    Math.round(rawBonus),
    5,
    tuning.grandTichuAggressionMaxBonus
  );
  return {
    bonus,
    confidence: roundToTenth(confidence),
    reason:
      confidence >= 0.84
        ? "premium_opening_control"
        : "bounded_premium_edge",
    risk_flags: [...config.riskFlags]
  };
}

export function buildAggressionContextV1(config: {
  action: EngineAction;
  legalPlayCount: number;
  passReduction?: PassReductionV1 | null;
  tichuAggression?: TichuAggressionV1 | null;
  grandTichuAggression?: GrandTichuAggressionV1 | null;
}): AggressionContextV1 {
  const calledTichu = config.action.type === "call_tichu";
  const calledGrandTichu = config.action.type === "call_grand_tichu";
  const aggressivePlay =
    calledTichu ||
    calledGrandTichu ||
    Boolean(config.tichuAggression) ||
    Boolean(config.grandTichuAggression);
  const confidence =
    config.grandTichuAggression?.confidence ??
    config.tichuAggression?.confidence ??
    0;
  const riskFlags =
    config.grandTichuAggression?.risk_flags.length ??
    config.tichuAggression?.risk_flags.length ??
    0;
  return {
    passed_with_legal_play:
      config.action.type === "pass_turn" && config.legalPlayCount > 0,
    called_tichu: calledTichu,
    called_grand_tichu: calledGrandTichu,
    aggressive_play: aggressivePlay,
    risk_level: classifyAggressionRisk({
      confidence,
      riskFlagCount: riskFlags,
      aggressivePlay
    })
  };
}
