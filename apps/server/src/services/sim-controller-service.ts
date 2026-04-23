import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_BACKEND_BASE_URL,
  type DecisionMode,
  type SimControllerConfig,
  type SimControllerRequestPayload,
  type SimControllerResponse,
  type SimControllerRuntimeState,
  type SimControllerStatus,
  type SimRunSeedInfo,
  type SimWorkerRuntimeState
} from "@tichuml/shared";
import {
  generateEntropySeed
} from "../entropy/index.js";
import type { ServerConfig } from "../config/env.js";

const STALE_AFTER_SECONDS = 30;
const RUNTIME_SCHEMA_VERSION = 2;
const ACTIVE_CONTROLLER_STATUSES = new Set<SimControllerStatus>([
  "starting",
  "running",
  "pausing",
  "paused",
  "stopping"
]);

export interface SimControllerService {
  start(payload: SimControllerRequestPayload): Promise<SimControllerResponse>;
  pause(): Promise<SimControllerResponse>;
  continue(): Promise<SimControllerResponse>;
  stop(): Promise<SimControllerResponse>;
  status(): Promise<SimControllerResponse>;
  runOnce(payload: SimControllerRequestPayload): Promise<SimControllerResponse>;
}

type ControllerPaths = {
  runtimePath: string;
  lockPath: string;
  pausePath: string;
  stopPath: string;
  logPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isDecisionMode(value: unknown): value is DecisionMode {
  return (
    value === "local" ||
    value === "server_heuristic" ||
    value === "lightgbm_model"
  );
}

function isFreshHeartbeat(state: SimControllerRuntimeState): boolean {
  if (!state.last_heartbeat) {
    return false;
  }

  const ageMs = Date.now() - Date.parse(state.last_heartbeat);
  return Number.isFinite(ageMs) && ageMs <= STALE_AFTER_SECONDS * 1000;
}

function isPidAlive(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasLiveSessionState(state: SimControllerRuntimeState): boolean {
  return (
    ACTIVE_CONTROLLER_STATUSES.has(state.status) ||
    state.current_batch_started_at !== null ||
    state.active_run_seed !== null ||
    state.workers.length > 0 ||
    state.last_batch_status === "running"
  );
}

function normalizeBatchHistoryStatus(
  priorStatus: string | null,
  interrupted: boolean
): string | null {
  if (interrupted) {
    return "interrupted";
  }
  if (priorStatus === "running") {
    return "stopped";
  }
  return priorStatus;
}

type ResolvedControllerRun = {
  config: SimControllerConfig;
  controllerSessionId: string;
  runSeedInfo: SimRunSeedInfo;
};

type SimControllerServiceDeps = {
  generateRunEntropySeed?: typeof generateEntropySeed;
};

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readRecentLogs(logPath: string, limit = 30): string[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/u).slice(-limit);
}

function readLockPid(lockPath: string): number | null {
  const payload = readJsonFile<{ pid?: number }>(lockPath);
  return typeof payload?.pid === "number" && Number.isInteger(payload.pid)
    ? payload.pid
    : null;
}

function defaultWorkerState(status: SimControllerStatus): SimWorkerRuntimeState[] {
  return status === "stopped" || status === "completed"
    ? []
    : [
        {
          worker_id: "worker-01",
          controller_session_id: null,
          status: status === "paused" ? "paused" : "stopped",
          pid: null,
          current_batch_started_at: null,
          total_batches_completed: 0,
          total_games_completed: 0,
          last_heartbeat: null,
          last_error: null
        }
      ];
}

export class FileSimControllerService implements SimControllerService {
  private child: ChildProcess | null = null;
  private readonly paths: ControllerPaths;
  private readonly generateRunEntropySeed: typeof generateEntropySeed;

  constructor(
    private readonly config: ServerConfig,
    deps: SimControllerServiceDeps = {}
  ) {
    this.paths = {
      runtimePath: path.join(config.simControllerRuntimeDir, "state.json"),
      lockPath: path.join(config.simControllerRuntimeDir, "controller.lock"),
      pausePath: path.join(config.simControllerRuntimeDir, "pause"),
      stopPath: path.join(config.simControllerRuntimeDir, "stop"),
      logPath: path.join(config.simControllerRuntimeDir, "controller.ndjson")
    };
    this.generateRunEntropySeed =
      deps.generateRunEntropySeed ?? generateEntropySeed;
    this.reconcilePersistedState();
  }

  async start(payload: SimControllerRequestPayload): Promise<SimControllerResponse> {
    const warnings = this.reconcilePersistedState();
    const prior = this.readState();
    if (
      fs.existsSync(this.paths.lockPath) &&
      prior.status !== "stopped" &&
      prior.status !== "completed" &&
      prior.status !== "error"
    ) {
      return this.response({
        accepted: false,
        action: "sim.start",
        prior,
        current: prior,
        message: "Simulator controller is already running.",
        warnings
      });
    }

    this.clearControlFiles();
    const resolved = await this.resolveControllerRun(payload);
    this.writeState({
      ...this.createState("starting", resolved.config, {
        controllerSessionId: resolved.controllerSessionId,
        activeRunSeed: resolved.runSeedInfo,
        lastRunSeed: prior.last_run_seed
      }),
      requested_action: "start",
      warnings
    });
    this.spawnController(resolved);
    const next = this.readState();
    return this.response({
      accepted: true,
      action: "sim.start",
      prior,
      current: next,
      message: `Simulator controller starting with ${resolved.config.worker_count} worker(s).`,
      warnings
    });
  }

  async pause(): Promise<SimControllerResponse> {
    const prior = this.readState();
    if (prior.status === "paused" || prior.status === "pausing") {
      return this.response({
        accepted: true,
        action: "sim.pause",
        prior,
        current: prior,
        message: "Simulator controller is already paused or pausing.",
        warnings: []
      });
    }

    fs.mkdirSync(path.dirname(this.paths.pausePath), { recursive: true });
    fs.writeFileSync(this.paths.pausePath, nowIso(), "utf8");
    const current = {
      ...prior,
      status: "pausing" as const,
      requested_action: "pause",
      updated_at: nowIso()
    };
    this.writeState(current);
    return this.response({
      accepted: true,
      action: "sim.pause",
      prior,
      current,
      message: "Pause requested; workers will pause after the current safe batch boundary.",
      warnings: []
    });
  }

  async continue(): Promise<SimControllerResponse> {
    const prior = this.readState();
    if (fs.existsSync(this.paths.pausePath)) {
      fs.unlinkSync(this.paths.pausePath);
    }
    const current = {
      ...prior,
      status: "running" as const,
      requested_action: "continue",
      updated_at: nowIso()
    };
    this.writeState(current);
    return this.response({
      accepted: prior.status === "paused" || prior.status === "pausing",
      action: "sim.continue",
      prior,
      current,
      message:
        prior.status === "paused" || prior.status === "pausing"
          ? "Simulator controller resumed."
          : "Simulator controller was not paused; state left running for consistency.",
      warnings:
        prior.status === "paused" || prior.status === "pausing"
          ? []
          : ["Continue requested while simulator was not paused."]
    });
  }

  async stop(): Promise<SimControllerResponse> {
    const prior = this.readState();
    if (prior.status === "stopped") {
      return this.response({
        accepted: true,
        action: "sim.stop",
        prior,
        current: prior,
        message: "Simulator controller is already stopped.",
        warnings: []
      });
    }

    fs.mkdirSync(path.dirname(this.paths.stopPath), { recursive: true });
    fs.writeFileSync(this.paths.stopPath, nowIso(), "utf8");
    await this.terminateControllerProcess(prior.pid);
    this.clearControlFiles();
    if (fs.existsSync(this.paths.lockPath)) {
      fs.rmSync(this.paths.lockPath, { force: true });
    }
    const current = this.toStoppedState(prior, {
      last_shutdown_reason: "operator_stop"
    });
    this.writeState(current);
    return this.response({
      accepted: true,
      action: "sim.stop",
      prior,
      current,
      message: "Simulator controller stopped and worker state cleared.",
      warnings: []
    });
  }

  async status(): Promise<SimControllerResponse> {
    const warnings = this.reconcilePersistedState();
    const prior = this.readState();
    const current = this.readState();
    return this.response({
      accepted: true,
      action: "sim.status",
      prior,
      current,
      message: "Simulator controller status loaded.",
      warnings
    });
  }

  async runOnce(payload: SimControllerRequestPayload): Promise<SimControllerResponse> {
    const warnings = this.reconcilePersistedState();
    const prior = this.readState();
    if (fs.existsSync(this.paths.lockPath)) {
      return this.response({
        accepted: false,
        action: "sim.run_once",
        prior,
        current: this.readState(),
        message: "Cannot run once while simulator controller lock is held.",
        warnings
      });
    }

    const resolved = await this.resolveControllerRun({
      ...payload,
      games_per_batch: payload.games ?? payload.games_per_batch ?? 1,
      worker_count: 1
    });
    const running = this.createState("running", resolved.config, {
      controllerSessionId: resolved.controllerSessionId,
      activeRunSeed: resolved.runSeedInfo,
      lastRunSeed: prior.last_run_seed
    });
    running.requested_action = "run-once";
    this.writeState(running);
    const exitCode = await this.runOneShot(resolved);
    const current = {
      ...this.toStoppedState(running, {
        status: exitCode === 0 ? "completed" : "error",
        last_batch_finished_at: nowIso(),
        last_batch_status: exitCode === 0 ? "completed" : "error",
        total_batches_completed: exitCode === 0 ? 1 : 0,
        total_games_completed: exitCode === 0 ? resolved.config.games_per_batch : 0,
        last_shutdown_reason: exitCode === 0 ? "run_once_completed" : "run_once_failed",
        last_exit_code: exitCode,
        last_error:
          exitCode === 0
            ? null
            : `Run-once simulator exited with code ${exitCode}.`
      }),
      requested_action: "run-once"
    };
    this.writeState(current);
    return this.response({
      accepted: exitCode === 0,
      action: "sim.run_once",
      prior,
      current,
      message:
        exitCode === 0
          ? "Run-once completed successfully."
          : `Run-once failed with exit code ${exitCode}.`,
      warnings
    });
  }

  private async runOneShot(resolved: ResolvedControllerRun): Promise<number> {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = [
      "run",
      "sim",
      "--",
      "--games",
      String(resolved.config.games_per_batch),
      "--provider",
      resolved.config.provider,
      "--seed",
      resolved.runSeedInfo.resolved_run_seed,
      "--telemetry",
      String(resolved.config.telemetry_enabled),
      "--server-fallback",
      String(resolved.config.server_fallback_enabled),
      "--strict-telemetry",
      String(resolved.config.strict_telemetry),
      "--trace-backend",
      String(resolved.config.trace_backend),
      "--telemetry-mode",
      resolved.config.telemetry_mode,
      "--telemetry-max-bytes",
      String(resolved.config.telemetry_max_bytes),
      "--telemetry-timeout-ms",
      String(resolved.config.telemetry_timeout_ms),
      "--telemetry-retry-attempts",
      String(resolved.config.telemetry_retry_attempts),
      "--telemetry-retry-delay-ms",
      String(resolved.config.telemetry_retry_delay_ms),
      "--telemetry-backoff-ms",
      String(resolved.config.telemetry_backoff_ms),
      "--backend-url",
      resolved.config.backend_url
    ];
    for (const [seat, provider] of Object.entries(resolved.config.seat_providers)) {
      args.push("--seat-provider", `${seat}=${provider}`);
    }
    if (resolved.config.quiet) {
      args.push("--quiet");
    }
    if (resolved.config.progress) {
      args.push("--progress");
    }

    fs.mkdirSync(path.dirname(this.paths.logPath), { recursive: true });
    const logFd = fs.openSync(this.paths.logPath, "a");
    return new Promise((resolve) => {
      const child = spawn(npmCommand, args, {
        cwd: this.config.repoRoot,
        stdio: ["ignore", logFd, logFd]
      });
      child.once("exit", (code) => {
        fs.closeSync(logFd);
        resolve(code ?? 1);
      });
    });
  }

  private spawnController(resolved: ResolvedControllerRun): void {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = [
      "run",
      "sim",
      "--",
      "--forever",
      "--provider",
      resolved.config.provider,
      "--games-per-batch",
      String(resolved.config.games_per_batch),
      "--sleep-seconds",
      String(resolved.config.sleep_seconds),
      "--worker-count",
      String(resolved.config.worker_count),
      "--seed",
      resolved.runSeedInfo.resolved_run_seed,
      "--seed-prefix",
      resolved.config.seed_namespace,
      "--telemetry",
      String(resolved.config.telemetry_enabled),
      "--server-fallback",
      String(resolved.config.server_fallback_enabled),
      "--strict-telemetry",
      String(resolved.config.strict_telemetry),
      "--trace-backend",
      String(resolved.config.trace_backend),
      "--telemetry-mode",
      resolved.config.telemetry_mode,
      "--telemetry-max-bytes",
      String(resolved.config.telemetry_max_bytes),
      "--telemetry-timeout-ms",
      String(resolved.config.telemetry_timeout_ms),
      "--telemetry-retry-attempts",
      String(resolved.config.telemetry_retry_attempts),
      "--telemetry-retry-delay-ms",
      String(resolved.config.telemetry_retry_delay_ms),
      "--telemetry-backoff-ms",
      String(resolved.config.telemetry_backoff_ms),
      "--backend-url",
      resolved.config.backend_url,
      "--runtime-file",
      this.paths.runtimePath,
      "--lock-file",
      this.paths.lockPath,
      "--pause-file",
      this.paths.pausePath,
      "--stop-file",
      this.paths.stopPath,
      "--log-file",
      this.paths.logPath
    ];
    for (const [seat, provider] of Object.entries(resolved.config.seat_providers)) {
      args.push("--seat-provider", `${seat}=${provider}`);
    }
    if (resolved.config.quiet) {
      args.push("--quiet");
    }
    if (resolved.config.progress) {
      args.push("--progress");
    }

    fs.mkdirSync(path.dirname(this.paths.logPath), { recursive: true });
    const logFd = fs.openSync(this.paths.logPath, "a");
    this.child = spawn(npmCommand, args, {
      cwd: this.config.repoRoot,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        BACKEND_BASE_URL: resolved.config.backend_url,
        TELEMETRY_POST_TIMEOUT_MS: String(resolved.config.telemetry_timeout_ms),
        TELEMETRY_RETRY_ATTEMPTS: String(resolved.config.telemetry_retry_attempts),
        TELEMETRY_RETRY_DELAY_MS: String(resolved.config.telemetry_retry_delay_ms),
        TELEMETRY_BACKOFF_MS: String(resolved.config.telemetry_backoff_ms),
        SIM_CONTROLLER_SESSION_ID: resolved.controllerSessionId,
        SIM_RUN_SEED_INFO_JSON: JSON.stringify(resolved.runSeedInfo)
      }
    });

    this.child.once("exit", (code, signal) => {
      fs.closeSync(logFd);
      const state = this.readState();
      const interrupted = signal === "SIGTERM" || code === 143;
      const errored = !interrupted && code !== 0 && code !== null;
      this.writeState(
        this.toStoppedState(state, {
          last_shutdown_reason: interrupted
            ? "terminated"
            : errored
              ? "error_exit"
              : "completed",
          last_exit_code: code ?? null,
          last_exit_signal: signal ?? null,
          last_error: errored
            ? `Simulator exited with code ${code} signal ${signal ?? ""}`.trim()
            : state.last_error
        })
      );
      this.child = null;
    });
  }

  private clearControlFiles(): void {
    for (const filePath of [this.paths.pausePath, this.paths.stopPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  private reconcilePersistedState(): string[] {
    const stored = readJsonFile<SimControllerRuntimeState>(this.paths.runtimePath);
    const warnings: string[] = [];
    const lockPid = readLockPid(this.paths.lockPath);
    const lockAlive = isPidAlive(lockPid);

    if (!stored) {
      if (fs.existsSync(this.paths.lockPath) && !lockAlive) {
        fs.rmSync(this.paths.lockPath, { force: true });
      }
      return warnings;
    }

    let current = this.normalizeState(stored);
    let changed = false;

    if (fs.existsSync(this.paths.lockPath) && !lockAlive) {
      fs.rmSync(this.paths.lockPath, { force: true });
      warnings.push(
        "Recovered stale simulator lock after detecting a dead controller process."
      );
      changed = true;
    }

    const controllerAlive = isPidAlive(current.pid);
    const heartbeatExpired =
      ACTIVE_CONTROLLER_STATUSES.has(current.status) &&
      current.last_heartbeat !== null &&
      !isFreshHeartbeat(current);
    const staleWorkerSession =
      current.controller_session_id === null ||
      current.workers.some(
        (worker) => worker.controller_session_id !== current.controller_session_id
      );

    if (
      hasLiveSessionState(current) &&
      (!controllerAlive || heartbeatExpired || staleWorkerSession)
    ) {
      const reason = heartbeatExpired
        ? "Recovered stale simulator session after heartbeat timeout."
        : "Recovered stale simulator session from dead persisted controller state.";
      warnings.push(reason);
      current = {
        ...this.toStoppedState(current, {
          last_shutdown_reason: "stale_recovery",
          last_batch_status: normalizeBatchHistoryStatus(
            current.last_batch_status,
            current.current_batch_started_at !== null ||
              current.last_batch_status === "running"
          ),
          last_batch_finished_at:
            current.current_batch_started_at !== null
              ? nowIso()
              : current.last_batch_finished_at
        }),
        warnings: [...current.warnings, reason]
      };
      changed = true;
    }

    if (changed) {
      this.writeState(current);
    }

    return warnings;
  }

  private readState(): SimControllerRuntimeState {
    const state = readJsonFile<SimControllerRuntimeState>(this.paths.runtimePath);
    const current = state ?? this.createState("stopped", this.resolveConfig({}));
    const heartbeatStale =
      ACTIVE_CONTROLLER_STATUSES.has(current.status) && current.last_heartbeat
        ? !isFreshHeartbeat(current)
        : false;
    return this.normalizeState({
      ...current,
      heartbeat_stale: heartbeatStale,
      recent_logs: readRecentLogs(this.paths.logPath)
    });
  }

  private writeState(state: SimControllerRuntimeState): void {
    writeJsonFile(this.paths.runtimePath, this.normalizeState(state));
  }

  private createState(
    status: SimControllerStatus,
    config: SimControllerConfig,
    options: {
      controllerSessionId?: string;
      activeRunSeed?: SimRunSeedInfo | null;
      lastRunSeed?: SimRunSeedInfo | null;
    } = {}
  ): SimControllerRuntimeState {
    const timestamp = nowIso();
    const workers =
      status === "starting"
        ? Array.from({ length: config.worker_count }, (_, index) => ({
            worker_id: `worker-${String(index + 1).padStart(2, "0")}`,
            controller_session_id: options.controllerSessionId ?? null,
            status: "starting" as const,
            pid: null,
            current_batch_started_at: null,
            total_batches_completed: 0,
            total_games_completed: 0,
            last_heartbeat: timestamp,
            last_error: null
          }))
        : defaultWorkerState(status);
    return {
      runtime_schema_version: RUNTIME_SCHEMA_VERSION,
      status,
      pid: this.child?.pid ?? null,
      controller_id: "sim-controller",
      controller_session_id: options.controllerSessionId ?? null,
      started_at: status === "stopped" ? null : timestamp,
      updated_at: timestamp,
      last_heartbeat: status === "stopped" ? null : timestamp,
      heartbeat_stale: false,
      heartbeat_stale_after_seconds: STALE_AFTER_SECONDS,
      requested_action: null,
      current_batch_started_at: null,
      last_batch_started_at: null,
      last_batch_finished_at: null,
      last_batch_size: config.games_per_batch,
      last_batch_status: null,
      total_batches_completed: 0,
      total_games_completed: 0,
      total_errors: 0,
      last_error: null,
      last_shutdown_reason: null,
      last_exit_code: null,
      last_exit_signal: null,
      active_run_seed: options.activeRunSeed ?? null,
      last_run_seed: options.lastRunSeed ?? null,
      telemetry_decision_failures: 0,
      telemetry_event_failures: 0,
      telemetry_failures_total: 0,
      telemetry_failure_by_endpoint: {},
      telemetry_failure_by_kind: {},
      telemetry_backoff_until: null,
      worker_count: config.worker_count,
      running_worker_count: 0,
      paused_worker_count: status === "paused" ? workers.length : 0,
      stopped_worker_count: status === "stopped" ? workers.length : 0,
      errored_worker_count: status === "error" ? workers.length : 0,
      config,
      workers,
      log_path: this.paths.logPath,
      runtime_path: this.paths.runtimePath,
      lock_path: this.paths.lockPath,
      pause_path: this.paths.pausePath,
      stop_path: this.paths.stopPath,
      warnings: [],
      recent_logs: []
    };
  }

  private async resolveControllerRun(
    payload: SimControllerRequestPayload
  ): Promise<ResolvedControllerRun> {
    const config = this.resolveConfig(payload);
    return {
      config,
      controllerSessionId: randomUUID(),
      runSeedInfo: await this.resolveRunSeed(config, payload)
    };
  }

  private async resolveRunSeed(
    config: SimControllerConfig,
    payload: SimControllerRequestPayload
  ): Promise<SimRunSeedInfo> {
    const manualOverrideEnabled =
      payload.manual_seed_override_enabled === true ||
      (payload.manual_seed_override_enabled !== false &&
        typeof payload.seed === "string" &&
        payload.seed.trim().length > 0);
    const manualOverrideSeed =
      typeof payload.manual_seed_override === "string" &&
      payload.manual_seed_override.trim().length > 0
        ? payload.manual_seed_override.trim()
        : typeof payload.seed === "string" && payload.seed.trim().length > 0
          ? payload.seed.trim()
          : null;

    if (manualOverrideEnabled && manualOverrideSeed) {
      return {
        mode: "manual_override",
        resolved_run_seed: manualOverrideSeed,
        derivation_namespace: config.seed_namespace,
        manual_override_enabled: true,
        manual_override_seed: manualOverrideSeed,
        generated_at: nowIso(),
        entropy_game_id: null,
        audit_hash_hex: null,
        primary_provider: "manual_override",
        local_fallback_used: null,
        source_summary: null
      };
    }

    const entropy = await this.generateRunEntropySeed({ roundIndex: 0 });
    return {
      mode: "automatic_entropy",
      resolved_run_seed: entropy.shuffleSeedHex,
      derivation_namespace: config.seed_namespace,
      manual_override_enabled: false,
      manual_override_seed: null,
      generated_at: nowIso(),
      entropy_game_id: entropy.gameId,
      audit_hash_hex: entropy.auditHashHex,
      primary_provider: entropy.provenance.primaryProvider,
      local_fallback_used: entropy.provenance.localFallbackUsed,
      source_summary: entropy.sourceSummary
    };
  }

  private resolveConfig(payload: SimControllerRequestPayload): SimControllerConfig {
    const provider = isDecisionMode(payload.provider)
      ? payload.provider
      : this.config.simDefaultProvider;
    const gamesPerBatch = Math.max(
      1,
      Number(
        payload.games_per_batch ??
          payload.games ??
          this.config.simDefaultGamesPerBatch
      )
    );
    const workerCount = Math.max(
      1,
      Number(
        payload.worker_count ??
          payload.sim_threads ??
          this.config.simDefaultWorkerCount
      )
    );

    return {
      provider,
      games_per_batch: gamesPerBatch,
      telemetry_enabled:
        typeof payload.telemetry_enabled === "boolean"
          ? payload.telemetry_enabled
          : typeof payload.telemetry === "boolean"
            ? payload.telemetry
            : true,
      server_fallback_enabled:
        typeof payload.server_fallback_enabled === "boolean"
          ? payload.server_fallback_enabled
          : typeof payload.server_fallback === "boolean"
            ? payload.server_fallback
            : true,
      strict_telemetry: payload.strict_telemetry === true,
      trace_backend: payload.trace_backend === true,
      telemetry_mode:
        payload.telemetry_mode === "full" || payload.telemetry_mode === "minimal"
          ? payload.telemetry_mode
          : this.config.telemetryMode,
      telemetry_max_bytes: Math.max(
        1,
        Number(payload.telemetry_max_bytes ?? this.config.telemetryMaxPostBytes)
      ),
      telemetry_timeout_ms: Math.max(
        1,
        Number(payload.telemetry_timeout_ms ?? this.config.telemetryPostTimeoutMs)
      ),
      telemetry_retry_attempts: Math.max(
        1,
        Number(
          payload.telemetry_retry_attempts ?? this.config.telemetryRetryAttempts
        )
      ),
      telemetry_retry_delay_ms: Math.max(
        1,
        Number(
          payload.telemetry_retry_delay_ms ?? this.config.telemetryRetryDelayMs
        )
      ),
      telemetry_backoff_ms: Math.max(
        1,
        Number(payload.telemetry_backoff_ms ?? this.config.telemetryBackoffMs)
      ),
      backend_url:
        typeof payload.backend_url === "string" && payload.backend_url.length > 0
          ? payload.backend_url
          : this.config.simDefaultBackendUrl ||
            this.config.backendBaseUrl ||
            DEFAULT_BACKEND_BASE_URL,
      seed_namespace:
        typeof payload.seed_namespace === "string" &&
        payload.seed_namespace.length > 0
          ? payload.seed_namespace
          : typeof payload.seed_prefix === "string" &&
              payload.seed_prefix.length > 0
            ? payload.seed_prefix
            : "controller",
      manual_seed_override_enabled:
        payload.manual_seed_override_enabled === true ||
        (payload.manual_seed_override_enabled !== false &&
          typeof payload.seed === "string" &&
          payload.seed.trim().length > 0),
      manual_seed_override:
        typeof payload.manual_seed_override === "string" &&
        payload.manual_seed_override.length > 0
          ? payload.manual_seed_override
          : typeof payload.seed === "string" && payload.seed.length > 0
            ? payload.seed
            : "",
      seed_prefix:
        typeof payload.seed_namespace === "string" &&
        payload.seed_namespace.length > 0
          ? payload.seed_namespace
          : typeof payload.seed_prefix === "string" &&
              payload.seed_prefix.length > 0
            ? payload.seed_prefix
            : "controller",
      sleep_seconds: Math.max(0, Number(payload.sleep_seconds ?? 5)),
      worker_count: workerCount,
      quiet: payload.quiet === true,
      progress: payload.progress !== false,
      seat_providers: Object.fromEntries(
        Object.entries(payload.seat_providers ?? {}).filter((entry) =>
          isDecisionMode(entry[1])
        )
      ) as Record<string, DecisionMode>
    };
  }

  private response(config: {
    accepted: boolean;
    action: string;
    prior: SimControllerRuntimeState;
    current: SimControllerRuntimeState;
    message: string;
    warnings: string[];
  }): SimControllerResponse {
    return {
      accepted: config.accepted,
      action: config.action,
      prior_status: config.prior.status,
      current_status: config.current.status,
      message: config.message,
      runtime_state: config.current,
      warnings: config.warnings
    };
  }

  private normalizeState(
    state: SimControllerRuntimeState
  ): SimControllerRuntimeState {
    const normalizedConfig: SimControllerConfig = {
      ...state.config,
      seed_namespace: state.config.seed_namespace ?? state.config.seed_prefix ?? "controller",
      manual_seed_override_enabled:
        state.config.manual_seed_override_enabled ?? false,
      manual_seed_override: state.config.manual_seed_override ?? ""
    };
    const workersById = new Map<string, SimWorkerRuntimeState>();
    for (const worker of state.workers) {
      workersById.set(worker.worker_id, {
        ...worker,
        controller_session_id: worker.controller_session_id ?? null
      });
    }
    const sessionWorkers = [...workersById.values()].filter(
      (worker) =>
        state.controller_session_id === null
          ? worker.controller_session_id === null
          :
        worker.controller_session_id === state.controller_session_id
    );
    const workers = ACTIVE_CONTROLLER_STATUSES.has(state.status)
      ? sessionWorkers
      : [];
    return {
      ...state,
      runtime_schema_version: state.runtime_schema_version ?? RUNTIME_SCHEMA_VERSION,
      controller_session_id: state.controller_session_id ?? null,
      pid: state.status === "stopped" ? null : state.pid,
      config: normalizedConfig,
      workers,
      last_shutdown_reason: state.last_shutdown_reason ?? null,
      last_exit_code: state.last_exit_code ?? null,
      last_exit_signal: state.last_exit_signal ?? null,
      active_run_seed: state.active_run_seed ?? null,
      last_run_seed: state.last_run_seed ?? null,
      telemetry_decision_failures: state.telemetry_decision_failures ?? 0,
      telemetry_event_failures: state.telemetry_event_failures ?? 0,
      telemetry_failures_total: state.telemetry_failures_total ?? 0,
      telemetry_failure_by_endpoint: state.telemetry_failure_by_endpoint ?? {},
      telemetry_failure_by_kind: state.telemetry_failure_by_kind ?? {},
      telemetry_backoff_until: state.telemetry_backoff_until ?? null,
      worker_count: workers.length,
      running_worker_count: workers.filter((worker) => worker.status === "running")
        .length,
      paused_worker_count: workers.filter((worker) => worker.status === "paused")
        .length,
      stopped_worker_count: workers.filter((worker) => worker.status === "stopped")
        .length,
      errored_worker_count: workers.filter((worker) => worker.status === "error")
        .length
    };
  }

  private toStoppedState(
    prior: SimControllerRuntimeState,
    overrides: Partial<SimControllerRuntimeState> = {}
  ): SimControllerRuntimeState {
    const interrupted =
      prior.current_batch_started_at !== null || prior.last_batch_status === "running";
    return {
      ...prior,
      status: "stopped",
      pid: null,
      controller_session_id: null,
      started_at: null,
      last_heartbeat: null,
      heartbeat_stale: false,
      requested_action: null,
      current_batch_started_at: null,
      updated_at: nowIso(),
      last_batch_finished_at:
        interrupted && prior.last_batch_finished_at === null
          ? nowIso()
          : prior.last_batch_finished_at,
      last_batch_status: normalizeBatchHistoryStatus(
        prior.last_batch_status,
        interrupted
      ),
      active_run_seed: null,
      last_run_seed: prior.active_run_seed ?? prior.last_run_seed,
      workers: [],
      worker_count: 0,
      running_worker_count: 0,
      paused_worker_count: 0,
      stopped_worker_count: 0,
      errored_worker_count: 0,
      telemetry_decision_failures: prior.telemetry_decision_failures ?? 0,
      telemetry_event_failures: prior.telemetry_event_failures ?? 0,
      telemetry_failures_total: prior.telemetry_failures_total ?? 0,
      telemetry_failure_by_endpoint: prior.telemetry_failure_by_endpoint ?? {},
      telemetry_failure_by_kind: prior.telemetry_failure_by_kind ?? {},
      telemetry_backoff_until: prior.telemetry_backoff_until ?? null,
      ...overrides
    };
  }

  private async terminateControllerProcess(pid: number | null): Promise<void> {
    const child = this.child;
    if (child?.pid) {
      await terminateProcessTree(child.pid);
      this.child = null;
      return;
    }
    if (pid) {
      await terminateProcessTree(pid);
    }
  }
}

function terminateProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => resolve());
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The controller may already have exited after seeing the stop marker.
    }
    resolve();
  });
}
