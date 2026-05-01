import type { EngineAction, GameState, LegalAction, SeatId, TeamId } from "@tichuml/engine";
import { serializeLegalAction } from "@tichuml/telemetry";
import type { JsonObject } from "@tichuml/shared";

export type RolloutSampleMetrics = {
  actorTeamDelta: number | null;
  handWin: boolean | null;
  matchWin: boolean | null;
  tichuSuccess: boolean | null;
  grandTichuSuccess: boolean | null;
  actorFinishRank: number | null;
  partnerFinishRank: number | null;
};

export function teamForSeat(seat: SeatId): TeamId {
  return seat === "seat-0" || seat === "seat-2" ? "team-0" : "team-1";
}

export function opposingTeam(team: TeamId): TeamId {
  return team === "team-0" ? "team-1" : "team-0";
}

export function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonString(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonString(record[key])}`)
    .join(",")}}`;
}

function readJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readStringField(value: JsonObject | null, key: string): string | null {
  const field = value?.[key];
  return typeof field === "string" ? field : null;
}

function sortedStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function actionsEquivalent(
  candidate: JsonObject,
  target: JsonObject
): boolean {
  if (stableJsonString(candidate) === stableJsonString(target)) {
    return true;
  }

  const candidateType = readStringField(candidate, "type");
  if (
    candidateType === null ||
    candidateType !== readStringField(target, "type")
  ) {
    return false;
  }

  const candidateSeat = readStringField(candidate, "seat");
  const targetSeat = readStringField(target, "seat");
  if (
    candidateSeat !== null &&
    targetSeat !== null &&
    candidateSeat !== targetSeat
  ) {
    return false;
  }

  if (candidateType === "play_cards") {
    return (
      sortedStringList(candidate.cardIds).join("|") ===
        sortedStringList(target.cardIds).join("|") &&
      candidate.phoenixAsRank === target.phoenixAsRank &&
      candidate.wishRank === target.wishRank
    );
  }

  if (candidateType === "select_pass") {
    return (
      candidate.left === target.left &&
      candidate.partner === target.partner &&
      candidate.right === target.right
    );
  }

  if (candidateType === "assign_dragon_trick") {
    return candidate.recipient === target.recipient;
  }

  if (candidateType === "advance_phase") {
    return candidate.actor === target.actor;
  }

  return true;
}

export function legalActionKey(action: LegalAction): string {
  return stableJsonString(serializeLegalAction(action));
}

export function findMatchingLegalAction(
  legalActions: LegalAction[],
  candidateAction: JsonObject
): LegalAction | null {
  const exact = legalActions.find(
    (action) => legalActionKey(action) === stableJsonString(candidateAction)
  );
  if (exact) {
    return exact;
  }

  return (
    legalActions.find((action) =>
      actionsEquivalent(
        readJsonObject(serializeLegalAction(action)) ?? {},
        candidateAction
      )
    ) ?? null
  );
}

export function buildRolloutSeed(
  baseSeed: string,
  decisionId: number,
  candidateActionKey: string,
  sampleIndex: number
): string {
  return `${baseSeed}:${decisionId}:${candidateActionKey}:${sampleIndex}`;
}

