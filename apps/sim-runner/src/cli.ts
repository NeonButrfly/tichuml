import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SEAT_IDS, type SeatId } from "@tichuml/engine";
import { runSelfPlayBatch, type SeatProviderOverrides } from "./self-play-batch.js";
import type {
  DecisionMode,
  SimControllerConfig,
  SimControllerRuntimeState,
  SimControllerStatus,
  SimRunSeedInfo,
  SimWorkerRuntimeState
} from "@tichuml/shared";

const DEFAULT_TELEMETRY_MAX_POST_BYTES = 24 * 1024 * 1024;
const DEFAULT_TELEMETRY_POST_TIMEOUT_MS = 10_000;
const DEFAULT_TELEMETRY_RETRY_ATTEMPTS = 2;
const DEFAULT_TELEMETRY_RETRY_DELAY_MS = 250;
const DEFAULT_TELEMETRY_BACKOFF_MS = 15_000;
const RUNTIME_SCHEMA_VERSION = 2;
const ACTIVE_CONTROLLER_STATUSES = new Set<SimControllerStatus>([
  "starting",
  "running",
  "pausing",
  "paused",
  "stopping"
]);

type ParsedArgs = {
  games: number;
  provider: DecisionMode;
  backendBaseUrl?: string;
  serverFallbackEnabled: boolean;
  strictTelemetry: boolean;
  traceBackend: boolean;
  telemetryMode: "minimal" | "full";
  telemetryMaxBytes: number;
  telemetryTimeoutMs: number;
  telemetryRetryAttempts: number;
  telemetryRetryDelayMs: number;
  telemetryBackoffMs: number;
  seed: string;
  seedNamespace: string;
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
  controllerSessionId: string | null;
  runSeedInfo: SimRunSeedInfo | null;
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

function parseTelemetryMode(value: string | undefined): "minimal" | "full" {
  return value === "full" ? "full" : "minimal";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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

function parseRunSeedInfo(raw: string | undefined): SimRunSeedInfo | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SimRunSeedInfo>;
    if (
      typeof parsed.resolved_run_seed !== "string" ||
      parsed.resolved_run_seed.trim().length === 0
    ) {
      return null;
    }
    return {
      mode:
        parsed.mode === "manual_override" ? "manual_override" : "automatic_entropy",
      resolved_run_seed: parsed.resolved_run_seed,
      derivation_namespace:
        typeof parsed.derivation_namespace === "string" &&
        parsed.derivation_namespace.length > 0
          ? parsed.derivation_namespace
          : "controller",
      manual_override_enabled: parsed.manual_override_enabled === true,
      manual_override_seed:
        typeof parsed.manual_override_seed === "string" &&
        parsed.manual_override_seed.length > 0
          ? parsed.manual_override_seed
          : null,
      generated_at:
        typeof parsed.generated_at === "string" && parsed.generated_at.length > 0
          ? parsed.generated_at
          : new Date(0).toISOString(),
      entropy_game_id:
        typeof parsed.entropy_game_id === "string" &&
        parsed.entropy_game_id.length > 0
          ? parsed.entropy_game_id
          : null,
      audit_hash_hex:
        typeof parsed.audit_hash_hex === "string" &&
        parsed.audit_hash_hex.length > 0
          ? parsed.audit_hash_hex
          : null,
      primary_provider:
        typeof parsed.primary_provider === "string" &&
        parsed.primary_provider.length > 0
          ? parsed.primary_provider
          : null,
      local_fallback_used:
        typeof parsed.local_fallback_used === "boolean"
          ? parsed.local_fallback_used
          : null,
      source_summary:
        parsed.source_summary && typeof parsed.source_summary === "object"
          ? parsed.source_summary
          : null
    };
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const seatProviders: SeatProviderOverrides = {};
  const parsed: ParsedArgs = {
    games: 1,
    provider: "local",
    serverFallbackEnabled: true,
    strictTelemetry: false,
    traceBackend: false,
    telemetryMode: parseTelemetryMode(process.env.TELEMETRY_MODE),
    telemetryMaxBytes: parsePositiveInteger(
      process.env.TELEMETRY_MAX_POST_BYTES,
      DEFAULT_TELEMETRY_MAX_POST_BYTES
    ),
    telemetryTimeoutMs: parsePositiveInteger(
      process.env.TELEMETRY_POST_TIMEOUT_MS,
      DEFAULT_TELEMETRY_POST_TIMEOUT_MS
    ),
    telemetryRetryAttempts: parsePositiveInteger(
      process.env.TELEMETRY_RETRY_ATTEMPTS,
      DEFAULT_TELEMETRY_RETRY_ATTEMPTS
    ),
    telemetryRetryDelayMs: parsePositiveInteger(
      process.env.TELEMETRY_RETRY_DELAY_MS,
      DEFAULT_TELEMETRY_RETRY_DELAY_MS
    ),
    telemetryBackoffMs: parsePositiveInteger(
      process.env.TELEMETRY_BACKOFF_MS,
      DEFAULT_TELEMETRY_BACKOFF_MS
    ),
    seed: "self-play",
    seedNamespace: "controller",
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
    logFile: path.join(".runtime", "sim-controller", "controller.ndjson"),
    controllerSessionId:
      process.env.SIM_CONTROLLER_SESSION_ID?.trim() || null,
    runSeedInfo: parseRunSeedInfo(process.env.SIM_RUN_SEED_INFO_JSON)
  };

  if (parsed.runSeedInfo) {
    parsed.seed = parsed.runSeedInfo.resolved_run_seed;
    parsed.seedNamespace = parsed.runSeedInfo.derivation_namespace;
  }

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
      case "--strict-telemetry":
        parsed.strictTelemetry = parseBoolean(next, false);
        index += 1;
        break;
      case "--trace-backend":
        parsed.traceBackend = parseBoolean(next, false);
        index += 1;
        break;
      case "--telemetry-mode":
        if (next === "minimal" || next === "full") {
          parsed.telemetryMode = next;
        } else {
          throw new Error(`Invalid telemetry mode: ${next ?? ""}`);
        }
        index += 1;
        break;
      case "--telemetry-max-bytes":
        parsed.telemetryMaxBytes = parsePositiveInteger(next, parsed.telemetryMaxBytes);
        index += 1;
        break;
      case "--telemetry-timeout-ms":
        parsed.telemetryTimeoutMs = parsePositiveInteger(next, parsed.telemetryTimeoutMs);
        index += 1;
        break;
      case "--telemetry-retry-attempts":
        parsed.telemetryRetryAttempts = parsePositiveInteger(next, parsed.telemetryRetryAttempts);
        index += 1;
        break;
      case "--telemetry-retry-delay-ms":
        parsed.telemetryRetryDelayMs = parsePositiveInteger(next, parsed.telemetryRetryDelayMs);
        index += 1;
        break;
      case "--telemetry-backoff-ms":
        parsed.telemetryBackoffMs = parsePositiveInteger(next, parsed.telemetryBackoffMs);
        index += 1;
        break;
      case "--seed":
      case "--base-seed":
        parsed.seed = next ?? parsed.seed;
        index += 1;
        break;
      case "--seed-prefix":
        parsed.seedNamespace = next ?? parsed.seedNamespace;
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

  if (parsed.runSeedInfo) {
    parsed.runSeedInfo = {
      ...parsed.runSeedInfo,
      resolved_run_seed: parsed.seed,
      derivation_namespace: parsed.seedNamespace
    };
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

function resolveRunSeedInfo(args: ParsedArgs): SimRunSeedInfo {
  if (args.runSeedInfo) {
    return args.runSeedInfo;
  }
  return {
    mode: "manual_override",
    resolved_run_seed: args.seed,
    derivation_namespace: args.seedNamespace,
    manual_override_enabled: true,
    manual_override_seed: args.seed,
    generated_at: nowIso(),
    entropy_game_id: null,
    audit_hash_hex: null,
    primary_provider: "manual_override",
    local_fallback_used: null,
    source_summary: null
  };
}

function buildControllerConfig(args: ParsedArgs): SimControllerConfig {
  const runSeedInfo = resolveRunSeedInfo(args);
  return {
    provider: args.provider,
    games_per_batch: args.gamesPerBatch,
    telemetry_enabled: args.telemetryEnabled,
    server_fallback_enabled: args.serverFallbackEnabled,
    strict_telemetry: args.strictTelemetry,
    trace_backend: args.traceBackend,
    telemetry_mode: args.telemetryMode,
    telemetry_max_bytes: args.telemetryMaxBytes,
    telemetry_timeout_ms: args.telemetryTimeoutMs,
    telemetry_retry_attempts: args.telemetryRetryAttempts,
    telemetry_retry_delay_ms: args.telemetryRetryDelayMs,
    telemetry_backoff_ms: args.telemetryBackoffMs,
    backend_url: args.backendBaseUrl ?? "http://localhost:4310",
    seed_namespace: args.seedNamespace,
    manual_seed_override_enabled: runSeedInfo.manual_override_enabled,
    manual_seed_override: runSeedInfo.manual_override_seed ?? "",
    seed_prefix: args.seedNamespace,
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

function createWorker(args: ParsedArgs, workerId: string): SimWorkerRuntimeState {
  return {
    worker_id: workerId,
    controller_session_id: args.controllerSessionId,
    status: "starting",
    pid: process.pid,
    current_batch_started_at: null,
    total_batches_completed: 0,
    total_games_completed: 0,
    last_heartbeat: nowIso(),
    last_error: null
  };
}

function deriveControllerStatus(workers: SimWorkerRuntimeState[]): SimControllerStatus {
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

export function deriveControllerBatchBaseSeed(config: {
  resolvedRunSeed: string;
  derivationNamespace: string;
  workerId: string;
  batchIndex: number;
}): string {
  return createHash("sha256")
    .update(config.resolvedRunSeed)
    .update("|")
    .update(config.derivationNamespace)
    .update("|")
    .update(config.workerId)
    .update("|")
    .update(String(config.batchIndex))
    .digest("hex")
    .slice(0, 32);
}

function updateLastBatch(config: {
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}): void {
  if (config.startedAt !== undefined) {
    activeLastBatchStartedAt = config.startedAt;
  }
  if (config.finishedAt !== undefined) {
    activeLastBatchFinishedAt = config.finishedAt;
  }
  activeLastBatchStatus = config.status;
}

function buildRuntimeState(
  args: ParsedArgs,
  workers: SimWorkerRuntimeState[],
  startedAt: string,
  options: {
    statusOverride?: SimControllerStatus;
    currentPid?: number | null;
    controllerSessionId?: string | null;
    activeRunSeed?: SimRunSeedInfo | null;
    lastRunSeed?: SimRunSeedInfo | null;
    lastShutdownReason?: string | null;
    lastExitCode?: number | null;
    lastExitSignal?: string | null;
  } = {}
): SimControllerRuntimeState {
  const status = options.statusOverride ?? deriveControllerStatus(workers);
  const latestHeartbeat = workers
    .map((worker) => worker.last_heartbeat)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? nowIso();
  const running = workers.filter((worker) => worker.status === "running").length;
  const paused = workers.filter((worker) => worker.status === "paused").length;
  const stoppedWorkers = workers.filter(
    (worker) => worker.status === "stopped" || worker.status === "completed"
  );
  const errored = workers.filter((worker) => worker.status === "error").length;
  const currentBatchStarts = workers
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
  const telemetryFailures = activeTelemetryFailures;
  const liveWorkers = ACTIVE_CONTROLLER_STATUSES.has(status) ? workers : [];
  const hasCurrentBatch = currentBatchStarts.length > 0;
  const currentRunSeed = ACTIVE_CONTROLLER_STATUSES.has(status)
    ? options.activeRunSeed ?? activeRunSeedInfo
    : null;
  const historicalRunSeed =
    currentRunSeed === null
      ? options.lastRunSeed ?? lastRunSeedInfo ?? activeRunSeedInfo
      : options.lastRunSeed ?? lastRunSeedInfo;

  return {
    runtime_schema_version: RUNTIME_SCHEMA_VERSION,
    status,
    pid: ACTIVE_CONTROLLER_STATUSES.has(status)
      ? (options.currentPid ?? process.pid)
      : null,
    controller_id: "sim-controller",
    controller_session_id: ACTIVE_CONTROLLER_STATUSES.has(status)
      ? (options.controllerSessionId ?? args.controllerSessionId)
      : null,
    started_at: ACTIVE_CONTROLLER_STATUSES.has(status) ? startedAt : null,
    updated_at: nowIso(),
    last_heartbeat: ACTIVE_CONTROLLER_STATUSES.has(status) ? latestHeartbeat : null,
    heartbeat_stale: false,
    heartbeat_stale_after_seconds: 30,
    requested_action: fs.existsSync(args.stopFile)
      ? "stop"
      : fs.existsSync(args.pauseFile)
        ? "pause"
        : null,
    current_batch_started_at: hasCurrentBatch ? currentBatchStarts.at(-1) ?? null : null,
    last_batch_started_at: activeLastBatchStartedAt,
    last_batch_finished_at: activeLastBatchFinishedAt,
    last_batch_size: args.gamesPerBatch,
    last_batch_status: hasCurrentBatch ? "running" : activeLastBatchStatus,
    total_batches_completed: totalBatches,
    total_games_completed: totalGames,
    total_errors: workers.filter((worker) => worker.last_error !== null).length,
    last_error:
      workers.find((worker) => worker.last_error !== null)?.last_error ?? null,
    last_shutdown_reason: options.lastShutdownReason ?? activeLastShutdownReason,
    last_exit_code: options.lastExitCode ?? activeLastExitCode,
    last_exit_signal: options.lastExitSignal ?? activeLastExitSignal,
    active_run_seed: currentRunSeed,
    last_run_seed: historicalRunSeed,
    telemetry_decision_failures: telemetryFailures.telemetryDecisionFailures,
    telemetry_event_failures: telemetryFailures.telemetryEventFailures,
    telemetry_failures_total: telemetryFailures.telemetryFailuresTotal,
    telemetry_failure_by_endpoint: telemetryFailures.telemetryFailureByEndpoint,
    telemetry_failure_by_kind: telemetryFailures.telemetryFailureByKind,
    telemetry_backoff_until: activeTelemetryBackoffUntil,
    worker_count: liveWorkers.length,
    running_worker_count: ACTIVE_CONTROLLER_STATUSES.has(status) ? running : 0,
    paused_worker_count: ACTIVE_CONTROLLER_STATUSES.has(status) ? paused : 0,
    stopped_worker_count: ACTIVE_CONTROLLER_STATUSES.has(status)
      ? stoppedWorkers.length
      : 0,
    errored_worker_count: ACTIVE_CONTROLLER_STATUSES.has(status) ? errored : 0,
    config: buildControllerConfig(args),
    workers: liveWorkers,
    log_path: path.resolve(args.logFile),
    runtime_path: path.resolve(args.runtimeFile),
    lock_path: path.resolve(args.lockFile),
    pause_path: path.resolve(args.pauseFile),
    stop_path: path.resolve(args.stopFile),
    warnings: [],
    recent_logs: []
  };
}

function buildTerminalRuntimeState(
  args: ParsedArgs,
  status: SimControllerStatus,
  workers: SimWorkerRuntimeState[]
): SimControllerRuntimeState {
  const interrupted =
    workers.some((worker) => worker.current_batch_started_at !== null) ||
    activeLastBatchStatus === "running";
  if (interrupted) {
    activeLastBatchFinishedAt = activeLastBatchFinishedAt ?? nowIso();
    activeLastBatchStatus = status === "error" ? "error" : "interrupted";
  }
  const state = buildRuntimeState(args, workers, activeStartedAt, {
    statusOverride: status,
    currentPid: null,
    controllerSessionId: null,
    activeRunSeed: null,
    lastRunSeed: activeRunSeedInfo ?? lastRunSeedInfo
  });
  return {
    ...state,
    pid: null,
    controller_session_id: null,
    started_at: null,
    last_heartbeat: null,
    current_batch_started_at: null,
    worker_count: 0,
    running_worker_count: 0,
    paused_worker_count: 0,
    stopped_worker_count: 0,
    errored_worker_count: 0,
    workers: [],
    active_run_seed: null,
    last_run_seed: activeRunSeedInfo ?? lastRunSeedInfo,
    requested_action: null
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
let activeRunSeedInfo: SimRunSeedInfo | null = null;
let lastRunSeedInfo: SimRunSeedInfo | null = null;
let activeLastBatchStartedAt: string | null = null;
let activeLastBatchFinishedAt: string | null = null;
let activeLastBatchStatus: string | null = null;
let activeLastShutdownReason: string | null = null;
let activeLastExitCode: number | null = null;
let activeLastExitSignal: string | null = null;
let activeTelemetryFailures = {
  telemetryDecisionFailures: 0,
  telemetryEventFailures: 0,
  telemetryFailuresTotal: 0,
  telemetryFailureByEndpoint: {} as Record<string, number>,
  telemetryFailureByKind: {} as Record<string, number>
};
let activeTelemetryBackoffUntil: string | null = null;

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function recordBatchTelemetryFailures(summary: Awaited<ReturnType<typeof runSelfPlayBatch>>): void {
  activeTelemetryFailures.telemetryDecisionFailures +=
    summary.telemetryDecisionFailures;
  activeTelemetryFailures.telemetryEventFailures += summary.telemetryEventFailures;
  activeTelemetryFailures.telemetryFailuresTotal += summary.telemetryFailuresTotal;
  mergeCounts(
    activeTelemetryFailures.telemetryFailureByEndpoint,
    summary.telemetryFailureByEndpoint
  );
  mergeCounts(
    activeTelemetryFailures.telemetryFailureByKind,
    summary.telemetryFailureByKind
  );
  activeTelemetryBackoffUntil =
    summary.telemetryBackoffUntil ?? activeTelemetryBackoffUntil;
}

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
    updateLastBatch({ status: "running", startedAt: batchStartedAt, finishedAt: null });
    appendLog(args, "batch_start", {
      worker_id: worker.worker_id,
      batch_index: batchIndex,
      games: args.gamesPerBatch,
      resolved_run_seed: activeRunSeedInfo?.resolved_run_seed ?? args.seed
    });
    writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));

    try {
      const summary = await runSelfPlayBatch({
        games: args.gamesPerBatch,
        baseSeed: deriveControllerBatchBaseSeed({
          resolvedRunSeed: activeRunSeedInfo?.resolved_run_seed ?? args.seed,
          derivationNamespace: activeRunSeedInfo?.derivation_namespace ?? args.seedNamespace,
          workerId: worker.worker_id,
          batchIndex
        }),
        defaultProvider: args.provider,
        seatProviders: args.seatProviders,
        telemetryEnabled: args.telemetryEnabled,
        serverFallbackEnabled: args.serverFallbackEnabled,
        strictTelemetry: args.strictTelemetry,
        traceBackend: args.traceBackend,
        telemetryMode: args.telemetryMode,
        telemetryMaxBytes: args.telemetryMaxBytes,
        telemetryTimeoutMs: args.telemetryTimeoutMs,
        telemetryRetryAttempts: args.telemetryRetryAttempts,
        telemetryRetryDelayMs: args.telemetryRetryDelayMs,
        telemetryBackoffMs: args.telemetryBackoffMs,
        ...(args.backendBaseUrl ? { backendBaseUrl: args.backendBaseUrl } : {}),
        quiet: args.quiet,
        progress: args.progress,
        workerId: worker.worker_id,
        controllerMode: true
      });
      worker.total_batches_completed += 1;
      worker.total_games_completed += summary.gamesPlayed;
      recordBatchTelemetryFailures(summary);
      worker.last_error = summary.errors > 0 ? `${summary.errors} game errors in batch` : null;
      worker.current_batch_started_at = null;
      worker.last_heartbeat = nowIso();
      updateLastBatch({
        status: summary.errors > 0 ? "completed_with_errors" : "completed",
        finishedAt: worker.last_heartbeat
      });
      appendLog(args, "batch_end", {
        worker_id: worker.worker_id,
        batch_index: batchIndex,
        summary
      });
    } catch (error) {
      worker.status = "error";
      worker.last_error = error instanceof Error ? error.message : String(error);
      worker.current_batch_started_at = null;
      worker.last_heartbeat = nowIso();
      activeLastShutdownReason = "error_exit";
      updateLastBatch({
        status: "error",
        finishedAt: worker.last_heartbeat
      });
      appendLog(args, "worker_error", {
        worker_id: worker.worker_id,
        batch_index: batchIndex,
        error: worker.last_error
      });
      writeJson(args.runtimeFile, buildRuntimeState(args, activeWorkers, activeStartedAt));
      return;
    }

    batchIndex += 1;
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

function installControllerSignalHandlers(args: ParsedArgs): () => void {
  const handler = (signal: NodeJS.Signals) => {
    activeLastShutdownReason = "terminated";
    activeLastExitSignal = signal;
    if (!fs.existsSync(args.stopFile)) {
      ensureParent(args.stopFile);
      fs.writeFileSync(args.stopFile, nowIso(), "utf8");
    }
  };

  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);

  return () => {
    process.off("SIGTERM", handler);
    process.off("SIGINT", handler);
  };
}

async function runForever(args: ParsedArgs): Promise<void> {
  const lockHandle = acquireLock(args);
  const cleanupSignals = installControllerSignalHandlers(args);
  activeStartedAt = nowIso();
  activeRunSeedInfo = resolveRunSeedInfo(args);
  lastRunSeedInfo = null;
  activeLastBatchStartedAt = null;
  activeLastBatchFinishedAt = null;
  activeLastBatchStatus = null;
  activeLastShutdownReason = null;
  activeLastExitCode = null;
  activeLastExitSignal = null;
  activeTelemetryFailures = {
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {},
    telemetryFailureByKind: {}
  };
  activeTelemetryBackoffUntil = null;
  activeWorkers = Array.from({ length: args.workerCount }, (_, index) =>
    createWorker(args, `worker-${String(index + 1).padStart(2, "0")}`)
  );

  appendLog(args, "controller_start", {
    pid: process.pid,
    controller_session_id: args.controllerSessionId,
    run_seed: activeRunSeedInfo,
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
    if (!activeLastShutdownReason) {
      activeLastShutdownReason = fs.existsSync(args.stopFile)
        ? "operator_stop"
        : activeWorkers.some((worker) => worker.status === "error")
          ? "error_exit"
          : "completed";
    }
    appendLog(args, "controller_stop", {
      pid: process.pid,
      reason: activeLastShutdownReason
    });
  } finally {
    clearInterval(heartbeat);
    cleanupSignals();
    lastRunSeedInfo = activeRunSeedInfo;
    const terminalStatus = activeWorkers.some((worker) => worker.status === "error")
      ? "error"
      : "stopped";
    writeJson(args.runtimeFile, buildTerminalRuntimeState(args, terminalStatus, activeWorkers));
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
      strictTelemetry: args.strictTelemetry,
      traceBackend: args.traceBackend,
      telemetryMode: args.telemetryMode,
      telemetryMaxBytes: args.telemetryMaxBytes,
      telemetryTimeoutMs: args.telemetryTimeoutMs,
      telemetryRetryAttempts: args.telemetryRetryAttempts,
      telemetryRetryDelayMs: args.telemetryRetryDelayMs,
      telemetryBackoffMs: args.telemetryBackoffMs,
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
