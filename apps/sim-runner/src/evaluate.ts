import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SEAT_IDS, type SeatId, type TeamId } from "@tichuml/engine";
import {
  runSelfPlayBatch,
  type SeatProviderOverrides,
  type SelfPlayBatchSummary
} from "./self-play-batch.js";

type ProviderMode = "local" | "server_heuristic" | "lightgbm_model";

type ParsedArgs = {
  games: number;
  seed: string;
  telemetryEnabled: boolean;
  backendBaseUrl?: string;
  quiet: boolean;
  progress: boolean;
  defaultProvider: ProviderMode;
  nsProvider: ProviderMode;
  ewProvider: ProviderMode;
  seatProviders: SeatProviderOverrides;
  outputPath?: string;
  mirrorSeats: boolean;
  minGamesForGate: number;
  requireNoIllegalActions: boolean;
  requireNoFallbackIncrease: boolean;
  maxAverageLatencyMs: number | null;
};

type EvaluationLegPlan = {
  name: string;
  seed: string;
  defaultProvider: ProviderMode;
  seatProviders: SeatProviderOverrides;
};

type EvaluationLegSummary = {
  name: string;
  seed: string;
  games_played: number;
  hands_played: number;
  default_provider: ProviderMode;
  ns_provider: string;
  ew_provider: string;
  seat_providers: Record<string, ProviderMode>;
  team_assignments: Record<TeamId, ProviderMode>;
  win_counts: Record<TeamId | "tie", number>;
  hand_win_counts: Record<TeamId | "tie", number>;
  win_rate_by_team: Record<TeamId | "tie", number>;
  hand_win_rate_by_team: Record<TeamId | "tie", number>;
  average_score_margin: number;
  total_score_by_team: Record<TeamId, number>;
  pass_rate: number;
  bomb_usage_rate: number;
  wish_satisfaction_rate: number | null;
  tichu_call_rate: number | null;
  tichu_success_rate: number | null;
  grand_tichu_call_rate: number | null;
  grand_tichu_success_rate: number | null;
  double_victory_rate: number | null;
  double_victory_counts: Record<TeamId, number>;
  fallback_count: number;
  invalid_decision_count: number;
  average_latency_by_provider: Record<string, number>;
  decision_latency_p95_by_provider: Record<string, number | null>;
  provider_usage: Record<string, number>;
  decisions_by_phase: Record<string, number>;
  events_by_phase: Record<string, number>;
  exchange_phase_recorded: boolean;
  pass_select_recorded: boolean;
  errors: number;
};

type ProviderAggregate = {
  match_wins: number;
  hand_wins: number;
  total_score: number;
  double_victories: number;
  games_as_team_0: number;
  games_as_team_1: number;
  average_latency_ms: number | null;
};

type ProviderComparisonSummary = {
  provider_a: ProviderMode;
  provider_b: ProviderMode;
  total_games: number;
  total_hands: number;
  provider_a_match_wins: number;
  provider_b_match_wins: number;
  ties: number;
  provider_a_match_win_rate: number;
  provider_b_match_win_rate: number;
  provider_a_hand_wins: number;
  provider_b_hand_wins: number;
  hand_ties: number;
  provider_a_hand_win_rate: number;
  provider_b_hand_win_rate: number;
  provider_a_average_score: number;
  provider_b_average_score: number;
  average_score_delta_provider_a_minus_b: number;
  provider_a_total_score: number;
  provider_b_total_score: number;
  provider_a_double_victories: number;
  provider_b_double_victories: number;
  provider_a_average_latency_ms: number | null;
  provider_b_average_latency_ms: number | null;
  provider_a_match_win_rate_ci95: [number, number] | null;
  provider_b_match_win_rate_ci95: [number, number] | null;
};

type ImprovementGateResult = {
  applied: boolean;
  passed: boolean;
  challenger_provider: ProviderMode | null;
  baseline_provider: ProviderMode | null;
  min_games_for_gate: number;
  games_evaluated: number;
  require_no_illegal_actions: boolean;
  require_no_fallback_increase: boolean;
  max_average_latency_ms: number | null;
  checks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
};

type EvaluationReport = {
  timestamp: string;
  base_seed: string;
  backend_url: string | null;
  telemetry_enabled: boolean;
  mirror_seats: boolean;
  baseline_run: EvaluationLegSummary | null;
  comparison_runs: EvaluationLegSummary[];
  combined_comparison: ProviderComparisonSummary | null;
  gate: ImprovementGateResult;
  git_commit: string | null;
  model_file: string | null;
  model_version: string | null;
  latest_summary: LatestSummary;
};

