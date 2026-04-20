import { SEAT_IDS, type SeatId } from "@tichuml/engine";
import { runSelfPlayBatch, type SeatProviderOverrides } from "./self-play-batch.js";

type ParsedArgs = {
  games: number;
  provider: "local" | "server_heuristic" | "lightgbm_model";
  backendBaseUrl?: string;
  seed: string;
  telemetryEnabled: boolean;
  quiet: boolean;
  progress: boolean;
  seatProviders: SeatProviderOverrides;
};

function isSeatId(value: string): value is SeatId {
  return SEAT_IDS.includes(value as SeatId);
}

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

function parseSeatProvider(value: string, seatProviders: SeatProviderOverrides): void {
  const [seat, provider] = value.split("=");
  if (!seat || !provider || !isSeatId(seat)) {
    throw new Error(`Invalid --seat-provider value: ${value}`);
  }
  if (!["local", "server_heuristic", "lightgbm_model"].includes(provider)) {
    throw new Error(`Invalid seat provider: ${provider}`);
  }
  seatProviders[seat] = provider as ParsedArgs["provider"];
}

function parseArgs(argv: string[]): ParsedArgs {
  const seatProviders: SeatProviderOverrides = {};
  const parsed: ParsedArgs = {
    games: 1,
    provider: "local",
    seed: "self-play",
    telemetryEnabled: true,
    quiet: false,
    progress: true,
    seatProviders
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--games":
      case "--hands":
        parsed.games = Number(next ?? 1);
        index += 1;
        break;
      case "--provider":
        if (!next || !["local", "server_heuristic", "lightgbm_model"].includes(next)) {
          throw new Error(`Invalid provider: ${next ?? ""}`);
        }
        parsed.provider = next as ParsedArgs["provider"];
        index += 1;
        break;
      case "--backend-url":
        if (next) {
          parsed.backendBaseUrl = next;
        }
        index += 1;
        break;
      case "--seed":
      case "--base-seed":
        parsed.seed = next ?? parsed.seed;
        index += 1;
        break;
      case "--telemetry":
        parsed.telemetryEnabled = parseBoolean(next, true);
        index += 1;
        break;
      case "--quiet":
        parsed.quiet = true;
        parsed.progress = false;
        break;
      case "--progress":
        parsed.progress = true;
        break;
      case "--seat-provider":
        if (!next) {
          throw new Error("Missing value for --seat-provider");
        }
        parseSeatProvider(next, seatProviders);
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
      defaultProvider: args.provider,
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

  console.log(JSON.stringify(summary, null, args.quiet ? 0 : 2));
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
