import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_BACKEND_BASE_URL,
  type DecisionMode,
  type SimControllerConfig,
  type SimControllerRequestPayload,
  type SimControllerResponse,
  type SimControllerRuntimeState,
  type SimControllerStatus,
  type SimWorkerRuntimeState
} from "@tichuml/shared";
import type { ServerConfig } from "../config/env.js";

const STALE_AFTER_SECONDS = 30;

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

function defaultWorkerState(status: SimControllerStatus): SimWorkerRuntimeState[] {
  return status === "stopped"
    ? []
    : [
        {
          worker_id: "worker-01",
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

  constructor(private readonly config: ServerConfig) {
    this.paths = {
      runtimePath: path.join(config.simControllerRuntimeDir, "state.json"),
      lockPath: path.join(config.simControllerRuntimeDir, "controller.lock"),
      pausePath: path.join(config.simControllerRuntimeDir, "pause"),
      stopPath: path.join(config.simControllerRuntimeDir, "stop"),
      logPath: path.join(config.simControllerRuntimeDir, "controller.ndjson")
    };
  }

  async start(payload: SimControllerRequestPayload): Promise<SimControllerResponse> {
    const prior = this.readState();
    const warnings = this.recoverStaleLock(prior);
    const current = this.readState();
    if (
      fs.existsSync(this.paths.lockPath) &&
      current.status !== "stopped" &&
      current.status !== "error"
    ) {
      return this.response({
        accepted: false,
        action: "sim.start",
        prior,
        current,
        message: "Simulator controller is already running.",
        warnings
      });
    }

    this.clearControlFiles();
    const resolved = this.resolveConfig(payload);
    this.writeState({
      ...this.createState("starting", resolved),
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
      message: `Simulator controller starting with ${resolved.worker_count} worker(s).`,
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
    const current = { ...prior, status: "pausing" as const, requested_action: "pause", updated_at: nowIso() };
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
    const current = { ...prior, status: "running" as const, requested_action: "continue", updated_at: nowIso() };
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
    const current = { ...prior, status: "stopping" as const, requested_action: "stop", updated_at: nowIso() };
    this.writeState(current);
    return this.response({
      accepted: true,
      action: "sim.stop",
      prior,
      current,
      message: "Stop requested; workers will stop after the current safe batch boundary.",
      warnings: []
    });
  }

  async status(): Promise<SimControllerResponse> {
    const prior = this.readState();
    const warnings = this.recoverStaleLock(prior);
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
    const prior = this.readState();
    const warnings = this.recoverStaleLock(prior);
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

    const resolved = this.resolveConfig({
      ...payload,
      games_per_batch: payload.games ?? payload.games_per_batch ?? 1,
      worker_count: 1
    });
    const running = this.createState("running", resolved);
    running.requested_action = "run-once";
    this.writeState(running);
    const exitCode = await this.runOneShot(resolved);
    const current = this.createState(exitCode === 0 ? "completed" : "error", resolved);
    current.requested_action = "run-once";
    current.last_error =
      exitCode === 0 ? null : `Run-once simulator exited with code ${exitCode}.`;
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

  private async runOneShot(resolved: SimControllerConfig): Promise<number> {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = [
      "run",
      "sim",
      "--",
      "--games",
      String(resolved.games_per_batch),
      "--provider",
      resolved.provider,
      "--seed",
      resolved.seed_prefix,
      "--telemetry",
      String(resolved.telemetry_enabled),
      "--server-fallback",
      String(resolved.server_fallback_enabled),
      "--strict-telemetry",
      String(resolved.strict_telemetry),
      "--trace-backend",
      String(resolved.trace_backend),
      "--backend-url",
      resolved.backend_url
    ];
    for (const [seat, provider] of Object.entries(resolved.seat_providers)) {
      args.push("--seat-provider", `${seat}=${provider}`);
    }
    if (resolved.quiet) {
      args.push("--quiet");
    }
    if (resolved.progress) {
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

  private spawnController(resolved: SimControllerConfig): void {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = [
      "run",
      "sim",
      "--",
      "--forever",
      "--provider",
      resolved.provider,
      "--games-per-batch",
      String(resolved.games_per_batch),
      "--sleep-seconds",
      String(resolved.sleep_seconds),
      "--worker-count",
      String(resolved.worker_count),
      "--seed-prefix",
      resolved.seed_prefix,
      "--telemetry",
      String(resolved.telemetry_enabled),
      "--server-fallback",
      String(resolved.server_fallback_enabled),
      "--strict-telemetry",
      String(resolved.strict_telemetry),
      "--trace-backend",
      String(resolved.trace_backend),
      "--backend-url",
      resolved.backend_url,
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
    for (const [seat, provider] of Object.entries(resolved.seat_providers)) {
      args.push("--seat-provider", `${seat}=${provider}`);
    }
    if (resolved.quiet) {
      args.push("--quiet");
    }
    if (resolved.progress) {
      args.push("--progress");
    }

    fs.mkdirSync(path.dirname(this.paths.logPath), { recursive: true });
    const logFd = fs.openSync(this.paths.logPath, "a");
    this.child = spawn(npmCommand, args, {
      cwd: this.config.repoRoot,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        BACKEND_BASE_URL: resolved.backend_url
      }
    });

    this.child.once("exit", (code, signal) => {
      fs.closeSync(logFd);
      const state = this.readState();
      const errored = code !== 0 && code !== null;
      this.writeState({
        ...state,
        status: errored ? "error" : "stopped",
        pid: null,
        requested_action: null,
        updated_at: nowIso(),
        last_error: errored ? `Simulator exited with code ${code} signal ${signal ?? ""}` : state.last_error
      });
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

  private recoverStaleLock(state: SimControllerRuntimeState): string[] {
    if (!fs.existsSync(this.paths.lockPath)) {
      return [];
    }
    if (isFreshHeartbeat(state)) {
      return [];
    }

    fs.unlinkSync(this.paths.lockPath);
    const warning = "Recovered stale simulator lock after heartbeat timeout.";
    this.writeState({
      ...state,
      status: "error",
      heartbeat_stale: true,
      warnings: [...state.warnings, warning],
      last_error: state.last_error ?? warning,
      updated_at: nowIso()
    });
    return [warning];
  }

  private readState(): SimControllerRuntimeState {
    const state = readJsonFile<SimControllerRuntimeState>(this.paths.runtimePath);
    const current = state ?? this.createState("stopped", this.resolveConfig({}));
    const heartbeatStale = current.last_heartbeat ? !isFreshHeartbeat(current) : false;
    return {
      ...current,
      heartbeat_stale: heartbeatStale,
      recent_logs: readRecentLogs(this.paths.logPath)
    };
  }

  private writeState(state: SimControllerRuntimeState): void {
    writeJsonFile(this.paths.runtimePath, state);
  }

  private createState(
    status: SimControllerStatus,
    config: SimControllerConfig
  ): SimControllerRuntimeState {
    const workers =
      status === "starting"
        ? Array.from({ length: config.worker_count }, (_, index) => ({
            worker_id: `worker-${String(index + 1).padStart(2, "0")}`,
            status: "starting" as const,
            pid: null,
            current_batch_started_at: null,
            total_batches_completed: 0,
            total_games_completed: 0,
            last_heartbeat: nowIso(),
            last_error: null
          }))
        : defaultWorkerState(status);
    return {
      status,
      pid: this.child?.pid ?? null,
      controller_id: "sim-controller",
      started_at: status === "stopped" ? null : nowIso(),
      updated_at: nowIso(),
      last_heartbeat: status === "stopped" ? null : nowIso(),
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

  private resolveConfig(payload: SimControllerRequestPayload): SimControllerConfig {
    const provider = isDecisionMode(payload.provider) ? payload.provider : "local";
    const gamesPerBatch = Math.max(
      1,
      Number(payload.games_per_batch ?? payload.games ?? 1)
    );
    const workerCount = Math.max(
      1,
      Number(payload.worker_count ?? payload.sim_threads ?? 1)
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
      backend_url:
        typeof payload.backend_url === "string" && payload.backend_url.length > 0
          ? payload.backend_url
          : this.config.backendBaseUrl || DEFAULT_BACKEND_BASE_URL,
      seed_prefix:
        typeof payload.seed_prefix === "string" && payload.seed_prefix.length > 0
          ? payload.seed_prefix
          : typeof payload.seed === "string" && payload.seed.length > 0
            ? payload.seed
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
}
