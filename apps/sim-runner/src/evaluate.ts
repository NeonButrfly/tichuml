import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SEAT_IDS, type SeatId } from "@tichuml/engine";
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
};

type EvaluationSummary = {
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
  win_counts: Record<string, number>;
  win_rate_by_team: Record<string, number>;
  average_score_margin: number;
  total_score_by_team: Record<string, number>;
  pass_rate: number;
  bomb_usage_rate: number;
  wish_satisfaction_rate: number | null;
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
  return value === "local" || value === "server_heuristic" || value === "lightgbm_model";
}

function isSeatId(value: string): value is SeatId {
  return SEAT_IDS.includes(value as SeatId);
}

function parseSeatProvider(value: string, seatProviders: SeatProviderOverrides): void {
  const [seat, provider] = value.split("=");
  if (!seat || !provider || !isSeatId(seat) || !isProviderMode(provider)) {
    throw new Error(`Invalid --seat-provider value: ${value}`);
  }
  seatProviders[seat] = provider;
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
    seatProviders
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--games":
      case "--hands":
        parsed.games = Number(next ?? parsed.games);
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

function resolveTeamProvider(seatProviders: SeatProviderOverrides, seats: [SeatId, SeatId]): string {
  const [left, right] = seats;
  const leftProvider = seatProviders[left] ?? "local";
  const rightProvider = seatProviders[right] ?? "local";
  return leftProvider === rightProvider ? leftProvider : "mixed";
}

function readModelMetadata(repoRoot: string, usesLightgbm: boolean): {
  modelFile: string | null;
  modelVersion: string | null;
} {
  if (!usesLightgbm) {
    return { modelFile: null, modelVersion: null };
  }

  const metaPath = path.join(repoRoot, "ml", "model_registry", "lightgbm_action_model.meta.json");
  const modelPath = path.join(repoRoot, "ml", "model_registry", "lightgbm_action_model.txt");
  if (!fs.existsSync(metaPath)) {
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion: null
    };
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      created_at?: string;
      phase?: string;
    };
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion:
        metadata.created_at && metadata.phase
          ? `${metadata.phase}@${metadata.created_at}`
          : metadata.created_at ?? metadata.phase ?? null
    };
  } catch {
    return {
      modelFile: fs.existsSync(modelPath) ? modelPath : null,
      modelVersion: null
    };
  }
}

function buildEvaluationSummary(
  summary: SelfPlayBatchSummary,
  args: ParsedArgs,
  repoRoot: string
): EvaluationSummary {
  const team0Wins = summary.winCountsByTeam["team-0"] ?? 0;
  const team1Wins = summary.winCountsByTeam["team-1"] ?? 0;
  const ties = summary.winCountsByTeam.tie ?? 0;
  const usesLightgbm = Object.values(args.seatProviders).some(
    (provider) => provider === "lightgbm_model"
  );
  const modelMetadata = readModelMetadata(repoRoot, usesLightgbm);

  return {
    timestamp: new Date().toISOString(),
    games_played: summary.gamesPlayed,
    hands_played: summary.handsPlayed,
    base_seed: args.seed,
    default_provider: args.defaultProvider,
    ns_provider: resolveTeamProvider(args.seatProviders, ["seat-0", "seat-2"]),
    ew_provider: resolveTeamProvider(args.seatProviders, ["seat-1", "seat-3"]),
    seat_providers: Object.fromEntries(
      Object.entries(args.seatProviders).map(([seat, provider]) => [seat, provider ?? args.defaultProvider])
    ),
    backend_url: args.backendBaseUrl ?? null,
    telemetry_enabled: args.telemetryEnabled,
    win_counts: {
      "team-0": team0Wins,
      "team-1": team1Wins,
      tie: ties
    },
    win_rate_by_team: {
      "team-0":
        summary.gamesPlayed > 0 ? Number((team0Wins / summary.gamesPlayed).toFixed(4)) : 0,
      "team-1":
        summary.gamesPlayed > 0 ? Number((team1Wins / summary.gamesPlayed).toFixed(4)) : 0,
      tie: summary.gamesPlayed > 0 ? Number((ties / summary.gamesPlayed).toFixed(4)) : 0
    },
    average_score_margin: summary.averageScoreMargin,
    total_score_by_team: summary.totalScoreByTeam,
    pass_rate: summary.passRate,
    bomb_usage_rate: summary.bombUsageRate,
    wish_satisfaction_rate: summary.wishSatisfactionRate,
    fallback_count: summary.fallbackCount,
    invalid_decision_count: summary.invalidDecisionCount,
    average_latency_by_provider: summary.averageLatencyByProvider,
    provider_usage: summary.providerUsage,
    decisions_by_phase: summary.decisionsByPhase,
    events_by_phase: summary.eventsByPhase,
    exchange_phase_recorded: summary.exchangePhaseRecorded,
    pass_select_recorded: summary.passSelectRecorded,
    errors: summary.errors,
    git_commit: readGitCommit(repoRoot),
    model_file: modelMetadata.modelFile,
    model_version: modelMetadata.modelVersion
  };
}

