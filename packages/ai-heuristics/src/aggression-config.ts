import {
  clampOutcomeNumber,
  readRuntimeEnv,
  type AggressionRiskLevel
} from "@tichuml/shared";

export type AggressionProfile = "conservative" | "balanced" | "aggressive";

export type ControlledAggressionConfig = {
  passReductionEnabled: boolean;
  passReductionBasePenalty: number;
  passReductionMaxPenalty: number;
  tichuAggressionEnabled: boolean;
  tichuAggressionMaxBonus: number;
  grandTichuAggressionEnabled: boolean;
  grandTichuAggressionMaxBonus: number;
  aggressionProfile: AggressionProfile;
};

const PROFILE_CONFIG: Record<AggressionProfile, ControlledAggressionConfig> = {
  conservative: {
    passReductionEnabled: true,
    passReductionBasePenalty: 3,
    passReductionMaxPenalty: 18,
    tichuAggressionEnabled: true,
    tichuAggressionMaxBonus: 24,
    grandTichuAggressionEnabled: true,
    grandTichuAggressionMaxBonus: 36,
    aggressionProfile: "conservative"
  },
  balanced: {
    passReductionEnabled: true,
    passReductionBasePenalty: 4,
    passReductionMaxPenalty: 25,
    tichuAggressionEnabled: true,
    tichuAggressionMaxBonus: 40,
    grandTichuAggressionEnabled: true,
    grandTichuAggressionMaxBonus: 60,
    aggressionProfile: "balanced"
  },
  aggressive: {
    passReductionEnabled: true,
    passReductionBasePenalty: 6,
    passReductionMaxPenalty: 25,
    tichuAggressionEnabled: true,
    tichuAggressionMaxBonus: 40,
    grandTichuAggressionEnabled: true,
    grandTichuAggressionMaxBonus: 60,
    aggressionProfile: "aggressive"
  }
};

export function resolveAggressionProfile(
  rawValue: string | null | undefined
): AggressionProfile {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (normalized === "conservative" || normalized === "aggressive") {
    return normalized;
  }
  return "balanced";
}

export function getControlledAggressionConfig(): ControlledAggressionConfig {
  const profile = resolveAggressionProfile(readRuntimeEnv("TICHU_AGGRESSION_PROFILE"));
  return PROFILE_CONFIG[profile];
}

export function classifyAggressionRisk(config: {
  confidence: number;
  riskFlagCount: number;
  aggressivePlay: boolean;
}): AggressionRiskLevel {
  if (!config.aggressivePlay) {
    return "low";
  }
  const adjustedConfidence = clampOutcomeNumber(config.confidence, 0, 1);
  if (config.riskFlagCount >= 2 || adjustedConfidence < 0.55) {
    return "high";
  }
  if (config.riskFlagCount >= 1 || adjustedConfidence < 0.72) {
    return "medium";
  }
  return "low";
}
