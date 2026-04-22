import fs from "node:fs";
import path from "node:path";
import { SEAT_IDS, type SeatId } from "@tichuml/engine";
import { runSelfPlayBatch, type SeatProviderOverrides } from "./self-play-batch.js";
import type {
  DecisionMode,
  SimControllerConfig,
  SimControllerRuntimeState,
  SimWorkerRuntimeState
} from "@tichuml/shared";

type ParsedArgs = {
  games: number;
  provider: DecisionMode;
  backendBaseUrl?: string;
  serverFallbackEnabled: boolean;
  seed: string;
  seedPrefix: string;
  telemetryEnabled: boolean;
  quiet: boolean;
  progress: boolean;
  seatProviders: SeatProviderOverrides;
  forever: boolean;
  gamesPerBatch: number;
  sleepSeconds: number;
  workerCount: number;
  runtimeFile: string;
  lockFile: string;
  pauseFile: string;
  stopFile: string;
  logFile: string;
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
    serverFallbackEnabled: true,
    seed: "self-play",
    seedPrefix: "self-play",
    telemetryEnabled: true,
    quiet: false,
    progress: true,
    seatProviders,
    forever: false,
    gamesPerBatch: 1,
    sleepSeconds: 5,
    workerCount: 1,
    runtimeFile: path.join(".runtime", "sim-controller", "state.json"),
    lockFile: path.join(".runtime", "sim-controller", "controller.lock"),
    pauseFile: path.join(".runtime", "sim-controller", "pause"),
    stopFile: path.join(".runtime", "sim-controller", "stop"),
    logFile: path.join(".runtime", "sim-controller", "controller.ndjson")
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
      case "--server-fallback":
      case "--server-fallback-enabled":
        parsed.serverFallbackEnabled = parseBoolean(next, true);
        index += 1;
        break;
      case "--seed":
      case "--base-seed":
        parsed.seed = next ?? parsed.seed;
        parsed.seedPrefix = parsed.seed;
        index += 1;
        break;
      case "--seed-prefix":
        parsed.seedPrefix = next ?? parsed.seedPrefix;
        index += 1;
        break;
      case "--forever":
        parsed.forever = true;
        break;
      case "--games-per-batch":
        parsed.gamesPerBatch = Math.max(1, Number(next ?? parsed.gamesPerBatch));
        index += 1;
        break;
      case "--sleep-seconds":
        parsed.sleepSeconds = Math.max(0, Number(next ?? parsed.sleepSeconds));
        index += 1;
        break;
      case "--worker-count":
      case "--sim-threads":
        parsed.workerCount = Math.max(1, Number(next ?? parsed.workerCount));
        index += 1;
        break;
      case "--runtime-file":
        parsed.runtimeFile = next ?? parsed.runtimeFile;
        index += 1;
        break;
      case "--lock-file":
        parsed.lockFile = next ?? parsed.lockFile;
        index += 1;
        break;
      case "--pause-file":
        parsed.pauseFile = next ?? parsed.pauseFile;
        index += 1;
        break;
      case "--stop-file":
        parsed.stopFile = next ?? parsed.stopFile;
        index += 1;
        break;
      case "--log-file":
        parsed.logFile = next ?? parsed.logFile;
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

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function writeJson(filePath: string, payload: unknown): void {
  ensureParent(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendLog(args: ParsedArgs, event: string, payload: Record<string, unknown>): void {
  ensureParent(args.logFile);
  fs.appendFileSync(
    args.logFile,
    `${JSON.stringify({ ts: nowIso(), event, ...payload })}\n`,
    "utf8"
  );
}

function acquireLock(args: ParsedArgs): number {
  ensureParent(args.lockFile);
  const handle = fs.openSync(args.lockFile, "wx");
  fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, created_at: nowIso() }));
  return handle;
}

function releaseLock(args: ParsedArgs, handle: number): void {
  fs.closeSync(handle);
  if (fs.existsSync(args.lockFile)) {
    fs.unlinkSync(args.lockFile);
  }
}

