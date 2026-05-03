import type { JsonObject } from "./backend.js";
import type { SeedJsonValue } from "./seed.js";

export type OutcomeActorTeam = "NS" | "EW";
export type OutcomeAttributionQuality = "exact" | "range" | "unknown";
export type AggressionRiskLevel = "low" | "medium" | "high";

export type PassReductionV1 = {
  penalty: number;
  legal_play_count: number;
  best_play_score: number | null;
  reason: string;
};

export type TichuAggressionV1 = {
  bonus: number;
  confidence: number;
  reason: string;
  risk_flags: string[];
};

export type GrandTichuAggressionV1 = {
  bonus: number;
  confidence: number;
  reason: string;
  risk_flags: string[];
};

export type AggressionContextV1 = {
  passed_with_legal_play: boolean;
  called_tichu: boolean;
  called_grand_tichu: boolean;
  aggressive_play: boolean;
  risk_level: AggressionRiskLevel;
};

export type OutcomeRewardComponents = {
  version: "outcome_reward_v1";
  actor_team: OutcomeActorTeam;
  hand_score_delta: number;
  trick_component: number;
  tichu_component: number;
  hand_bonus: number;
  game_bonus: number;
  attribution_quality: OutcomeAttributionQuality;
  aggression_context_v1?: AggressionContextV1;
};

export type OutcomeRewardInput = {
  actorTeam: OutcomeActorTeam;
  handScoreDelta: number | null;
  trickPoints: number | null;
  actorTeamWonTrick: boolean | null;
  tichuComponent: number | null;
  actorTeamWonHand: boolean | null;
  actorTeamWonGame: boolean | null;
  attributionQuality: OutcomeAttributionQuality;
  aggressionContext?: AggressionContextV1 | null;
};

export function normalizeOutcomeActorTeam(
  value: string | null | undefined
): OutcomeActorTeam | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "ns" ||
    normalized === "north_south" ||
    normalized === "north/south" ||
    normalized === "team-0"
  ) {
    return "NS";
  }
  if (
    normalized === "ew" ||
    normalized === "east_west" ||
    normalized === "east/west" ||
    normalized === "team-1"
  ) {
    return "EW";
  }
  return null;
}

export function getOutcomeActorTeamForSeat(
  seat: string | null | undefined
): OutcomeActorTeam | null {
  const normalized = String(seat ?? "").trim().toLowerCase();
  if (
    normalized === "seat-0" ||
    normalized === "seat-2" ||
    normalized === "north" ||
    normalized === "south"
  ) {
    return "NS";
  }
  if (
    normalized === "seat-1" ||
    normalized === "seat-3" ||
    normalized === "east" ||
    normalized === "west"
  ) {
    return "EW";
  }
  return normalizeOutcomeActorTeam(normalized);
}

export function getOpponentOutcomeActorTeam(
  team: OutcomeActorTeam | null | undefined
): OutcomeActorTeam | null {
  if (team === "NS") {
    return "EW";
  }
  if (team === "EW") {
    return "NS";
  }
  return null;
}

export function clampOutcomeNumber(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeOutcomeReward(
  input: OutcomeRewardInput
): { reward: number | null; components: OutcomeRewardComponents | null } {
  if (input.handScoreDelta === null) {
    return { reward: null, components: null };
  }
  const trickPoints = input.trickPoints ?? 0;
  const trickComponent =
    input.actorTeamWonTrick === null
      ? 0
      : input.actorTeamWonTrick
        ? trickPoints
        : -trickPoints;
  const tichuComponent = input.tichuComponent ?? 0;
  const handBonus = input.actorTeamWonHand ? 50 : 0;
  const gameBonus = input.actorTeamWonGame ? 200 : 0;
  const reward =
    input.handScoreDelta +
    trickComponent +
    tichuComponent +
    handBonus +
    gameBonus;
  return {
    reward,
    components: {
      version: "outcome_reward_v1",
      actor_team: input.actorTeam,
      hand_score_delta: input.handScoreDelta,
      trick_component: trickComponent,
      tichu_component: tichuComponent,
      hand_bonus: handBonus,
      game_bonus: gameBonus,
      attribution_quality: input.attributionQuality,
      ...(input.aggressionContext
        ? { aggression_context_v1: input.aggressionContext }
        : {})
    }
  };
}

function readJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readRiskLevel(value: unknown): AggressionRiskLevel {
  return value === "high" || value === "medium" ? value : "low";
}

export function readAggressionContextV1(
  value: SeedJsonValue | null | undefined
): AggressionContextV1 | null {
  const objectValue = readJsonObject(value);
  if (!objectValue) {
    return null;
  }
  return {
    passed_with_legal_play:
      readBoolean(objectValue.passed_with_legal_play) ?? false,
    called_tichu: readBoolean(objectValue.called_tichu) ?? false,
    called_grand_tichu: readBoolean(objectValue.called_grand_tichu) ?? false,
    aggressive_play: readBoolean(objectValue.aggressive_play) ?? false,
    risk_level: readRiskLevel(objectValue.risk_level)
  };
}