function buildDefaultOutputPath(repoRoot: string, args: ParsedArgs): string {
  const outputDir = path.join(repoRoot, "eval", "results");
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const nsProvider = resolveTeamProvider(args.seatProviders, ["seat-0", "seat-2"]).replaceAll("/", "-");
  const ewProvider = resolveTeamProvider(args.seatProviders, ["seat-1", "seat-3"]).replaceAll("/", "-");
  return path.join(outputDir, `${timestamp}_${nsProvider}_vs_${ewProvider}.json`);
}

function printReadableSummary(summary: EvaluationSummary): void {
  console.log("");
  console.log("Evaluation summary");
  console.log(`- Games played: ${summary.games_played}`);
  console.log(`- Hands played: ${summary.hands_played}`);
  console.log(`- NS provider: ${summary.ns_provider}`);
  console.log(`- EW provider: ${summary.ew_provider}`);
  console.log(`- Win counts: ${JSON.stringify(summary.win_counts)}`);
  console.log(`- Win rate by team: ${JSON.stringify(summary.win_rate_by_team)}`);
  console.log(`- Average score margin: ${summary.average_score_margin}`);
  console.log(`- Total score by team: ${JSON.stringify(summary.total_score_by_team)}`);
  console.log(`- Pass rate: ${summary.pass_rate}`);
  console.log(`- Bomb usage rate: ${summary.bomb_usage_rate}`);
  console.log(`- Wish satisfaction rate: ${summary.wish_satisfaction_rate ?? "n/a"}`);
  console.log(`- Fallback count: ${summary.fallback_count}`);
  console.log(`- Invalid decision count: ${summary.invalid_decision_count}`);
  console.log(`- Average latency by provider: ${JSON.stringify(summary.average_latency_by_provider)}`);
  console.log(`- Exchange recorded: ${summary.exchange_phase_recorded}`);
  console.log(`- Pass-select recorded: ${summary.pass_select_recorded}`);
  console.log(`- Git commit: ${summary.git_commit ?? "unknown"}`);
  if (summary.model_file) {
    console.log(`- LightGBM model: ${summary.model_file}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
  );
  const outputPath = args.outputPath
    ? path.isAbsolute(args.outputPath)
      ? args.outputPath
      : path.join(repoRoot, args.outputPath)
    : buildDefaultOutputPath(repoRoot, args);
  const latestPath = path.join(repoRoot, "eval", "results", "latest_summary.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

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

  let summary;
  try {
    summary = await runSelfPlayBatch({
      games: args.games,
      baseSeed: args.seed,
      defaultProvider: args.defaultProvider,
      seatProviders: args.seatProviders,
      telemetryEnabled: args.telemetryEnabled,
      ...(args.backendBaseUrl ? { backendBaseUrl: args.backendBaseUrl } : {}),
      quiet: args.quiet,
      progress: args.progress
    });
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }

  const evaluationSummary = buildEvaluationSummary(summary, args, repoRoot);
  const payload = JSON.stringify(evaluationSummary, null, 2);
  fs.writeFileSync(outputPath, payload, "utf8");
  fs.writeFileSync(latestPath, payload, "utf8");

  if (!args.quiet) {
    printReadableSummary(evaluationSummary);
    console.log(`- Summary file: ${outputPath}`);
    console.log(`- Latest summary: ${latestPath}`);
  } else {
    console.log(payload);
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