function buildControllerConfig(args: ParsedArgs): SimControllerConfig {
  return {
    provider: args.provider,
    games_per_batch: args.gamesPerBatch,
    telemetry_enabled: args.telemetryEnabled,
    server_fallback_enabled: args.serverFallbackEnabled,
    backend_url: args.backendBaseUrl ?? "http://localhost:4310",
    seed_prefix: args.seedPrefix,
    sleep_seconds: args.sleepSeconds,
    worker_count: args.workerCount,
    quiet: args.quiet,
    progress: args.progress,
    seat_providers: Object.fromEntries(
      Object.entries(args.seatProviders).filter(
        (entry): entry is [string, DecisionMode] => entry[1] !== undefined
      )
    )
  };
}

function createWorker(workerId: string): SimWorkerRuntimeState {
  return {
    worker_id: workerId,
    status: "starting",
    pid: process.pid,
    current_batch_started_at: null,
    total_batches_completed: 0,
    total_games_completed: 0,
    last_heartbeat: nowIso(),
    last_error: null
  };
}

function deriveControllerStatus(workers: SimWorkerRuntimeState[]): SimControllerRuntimeState["status"] {
  if (workers.some((worker) => worker.status === "error")) {
    return "error";
  }
  if (workers.every((worker) => worker.status === "paused")) {
    return "paused";
  }
  if (workers.every((worker) => worker.status === "stopped" || worker.status === "completed")) {
    return "stopped";
  }
  if (workers.some((worker) => worker.status === "stopping")) {
    return "stopping";
  }
  if (workers.some((worker) => worker.status === "running")) {
    return "running";
  }
  return "starting";
}

function buildRuntimeState(
  args: ParsedArgs,
  workers: SimWorkerRuntimeState[],
  startedAt: string,
  warnings: string[] = []
): SimControllerRuntimeState {
  const status = deriveControllerStatus(workers);
  const latestHeartbeat = workers
    .map((worker) => worker.last_heartbeat)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? nowIso();
  const running = workers.filter((worker) => worker.status === "running").length;
  const paused = workers.filter((worker) => worker.status === "paused").length;
  const stopped = workers.filter(
    (worker) => worker.status === "stopped" || worker.status === "completed"
  ).length;
  const errored = workers.filter((worker) => worker.status === "error").length;
  const allBatchStarts = workers
    .map((worker) => worker.current_batch_started_at)
    .filter((value): value is string => value !== null)
    .sort();
  const totalBatches = workers.reduce(
    (sum, worker) => sum + worker.total_batches_completed,
    0
  );
  const totalGames = workers.reduce(
    (sum, worker) => sum + worker.total_games_completed,
    0
  );

  return {
    status,
    pid: process.pid,
    controller_id: `sim-${process.pid}`,
    started_at: startedAt,
    updated_at: nowIso(),
    last_heartbeat: latestHeartbeat,
    heartbeat_stale: false,
    heartbeat_stale_after_seconds: 30,
    requested_action: fs.existsSync(args.stopFile)
      ? "stop"
      : fs.existsSync(args.pauseFile)
        ? "pause"
        : null,
    current_batch_started_at: allBatchStarts.at(-1) ?? null,
    last_batch_started_at: allBatchStarts.at(-1) ?? null,
    last_batch_finished_at: null,
    last_batch_size: args.gamesPerBatch,
    last_batch_status: status,
    total_batches_completed: totalBatches,
    total_games_completed: totalGames,
    total_errors: workers.filter((worker) => worker.last_error !== null).length,
    last_error:
      workers.find((worker) => worker.last_error !== null)?.last_error ?? null,
    worker_count: workers.length,
    running_worker_count: running,
    paused_worker_count: paused,
    stopped_worker_count: stopped,
    errored_worker_count: errored,
    config: buildControllerConfig(args),
    workers,
    log_path: path.resolve(args.logFile),
    runtime_path: path.resolve(args.runtimeFile),
    lock_path: path.resolve(args.lockFile),
    pause_path: path.resolve(args.pauseFile),
    stop_path: path.resolve(args.stopFile),
    warnings,
    recent_logs: []
  };
}