type LatestSummary = {
  timestamp: string;
  games_played: number;
  hands_played: number;
  base_seed: string;
  default_provider: ProviderMode;
  ns_provider: string;
  ew_provider: string;
  seat_providers: Record<string, ProviderMode>;
  backend_url: string | null;
  telemetry_enabled: boolean;
  mirror_seats: boolean;
  win_counts: Record<TeamId | "tie", number>;
  hand_win_counts: Record<TeamId | "tie", number>;
  win_rate_by_team: Record<TeamId | "tie", number>;
  hand_win_rate_by_team: Record<TeamId | "tie", number>;
  average_score_margin: number;
  total_score_by_team: Record<TeamId, number>;
  pass_rate: number;
  bomb_usage_rate: number;
  wish_satisfaction_rate: number | null;
  tichu_call_rate: number | null;
  tichu_success_rate: number | null;
  grand_tichu_call_rate: number | null;
  grand_tichu_success_rate: number | null;
  double_victory_rate: number | null;
  double_victory_counts: Record<TeamId, number>;
  fallback_count: number;
  invalid_decision_count: number;
  average_latency_by_provider: Record<string, number>;
  provider_usage: Record<string, number>;
  decisions_by_phase: Record<string, number>;
  events_by_phase: Record<string, number>;
  exchange_phase_recorded: boolean;
  pass_select_recorded: boolean;
  errors: number;
  git_commit: string | null;
  model_file: string | null;
  model_version: string | null;
  gate_passed: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function isProviderMode(value: string | undefined): value is ProviderMode {
  return (
    value === "local" ||
    value === "server_heuristic" ||
    value === "lightgbm_model"
  );
}

function isSeatId(value: string): value is SeatId {
  return SEAT_IDS.includes(value as SeatId);
}

function parseSeatProvider(
  value: string,
  seatProviders: SeatProviderOverrides
): void {
  const [seat, provider] = value.split("=");
  if (!seat || !provider || !isSeatId(seat) || !isProviderMode(provider)) {
    throw new Error(`Invalid --seat-provider value: ${value}`);
  }
  seatProviders[seat] = provider;
}

function parseNumber(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "null" || normalized === "none" || normalized === "off") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const seatProviders: SeatProviderOverrides = {};
  const parsed: ParsedArgs = {
    games: 100,
    seed: "evaluation",
    telemetryEnabled: true,
    quiet: false,
    progress: true,
    defaultProvider: "server_heuristic",
    nsProvider: "server_heuristic",
    ewProvider: "server_heuristic",
    seatProviders,
    mirrorSeats: false,
    minGamesForGate: 100,
    requireNoIllegalActions: true,
    requireNoFallbackIncrease: true,
    maxAverageLatencyMs: 250
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--games":
      case "--hands":
        parsed.games = parseNumber(next, parsed.games);
        index += 1;
        break;
      case "--seed":
      case "--base-seed":
        parsed.seed = next ?? parsed.seed;
        index += 1;
        break;
      case "--provider":
      case "--default-provider":
        if (!isProviderMode(next)) {
          throw new Error(`Invalid provider: ${next ?? ""}`);
        }
        parsed.defaultProvider = next;
        parsed.nsProvider = next;
        parsed.ewProvider = next;
        index += 1;
        break;
      case "--ns-provider":
        if (!isProviderMode(next)) {
          throw new Error(`Invalid NS provider: ${next ?? ""}`);
        }
        parsed.nsProvider = next;
        index += 1;
        break;
      case "--ew-provider":
        if (!isProviderMode(next)) {
          throw new Error(`Invalid EW provider: ${next ?? ""}`);
        }
        parsed.ewProvider = next;
        index += 1;
        break;
      case "--seat-provider":
        if (!next) {
          throw new Error("Missing value for --seat-provider");
        }
        parseSeatProvider(next, seatProviders);
        index += 1;
        break;
      case "--telemetry":
        parsed.telemetryEnabled = parseBoolean(next, true);
        index += 1;
        break;
      case "--backend-url":
        if (next) {
          parsed.backendBaseUrl = next;
        }
        index += 1;
        break;
      case "--output":
        if (next) {
          parsed.outputPath = next;
        }
        index += 1;
        break;
      case "--mirror-seats":
        parsed.mirrorSeats = parseBoolean(next, true);
        if (next && !next.startsWith("--")) {
          index += 1;
        }
        break;
      case "--min-games-for-gate":
        parsed.minGamesForGate = parseNumber(next, parsed.minGamesForGate);
        index += 1;
        break;
      case "--require-no-illegal-actions":
        parsed.requireNoIllegalActions = parseBoolean(next, true);
        if (next && !next.startsWith("--")) {
          index += 1;
        }
        break;
      case "--require-no-fallback-increase":
        parsed.requireNoFallbackIncrease = parseBoolean(next, true);
        if (next && !next.startsWith("--")) {
          index += 1;
        }
        break;
      case "--max-average-latency-ms":
        parsed.maxAverageLatencyMs = parseNullableNumber(next);
        index += 1;
        break;
      case "--quiet":
        parsed.quiet = true;
        parsed.progress = false;
        break;
      case "--progress":
        parsed.progress = true;
        break;
      default:
        break;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(seatProviders, "seat-0")) {
    seatProviders["seat-0"] = parsed.nsProvider;
  }
  if (!Object.prototype.hasOwnProperty.call(seatProviders, "seat-2")) {
    seatProviders["seat-2"] = parsed.nsProvider;
  }
  if (!Object.prototype.hasOwnProperty.call(seatProviders, "seat-1")) {
    seatProviders["seat-1"] = parsed.ewProvider;
  }
  if (!Object.prototype.hasOwnProperty.call(seatProviders, "seat-3")) {
    seatProviders["seat-3"] = parsed.ewProvider;
  }

  parsed.defaultProvider = seatProviders["seat-0"] ?? parsed.defaultProvider;

  return parsed;
}