export function extractRolloutSampleMetrics(
  state: GameState,
  actorSeat: SeatId
): RolloutSampleMetrics {
  const actorTeam = teamForSeat(actorSeat);
  const opponentTeam = opposingTeam(actorTeam);
  const handSummary =
    state.roundSummary ??
    (state.matchHistory.length > 0
      ? {
          teamScores:
            state.matchHistory[state.matchHistory.length - 1]?.teamScores ??
            state.matchScore,
          finishOrder:
            state.matchHistory[state.matchHistory.length - 1]?.finishOrder ?? [],
          doubleVictory:
            state.matchHistory[state.matchHistory.length - 1]?.doubleVictory ?? null,
          tichuBonuses:
            state.matchHistory[state.matchHistory.length - 1]?.tichuBonuses ?? []
        }
      : null);
  const actorTeamScore = handSummary?.teamScores?.[actorTeam] ?? null;
  const opponentTeamScore = handSummary?.teamScores?.[opponentTeam] ?? null;
  const actorTeamDelta =
    actorTeamScore !== null && opponentTeamScore !== null
      ? actorTeamScore - opponentTeamScore
      : null;
  const finishOrder = handSummary?.finishOrder ?? [];
  const actorFinishRank = finishOrder.indexOf(actorSeat);
  const partnerSeat = actorSeat === "seat-0"
    ? "seat-2"
    : actorSeat === "seat-2"
      ? "seat-0"
      : actorSeat === "seat-1"
        ? "seat-3"
        : "seat-1";
  const partnerFinishRank = finishOrder.indexOf(partnerSeat);
  const bonuses = handSummary?.tichuBonuses ?? [];
  const actorSmallTichuBonus =
    bonuses.find(
      (bonus) => bonus.seat === actorSeat && bonus.label === "small"
    ) ?? null;
  const actorGrandTichuBonus =
    bonuses.find(
      (bonus) => bonus.seat === actorSeat && bonus.label === "grand"
    ) ?? null;

  return {
    actorTeamDelta,
    handWin: actorTeamDelta !== null ? actorTeamDelta > 0 : null,
    matchWin:
      state.matchWinner !== null ? state.matchWinner === actorTeam : null,
    tichuSuccess:
      actorSmallTichuBonus !== null ? actorSmallTichuBonus.amount > 0 : null,
    grandTichuSuccess:
      actorGrandTichuBonus !== null ? actorGrandTichuBonus.amount > 0 : null,
    actorFinishRank: actorFinishRank >= 0 ? actorFinishRank + 1 : null,
    partnerFinishRank: partnerFinishRank >= 0 ? partnerFinishRank + 1 : null
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  const left = sorted[mid - 1];
  const right = sorted[mid];
  return left !== undefined && right !== undefined ? (left + right) / 2 : null;
}

function standardDeviation(values: number[]): number | null {
  const average = mean(values);
  if (average === null || values.length === 0) {
    return null;
  }
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function rate(values: Array<boolean | null>): number | null {
  const filtered = values.filter((value): value is boolean => value !== null);
  if (filtered.length === 0) {
    return null;
  }
  const hits = filtered.filter(Boolean).length;
  return hits / filtered.length;
}

export function summarizeRolloutSamples(samples: RolloutSampleMetrics[]): {
  rollout_mean_actor_team_delta: number | null;
  rollout_median_actor_team_delta: number | null;
  rollout_std_actor_team_delta: number | null;
  rollout_win_rate: number | null;
  rollout_hand_win_rate: number | null;
  rollout_tichu_success_rate: number | null;
  rollout_grand_tichu_success_rate: number | null;
  rollout_mean_finish_rank_actor: number | null;
  rollout_mean_finish_rank_partner: number | null;
} {
  const deltas = samples
    .map((sample) => sample.actorTeamDelta)
    .filter((value): value is number => value !== null);
  const actorFinishRanks = samples
    .map((sample) => sample.actorFinishRank)
    .filter((value): value is number => value !== null);
  const partnerFinishRanks = samples
    .map((sample) => sample.partnerFinishRank)
    .filter((value): value is number => value !== null);

  return {
    rollout_mean_actor_team_delta: mean(deltas),
    rollout_median_actor_team_delta: median(deltas),
    rollout_std_actor_team_delta: standardDeviation(deltas),
    rollout_win_rate: rate(samples.map((sample) => sample.matchWin)),
    rollout_hand_win_rate: rate(samples.map((sample) => sample.handWin)),
    rollout_tichu_success_rate: rate(
      samples.map((sample) => sample.tichuSuccess)
    ),
    rollout_grand_tichu_success_rate: rate(
      samples.map((sample) => sample.grandTichuSuccess)
    ),
    rollout_mean_finish_rank_actor: mean(actorFinishRanks),
    rollout_mean_finish_rank_partner: mean(partnerFinishRanks)
  };
}

export function coerceEngineAction(
  action: JsonObject
): EngineAction {
  return action as unknown as EngineAction;
}