async function waitWhilePaused(args: ParsedArgs, worker: SimWorkerRuntimeState): Promise<void> {
  while (fs.existsSync(args.pauseFile) && !fs.existsSync(args.stopFile)) {
    worker.status = "paused";
    worker.current_batch_started_at = null;
    worker.last_heartbeat = nowIso();
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
    await sleep(1000);
  }
}

let activeWorkers: SimWorkerRuntimeState[] = [];
let activeStartedAt = nowIso();

async function runWorker(args: ParsedArgs, worker: SimWorkerRuntimeState): Promise<void> {
  let batchIndex = 0;
  while (!fs.existsSync(args.stopFile)) {
    await waitWhilePaused(args, worker);
    if (fs.existsSync(args.stopFile)) {
      break;
    }

    const batchStartedAt = nowIso();
    worker.status = "running";
    worker.current_batch_started_at = batchStartedAt;
    worker.last_heartbeat = batchStartedAt;
    appendLog(args, "batch_start", {
      worker_id: worker.worker_id,
      batch_index: batchIndex,
      games: args.gamesPerBatch
    });
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));

    try {
      const summary = await runSelfPlayBatch({
        games: args.gamesPerBatch,
        baseSeed: `${args.seedPrefix}-${worker.worker_id}-batch-${batchIndex}`,
        defaultProvider: args.provider,
        seatProviders: args.seatProviders,
        telemetryEnabled: args.telemetryEnabled,
        serverFallbackEnabled: args.serverFallbackEnabled,
        ...(args.backendBaseUrl ? { backendBaseUrl: args.backendBaseUrl } : {}),
        quiet: args.quiet,
        progress: args.progress,
        workerId: worker.worker_id,
        controllerMode: true
      });
      worker.total_batches_completed += 1;
      worker.total_games_completed += summary.gamesPlayed;
      worker.last_error = summary.errors > 0 ? `${summary.errors} game errors in batch` : null;
      appendLog(args, "batch_end", {
        worker_id: worker.worker_id,
        batch_index: batchIndex,
        summary
      });
    } catch (error) {
      worker.status = "error";
      worker.last_error = error instanceof Error ? error.message : String(error);
      appendLog(args, "worker_error", {
        worker_id: worker.worker_id,
        batch_index: batchIndex,
        error: worker.last_error
      });
      writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
      return;
    }

    batchIndex += 1;
    worker.current_batch_started_at = null;
    worker.last_heartbeat = nowIso();
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
    if (args.sleepSeconds > 0 && !fs.existsSync(args.stopFile)) {
      await sleep(args.sleepSeconds * 1000);
    }
  }

  worker.status = "stopped";
  worker.current_batch_started_at = null;
  worker.last_heartbeat = nowIso();
  appendLog(args, "worker_stopped", { worker_id: worker.worker_id });
  writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
}

async function runForever(args: ParsedArgs): Promise<void> {
  const lockHandle = acquireLock(args);
  activeStartedAt = nowIso();
  activeWorkers = Array.from({ length: args.workerCount }, (_, index) =>
    createWorker(`worker-${String(index + 1).padStart(2, "0")}`)
  );

  appendLog(args, "controller_start", {
    pid: process.pid,
    config: buildControllerConfig(args)
  });
  writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));

  const heartbeat = setInterval(() => {
    for (const worker of activeWorkers) {
      worker.last_heartbeat = nowIso();
    }
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
  }, 3000);

  try {
    await Promise.all(activeWorkers.map((worker) => runWorker(args, worker)));
    appendLog(args, "controller_stop", { pid: process.pid });
  } finally {
    clearInterval(heartbeat);
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
    releaseLock(args, lockHandle);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.forever) {
    await runForever(args);
    return;
  }

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
      serverFallbackEnabled: args.serverFallbackEnabled,
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