function readGitCommit(cwd: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

function resolveTeamProvider(
  seatProviders: SeatProviderOverrides,
  seats: [SeatId, SeatId]
): string {
  const [left, right] = seats;
  const leftProvider = seatProviders[left] ?? "local";
  const rightProvider = seatProviders[right] ?? "local";
  return leftProvider === rightProvider ? leftProvider : "mixed";
}

function cloneSeatProviders(
  seatProviders: SeatProviderOverrides
): SeatProviderOverrides {
  return { ...seatProviders };
}

function createTeamCounts(): Record<TeamId | "tie", number> {
  return {
    "team-0": 0,
    "team-1": 0,
    tie: 0
  };
}

function createTeamScores(): Record<TeamId, number> {
  return {
    "team-0": 0,
    "team-1": 0
  };
}

function roundRate(value: number): number {
  return Number(value.toFixed(4));
}

function roundValue(value: number): number {
  return Number(value.toFixed(2));
}

function buildSeatProvidersForTeams(
  nsProvider: ProviderMode,
  ewProvider: ProviderMode
): SeatProviderOverrides {
  return {
    "seat-0": nsProvider,
    "seat-2": nsProvider,
    "seat-1": ewProvider,
    "seat-3": ewProvider
  };
}

function buildLegPlans(args: ParsedArgs): EvaluationLegPlan[] {
  const plans: EvaluationLegPlan[] = [];
  const comparisonSeatProviders = cloneSeatProviders(args.seatProviders);

  const includesDistinctProviders = args.nsProvider !== args.ewProvider;
  if (
    includesDistinctProviders ||
    args.requireNoFallbackIncrease ||
    args.requireNoIllegalActions
  ) {
    plans.push({
      name: "heuristic_sanity",
      seed: `${args.seed}:heuristic-baseline`,
      defaultProvider: "server_heuristic",
      seatProviders: buildSeatProvidersForTeams(
        "server_heuristic",
        "server_heuristic"
      )
    });
  }

  plans.push({
    name: "primary",
    seed: `${args.seed}:primary`,
    defaultProvider: comparisonSeatProviders["seat-0"] ?? args.defaultProvider,
    seatProviders: comparisonSeatProviders
  });

  if (args.mirrorSeats) {
    plans.push({
      name: "mirror",
      seed: `${args.seed}:mirror`,
      defaultProvider: args.ewProvider,
      seatProviders: buildSeatProvidersForTeams(args.ewProvider, args.nsProvider)
    });
  }

  return plans;
}

function buildLegSummary(
  name: string,
  seed: string,
  summary: SelfPlayBatchSummary,
  seatProviders: SeatProviderOverrides,
  defaultProvider: ProviderMode
): EvaluationLegSummary {
  const gamesPlayed = summary.gamesPlayed;
  const handsPlayed = summary.handsPlayed;
  const winCounts: Record<TeamId | "tie", number> = {
    "team-0": summary.winCountsByTeam["team-0"] ?? 0,
    "team-1": summary.winCountsByTeam["team-1"] ?? 0,
    tie: summary.winCountsByTeam.tie ?? 0
  };
  const handWinCounts: Record<TeamId | "tie", number> = {
    "team-0": summary.handWinCountsByTeam["team-0"] ?? 0,
    "team-1": summary.handWinCountsByTeam["team-1"] ?? 0,
    tie: summary.handWinCountsByTeam.tie ?? 0
  };

  return {
    name,
    seed,
    games_played: gamesPlayed,
    hands_played: handsPlayed,
    default_provider: defaultProvider,
    ns_provider: resolveTeamProvider(seatProviders, ["seat-0", "seat-2"]),
    ew_provider: resolveTeamProvider(seatProviders, ["seat-1", "seat-3"]),
    seat_providers: Object.fromEntries(
      Object.entries(seatProviders).map(([seat, provider]) => [
        seat,
        provider ?? defaultProvider
      ])
    ),
    team_assignments: {
      "team-0":
        (seatProviders["seat-0"] ?? seatProviders["seat-2"] ?? defaultProvider) as ProviderMode,
      "team-1":
        (seatProviders["seat-1"] ?? seatProviders["seat-3"] ?? defaultProvider) as ProviderMode
    },
    win_counts: winCounts,
    hand_win_counts: handWinCounts,
    win_rate_by_team: {
      "team-0": gamesPlayed > 0 ? roundRate(winCounts["team-0"] / gamesPlayed) : 0,
      "team-1": gamesPlayed > 0 ? roundRate(winCounts["team-1"] / gamesPlayed) : 0,
      tie: gamesPlayed > 0 ? roundRate(winCounts.tie / gamesPlayed) : 0
    },
    hand_win_rate_by_team: {
      "team-0":
        handsPlayed > 0 ? roundRate(handWinCounts["team-0"] / handsPlayed) : 0,
      "team-1":
        handsPlayed > 0 ? roundRate(handWinCounts["team-1"] / handsPlayed) : 0,
      tie: handsPlayed > 0 ? roundRate(handWinCounts.tie / handsPlayed) : 0
    },
    average_score_margin: summary.averageScoreMargin,
    total_score_by_team: {
      "team-0": summary.totalScoreByTeam["team-0"] ?? 0,
      "team-1": summary.totalScoreByTeam["team-1"] ?? 0
    },
    pass_rate: summary.passRate,
    bomb_usage_rate: summary.bombUsageRate,
    wish_satisfaction_rate: summary.wishSatisfactionRate,
    tichu_call_rate: summary.tichuCallRate,
    tichu_success_rate: summary.tichuSuccessRate,
    grand_tichu_call_rate: summary.grandTichuCallRate,
    grand_tichu_success_rate: summary.grandTichuSuccessRate,
    double_victory_rate: summary.doubleVictoryRate,
    double_victory_counts: {
      "team-0": summary.doubleVictoryCountsByTeam["team-0"] ?? 0,
      "team-1": summary.doubleVictoryCountsByTeam["team-1"] ?? 0
    },
    fallback_count: summary.fallbackCount,
    invalid_decision_count: summary.invalidDecisionCount,
    average_latency_by_provider: summary.averageLatencyByProvider,
    decision_latency_p95_by_provider: Object.fromEntries(
      Object.keys(summary.averageLatencyByProvider).map((provider) => [
        provider,
        null
      ])
    ),
    provider_usage: summary.providerUsage,
    decisions_by_phase: summary.decisionsByPhase,
    events_by_phase: summary.eventsByPhase,
    exchange_phase_recorded: summary.exchangePhaseRecorded,
    pass_select_recorded: summary.passSelectRecorded,
    errors: summary.errors
  };
}

function wilsonInterval95(successes: number, total: number): [number, number] | null {
  if (total <= 0) {
    return null;
  }
  const z = 1.96;
  const phat = successes / total;
  const denominator = 1 + (z * z) / total;
  const center =
    (phat + (z * z) / (2 * total)) / denominator;
  const margin =
    (z *
      Math.sqrt((phat * (1 - phat)) / total + (z * z) / (4 * total * total))) /
    denominator;
  return [roundRate(Math.max(0, center - margin)), roundRate(Math.min(1, center + margin))];
}

export function buildProviderComparisonSummary(
  legs: EvaluationLegSummary[],
  providerA: ProviderMode,
  providerB: ProviderMode
): ProviderComparisonSummary | null {
  if (legs.length === 0) {
    return null;
  }

  let totalGames = 0;
  let totalHands = 0;
  let providerAMatchWins = 0;
  let providerBMatchWins = 0;
  let ties = 0;
  let providerAHandWins = 0;
  let providerBHandWins = 0;
  let handTies = 0;
  let providerATotalScore = 0;
  let providerBTotalScore = 0;
  let providerADoubleVictories = 0;
  let providerBDoubleVictories = 0;
  const latencyTotals: Record<ProviderMode, { weightedMs: number; decisions: number }> = {
    local: { weightedMs: 0, decisions: 0 },
    server_heuristic: { weightedMs: 0, decisions: 0 },
    lightgbm_model: { weightedMs: 0, decisions: 0 }
  };
  const providerAGames = { team0: 0, team1: 0 };
  const providerBGames = { team0: 0, team1: 0 };

  for (const leg of legs) {
    totalGames += leg.games_played;
    totalHands += leg.hands_played;
    const team0Provider = leg.team_assignments["team-0"];
    const team1Provider = leg.team_assignments["team-1"];

    if (team0Provider === providerA) {
      providerAGames.team0 += leg.games_played;
      providerATotalScore += leg.total_score_by_team["team-0"];
      providerADoubleVictories += leg.double_victory_counts["team-0"];
      providerAHandWins += leg.hand_win_counts["team-0"];
    } else if (team0Provider === providerB) {
      providerBGames.team0 += leg.games_played;
      providerBTotalScore += leg.total_score_by_team["team-0"];
      providerBDoubleVictories += leg.double_victory_counts["team-0"];
      providerBHandWins += leg.hand_win_counts["team-0"];
    }

    if (team1Provider === providerA) {
      providerAGames.team1 += leg.games_played;
      providerATotalScore += leg.total_score_by_team["team-1"];
      providerADoubleVictories += leg.double_victory_counts["team-1"];
      providerAHandWins += leg.hand_win_counts["team-1"];
    } else if (team1Provider === providerB) {
      providerBGames.team1 += leg.games_played;
      providerBTotalScore += leg.total_score_by_team["team-1"];
      providerBDoubleVictories += leg.double_victory_counts["team-1"];
      providerBHandWins += leg.hand_win_counts["team-1"];
    }

    providerAMatchWins +=
      team0Provider === providerA
        ? leg.win_counts["team-0"]
        : team1Provider === providerA
          ? leg.win_counts["team-1"]
          : 0;
    providerBMatchWins +=
      team0Provider === providerB
        ? leg.win_counts["team-0"]
        : team1Provider === providerB
          ? leg.win_counts["team-1"]
          : 0;
    ties += leg.win_counts.tie;
    handTies += leg.hand_win_counts.tie;

    for (const provider of [providerA, providerB] as const) {
      const decisions = leg.provider_usage[provider] ?? 0;
      const averageLatency = leg.average_latency_by_provider[provider];
      if (decisions > 0 && averageLatency !== undefined) {
        latencyTotals[provider].weightedMs += averageLatency * decisions;
        latencyTotals[provider].decisions += decisions;
      }
    }
  }

  const providerAAverageLatency =
    latencyTotals[providerA].decisions > 0
      ? roundValue(
          latencyTotals[providerA].weightedMs / latencyTotals[providerA].decisions
        )
      : null;
  const providerBAverageLatency =
    latencyTotals[providerB].decisions > 0
      ? roundValue(
          latencyTotals[providerB].weightedMs / latencyTotals[providerB].decisions
        )
      : null;

  return {
    provider_a: providerA,
    provider_b: providerB,
    total_games: totalGames,
    total_hands: totalHands,
    provider_a_match_wins: providerAMatchWins,
    provider_b_match_wins: providerBMatchWins,
    ties,
    provider_a_match_win_rate:
      totalGames > 0 ? roundRate(providerAMatchWins / totalGames) : 0,
    provider_b_match_win_rate:
      totalGames > 0 ? roundRate(providerBMatchWins / totalGames) : 0,
    provider_a_hand_wins: providerAHandWins,
    provider_b_hand_wins: providerBHandWins,
    hand_ties: handTies,
    provider_a_hand_win_rate:
      totalHands > 0 ? roundRate(providerAHandWins / totalHands) : 0,
    provider_b_hand_win_rate:
      totalHands > 0 ? roundRate(providerBHandWins / totalHands) : 0,
    provider_a_average_score:
      totalGames > 0 ? roundValue(providerATotalScore / totalGames) : 0,
    provider_b_average_score:
      totalGames > 0 ? roundValue(providerBTotalScore / totalGames) : 0,
    average_score_delta_provider_a_minus_b:
      totalGames > 0 ? roundValue((providerATotalScore - providerBTotalScore) / totalGames) : 0,
    provider_a_total_score: providerATotalScore,
    provider_b_total_score: providerBTotalScore,
    provider_a_double_victories: providerADoubleVictories,
    provider_b_double_victories: providerBDoubleVictories,
    provider_a_average_latency_ms: providerAAverageLatency,
    provider_b_average_latency_ms: providerBAverageLatency,
    provider_a_match_win_rate_ci95: wilsonInterval95(
      providerAMatchWins,
      totalGames
    ),
    provider_b_match_win_rate_ci95: wilsonInterval95(
      providerBMatchWins,
      totalGames
    )
  };
}

function identifyGateProviders(args: ParsedArgs): {
  challenger: ProviderMode | null;
  baseline: ProviderMode | null;
} {
  if (args.nsProvider === args.ewProvider) {
    return { challenger: null, baseline: null };
  }
  if (args.nsProvider === "lightgbm_model" && args.ewProvider !== "lightgbm_model") {
    return { challenger: "lightgbm_model", baseline: args.ewProvider };
  }
  if (args.ewProvider === "lightgbm_model" && args.nsProvider !== "lightgbm_model") {
    return { challenger: "lightgbm_model", baseline: args.nsProvider };
  }
  if (
    args.nsProvider !== "server_heuristic" &&
    args.ewProvider === "server_heuristic"
  ) {
    return { challenger: args.nsProvider, baseline: "server_heuristic" };
  }
  if (
    args.ewProvider !== "server_heuristic" &&
    args.nsProvider === "server_heuristic"
  ) {
    return { challenger: args.ewProvider, baseline: "server_heuristic" };
  }
  return { challenger: args.nsProvider, baseline: args.ewProvider };
}

function sumAcrossLegs(
  legs: EvaluationLegSummary[],
  pick: (leg: EvaluationLegSummary) => number
): number {
  return legs.reduce((total, leg) => total + pick(leg), 0);
}

export function evaluateImprovementGate(config: {
  comparison: ProviderComparisonSummary | null;
  baselineRun: EvaluationLegSummary | null;
  comparisonLegs: EvaluationLegSummary[];
  args: ParsedArgs;
}): ImprovementGateResult {
  const providers = identifyGateProviders(config.args);
  const checks: ImprovementGateResult["checks"] = [];

  if (providers.challenger === null || providers.baseline === null) {
    return {
      applied: false,
      passed: false,
      challenger_provider: null,
      baseline_provider: null,
      min_games_for_gate: config.args.minGamesForGate,
      games_evaluated: config.comparison?.total_games ?? 0,
      require_no_illegal_actions: config.args.requireNoIllegalActions,
      require_no_fallback_increase: config.args.requireNoFallbackIncrease,
      max_average_latency_ms: config.args.maxAverageLatencyMs,
      checks: [
        {
          name: "gate_skipped",
          passed: false,
          details: "Improvement gate applies only when comparing distinct providers."
        }
      ]
    };
  }

  const comparison = config.comparison;
  const gamesEvaluated = comparison?.total_games ?? 0;
  const baselineRun = config.baselineRun;
  const comparisonInvalid = sumAcrossLegs(
    config.comparisonLegs,
    (leg) => leg.invalid_decision_count
  );
  const comparisonFallbacks = sumAcrossLegs(
    config.comparisonLegs,
    (leg) => leg.fallback_count
  );
  const baselineInvalid = baselineRun?.invalid_decision_count ?? 0;
  const baselineFallbacks = baselineRun?.fallback_count ?? 0;

  const samplePassed = gamesEvaluated >= config.args.minGamesForGate;
  checks.push({
    name: "sample_size",
    passed: samplePassed,
    details: `games=${gamesEvaluated}, required=${config.args.minGamesForGate}`
  });

  const winRate = comparison?.provider_a === providers.challenger
    ? comparison.provider_a_match_win_rate
    : comparison?.provider_b === providers.challenger
      ? comparison.provider_b_match_win_rate
      : 0;
  const scoreDelta = comparison?.provider_a === providers.challenger
    ? comparison.average_score_delta_provider_a_minus_b
    : comparison
      ? -comparison.average_score_delta_provider_a_minus_b
      : 0;
  const beatsBaseline = winRate > 0.5 && scoreDelta > 0;
  checks.push({
    name: "beats_baseline",
    passed: beatsBaseline,
    details: `win_rate=${winRate}, average_score_delta=${scoreDelta}`
  });

  if (config.args.requireNoIllegalActions) {
    const illegalPassed =
      baselineRun === null
        ? comparisonInvalid === 0
        : comparisonInvalid <= baselineInvalid;
    checks.push({
      name: "illegal_actions",
      passed: illegalPassed,
      details:
        baselineRun === null
          ? `comparison_invalid=${comparisonInvalid}, required=0`
          : `comparison_invalid=${comparisonInvalid}, baseline_invalid=${baselineInvalid}`
    });
  }

  if (config.args.requireNoFallbackIncrease) {
    const fallbackPassed =
      baselineRun === null
        ? comparisonFallbacks === 0
        : comparisonFallbacks <= baselineFallbacks;
    checks.push({
      name: "fallbacks",
      passed: fallbackPassed,
      details:
        baselineRun === null
          ? `comparison_fallbacks=${comparisonFallbacks}, required=0`
          : `comparison_fallbacks=${comparisonFallbacks}, baseline_fallbacks=${baselineFallbacks}`
    });
  }

  if (config.args.maxAverageLatencyMs !== null) {
    const challengerLatency =
      comparison?.provider_a === providers.challenger
        ? comparison.provider_a_average_latency_ms
        : comparison?.provider_b === providers.challenger
          ? comparison.provider_b_average_latency_ms
          : null;
    const latencyPassed =
      challengerLatency !== null &&
      challengerLatency <= config.args.maxAverageLatencyMs;
    checks.push({
      name: "latency",
      passed: latencyPassed,
      details: `challenger_average_latency_ms=${challengerLatency ?? "n/a"}, max=${config.args.maxAverageLatencyMs}`
    });
  }

  return {
    applied: true,
    passed: checks.every((check) => check.passed),
    challenger_provider: providers.challenger,
    baseline_provider: providers.baseline,
    min_games_for_gate: config.args.minGamesForGate,
    games_evaluated: gamesEvaluated,
    require_no_illegal_actions: config.args.requireNoIllegalActions,
    require_no_fallback_increase: config.args.requireNoFallbackIncrease,
    max_average_latency_ms: config.args.maxAverageLatencyMs,
    checks
  };
}

function readModelMetadata(
  repoRoot: string,
  usesLightgbm: boolean
): {
  modelFile: string | null;
  modelVersion: string | null;
} {
  if (!usesLightgbm) {
    return { modelFile: null, modelVersion: null };
  }

  const metaPath = path.join(
    repoRoot,
    "ml",
    "model_registry",
    "lightgbm_action_model.meta.json"
  );
  const modelPath = path.join(
    repoRoot,
    "ml",
    "model_registry",
    "lightgbm_action_model.txt"
  );
  if (!fs.existsSync(metaPath)) {
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion: null
    };
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      model_version?: string;
      created_at?: string;
      objective?: string;
    };
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion:
        metadata.model_version ??
        (metadata.objective && metadata.created_at
          ? `${metadata.objective}@${metadata.created_at}`
          : metadata.created_at ?? null)
    };
  } catch {
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion: null
    };
  }
}

export function buildLatestSummary(config: {
  reportTimestamp: string;
  args: ParsedArgs;
  primaryLeg: EvaluationLegSummary;
  gate: ImprovementGateResult;
  gitCommit: string | null;
  modelFile: string | null;
  modelVersion: string | null;
}): LatestSummary {
  return {
    timestamp: config.reportTimestamp,
    games_played: config.primaryLeg.games_played,
    hands_played: config.primaryLeg.hands_played,
    base_seed: config.args.seed,
    default_provider: config.primaryLeg.default_provider,
    ns_provider: config.primaryLeg.ns_provider,
    ew_provider: config.primaryLeg.ew_provider,
    seat_providers: config.primaryLeg.seat_providers,
    backend_url: config.args.backendBaseUrl ?? null,
    telemetry_enabled: config.args.telemetryEnabled,
    mirror_seats: config.args.mirrorSeats,
    win_counts: config.primaryLeg.win_counts,
    hand_win_counts: config.primaryLeg.hand_win_counts,
    win_rate_by_team: config.primaryLeg.win_rate_by_team,
    hand_win_rate_by_team: config.primaryLeg.hand_win_rate_by_team,
    average_score_margin: config.primaryLeg.average_score_margin,
    total_score_by_team: config.primaryLeg.total_score_by_team,
    pass_rate: config.primaryLeg.pass_rate,
    bomb_usage_rate: config.primaryLeg.bomb_usage_rate,
    wish_satisfaction_rate: config.primaryLeg.wish_satisfaction_rate,
    tichu_call_rate: config.primaryLeg.tichu_call_rate,
    tichu_success_rate: config.primaryLeg.tichu_success_rate,
    grand_tichu_call_rate: config.primaryLeg.grand_tichu_call_rate,
    grand_tichu_success_rate: config.primaryLeg.grand_tichu_success_rate,
    double_victory_rate: config.primaryLeg.double_victory_rate,
    double_victory_counts: config.primaryLeg.double_victory_counts,
    fallback_count: config.primaryLeg.fallback_count,
    invalid_decision_count: config.primaryLeg.invalid_decision_count,
    average_latency_by_provider: config.primaryLeg.average_latency_by_provider,
    provider_usage: config.primaryLeg.provider_usage,
    decisions_by_phase: config.primaryLeg.decisions_by_phase,
    events_by_phase: config.primaryLeg.events_by_phase,
    exchange_phase_recorded: config.primaryLeg.exchange_phase_recorded,
    pass_select_recorded: config.primaryLeg.pass_select_recorded,
    errors: config.primaryLeg.errors,
    git_commit: config.gitCommit,
    model_file: config.modelFile,
    model_version: config.modelVersion,
    gate_passed: config.gate.passed
  };
}

function buildMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push("# ML Evaluation Report");
  lines.push("");
  lines.push(`- Generated: ${report.timestamp}`);
  lines.push(`- Base seed: ${report.base_seed}`);
  lines.push(`- Backend URL: ${report.backend_url ?? "n/a"}`);
  lines.push(`- Telemetry enabled: ${report.telemetry_enabled}`);
  lines.push(`- Mirror seats: ${report.mirror_seats}`);
  lines.push(`- Git commit: ${report.git_commit ?? "unknown"}`);
  if (report.model_file) {
    lines.push(`- Model file: ${report.model_file}`);
  }
  if (report.model_version) {
    lines.push(`- Model version: ${report.model_version}`);
  }
  lines.push("");

  if (report.baseline_run) {
    lines.push("## Heuristic Sanity Baseline");
    lines.push("");
    lines.push(
      `- Games: ${report.baseline_run.games_played}, hands: ${report.baseline_run.hands_played}, fallbacks: ${report.baseline_run.fallback_count}, invalid decisions: ${report.baseline_run.invalid_decision_count}`
    );
    lines.push(
      `- Win rates: ${JSON.stringify(report.baseline_run.win_rate_by_team)}`
    );
    lines.push(
      `- Hand win rates: ${JSON.stringify(report.baseline_run.hand_win_rate_by_team)}`
    );
    lines.push(
      `- Average latency by provider: ${JSON.stringify(report.baseline_run.average_latency_by_provider)}`
    );
    lines.push("");
  }

  lines.push("## Comparison Runs");
  lines.push("");
  for (const leg of report.comparison_runs) {
    lines.push(`### ${leg.name}`);
    lines.push("");
    lines.push(
      `- Providers: NS=${leg.ns_provider}, EW=${leg.ew_provider}, games=${leg.games_played}, hands=${leg.hands_played}`
    );
    lines.push(`- Win rates: ${JSON.stringify(leg.win_rate_by_team)}`);
    lines.push(`- Hand win rates: ${JSON.stringify(leg.hand_win_rate_by_team)}`);
    lines.push(`- Total score by team: ${JSON.stringify(leg.total_score_by_team)}`);
    lines.push(
      `- Tichu call/success: ${leg.tichu_call_rate ?? "n/a"} / ${leg.tichu_success_rate ?? "n/a"}`
    );
    lines.push(
      `- Grand Tichu call/success: ${leg.grand_tichu_call_rate ?? "n/a"} / ${leg.grand_tichu_success_rate ?? "n/a"}`
    );
    lines.push(
      `- Double victory rate: ${leg.double_victory_rate ?? "n/a"}, fallbacks: ${leg.fallback_count}, invalid decisions: ${leg.invalid_decision_count}`
    );
    lines.push(
      `- Average latency by provider: ${JSON.stringify(leg.average_latency_by_provider)}`
    );
    lines.push("");
  }

  if (report.combined_comparison) {
    lines.push("## Combined Comparison");
    lines.push("");
    lines.push(
      `- ${report.combined_comparison.provider_a} win rate: ${report.combined_comparison.provider_a_match_win_rate} (95% CI ${JSON.stringify(report.combined_comparison.provider_a_match_win_rate_ci95)})`
    );
    lines.push(
      `- ${report.combined_comparison.provider_b} win rate: ${report.combined_comparison.provider_b_match_win_rate} (95% CI ${JSON.stringify(report.combined_comparison.provider_b_match_win_rate_ci95)})`
    );
    lines.push(
      `- Average score delta (${report.combined_comparison.provider_a} minus ${report.combined_comparison.provider_b}): ${report.combined_comparison.average_score_delta_provider_a_minus_b}`
    );
    lines.push(
      `- Average latency: ${report.combined_comparison.provider_a}=${report.combined_comparison.provider_a_average_latency_ms ?? "n/a"} ms, ${report.combined_comparison.provider_b}=${report.combined_comparison.provider_b_average_latency_ms ?? "n/a"} ms`
    );
    lines.push("");
  }

  lines.push("## Improvement Gate");
  lines.push("");
  lines.push(
    `- Applied: ${report.gate.applied}, passed: ${report.gate.passed}, challenger: ${report.gate.challenger_provider ?? "n/a"}, baseline: ${report.gate.baseline_provider ?? "n/a"}`
  );
  for (const check of report.gate.checks) {
    lines.push(`- ${check.name}: ${check.passed ? "pass" : "fail"} (${check.details})`);
  }
  lines.push("");
  lines.push(
    "- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples."
  );

  return `${lines.join("\n")}\n`;
}

function printReadableSummary(report: EvaluationReport): void {
  console.log("");
  console.log("Evaluation summary");
  console.log(`- Games played: ${report.latest_summary.games_played}`);
  console.log(`- Hands played: ${report.latest_summary.hands_played}`);
  console.log(`- NS provider: ${report.latest_summary.ns_provider}`);
  console.log(`- EW provider: ${report.latest_summary.ew_provider}`);
  console.log(
    `- Win rate by team: ${JSON.stringify(report.latest_summary.win_rate_by_team)}`
  );
  console.log(
    `- Hand win rate by team: ${JSON.stringify(report.latest_summary.hand_win_rate_by_team)}`
  );
  console.log(
    `- Average score margin: ${report.latest_summary.average_score_margin}`
  );
  console.log(
    `- Tichu call/success: ${report.latest_summary.tichu_call_rate ?? "n/a"} / ${report.latest_summary.tichu_success_rate ?? "n/a"}`
  );
  console.log(
    `- Grand Tichu call/success: ${report.latest_summary.grand_tichu_call_rate ?? "n/a"} / ${report.latest_summary.grand_tichu_success_rate ?? "n/a"}`
  );
  console.log(
    `- Double victory rate: ${report.latest_summary.double_victory_rate ?? "n/a"}`
  );
  console.log(`- Fallback count: ${report.latest_summary.fallback_count}`);
  console.log(
    `- Invalid decision count: ${report.latest_summary.invalid_decision_count}`
  );
  console.log(
    `- Average latency by provider: ${JSON.stringify(report.latest_summary.average_latency_by_provider)}`
  );
  console.log(`- Improvement gate passed: ${report.gate.passed}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
  );
  const defaultOutputPath = path.join(
    repoRoot,
    "artifacts",
    "ml",
    "evaluation-report.json"
  );
  const outputPath = args.outputPath
    ? path.isAbsolute(args.outputPath)
      ? args.outputPath
      : path.join(repoRoot, args.outputPath)
    : defaultOutputPath;
  const outputDir = path.dirname(outputPath);
  const markdownPath = outputPath.replace(/\.json$/i, ".md");
  const latestPath = path.join(repoRoot, "eval", "results", "latest_summary.json");
  const timestampedCompatPath = path.join(
    repoRoot,
    "eval",
    "results",
    `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}_${args.nsProvider}_vs_${args.ewProvider}${args.mirrorSeats ? "_mirrored" : ""}.json`
  );
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(latestPath), { recursive: true });

  const plans = buildLegPlans(args);
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  if (args.quiet) {
    console.log = () => undefined;
    console.info = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
  }

  const legSummaries: EvaluationLegSummary[] = [];
  try {
    for (const plan of plans) {
      const summary = await runSelfPlayBatch({
        games: args.games,
        baseSeed: plan.seed,
        defaultProvider: plan.defaultProvider,
        seatProviders: plan.seatProviders,
        telemetryEnabled: args.telemetryEnabled,
        ...(args.backendBaseUrl ? { backendBaseUrl: args.backendBaseUrl } : {}),
        quiet: args.quiet,
        progress: args.progress
      });
      legSummaries.push(
        buildLegSummary(
          plan.name,
          plan.seed,
          summary,
          plan.seatProviders,
          plan.defaultProvider
        )
      );
    }
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }

  const baselineRun =
    legSummaries.find((leg) => leg.name === "heuristic_sanity") ?? null;
  const comparisonRuns = legSummaries.filter(
    (leg) => leg.name !== "heuristic_sanity"
  );
  const combinedComparison = buildProviderComparisonSummary(
    comparisonRuns,
    args.nsProvider,
    args.ewProvider
  );
  const gate = evaluateImprovementGate({
    comparison: combinedComparison,
    baselineRun,
    comparisonLegs: comparisonRuns,
    args
  });
  const usesLightgbm = [
    args.defaultProvider,
    args.nsProvider,
    args.ewProvider,
    ...Object.values(args.seatProviders).filter(
      (provider): provider is ProviderMode => provider !== undefined
    )
  ].includes("lightgbm_model");
  const modelMetadata = readModelMetadata(repoRoot, usesLightgbm);
  const reportTimestamp = new Date().toISOString();
  const primaryLeg = comparisonRuns[0];
  if (!primaryLeg) {
    throw new Error("No comparison run was produced.");
  }
  const gitCommit = readGitCommit(repoRoot);
  const latestSummary = buildLatestSummary({
    reportTimestamp,
    args,
    primaryLeg,
    gate,
    gitCommit,
    modelFile: modelMetadata.modelFile,
    modelVersion: modelMetadata.modelVersion
  });

  const report: EvaluationReport = {
    timestamp: reportTimestamp,
    base_seed: args.seed,
    backend_url: args.backendBaseUrl ?? null,
    telemetry_enabled: args.telemetryEnabled,
    mirror_seats: args.mirrorSeats,
    baseline_run: baselineRun,
    comparison_runs: comparisonRuns,
    combined_comparison: combinedComparison,
    gate,
    git_commit: gitCommit,
    model_file: modelMetadata.modelFile,
    model_version: modelMetadata.modelVersion,
    latest_summary: latestSummary
  };

  const jsonPayload = JSON.stringify(report, null, 2);
  fs.writeFileSync(outputPath, jsonPayload, "utf8");
  fs.writeFileSync(markdownPath, buildMarkdownReport(report), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(latestSummary, null, 2), "utf8");
  fs.writeFileSync(
    timestampedCompatPath,
    JSON.stringify(latestSummary, null, 2),
    "utf8"
  );

  if (!args.quiet) {
    printReadableSummary(report);
    console.log(`- Evaluation report: ${outputPath}`);
    console.log(`- Evaluation markdown: ${markdownPath}`);
    console.log(`- Latest summary: ${latestPath}`);
    console.log(`- Timestamped summary: ${timestampedCompatPath}`);
  } else {
    console.log(jsonPayload);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        accepted: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
