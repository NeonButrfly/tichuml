import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "../config/env.js";
import {
  detectSystemIps,
  formatEnvValue,
  parseEnvText,
  writeEnvText,
  writeFileAtomic
} from "../config/env-file.js";

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

export type RuntimeComponentStatus = {
  ok: boolean | null;
  label: string;
  detail: string;
};

export type RuntimeAdminStatus = {
  checked_at: string;
  admin_safety: {
    locked: boolean;
    blocked_actions: string[];
  };
  backend: {
    running: boolean;
    pid: number | null;
    uptime_seconds: number | null;
    port_listeners: number[];
    pid_file: string;
    log_file: string;
    runtime_dir: string;
  };
  endpoints: Record<string, RuntimeComponentStatus>;
  postgres: {
    container_running: boolean | null;
    ready: boolean | null;
    detail: string;
  };
  git: {
    branch: string | null;
    local_commit: string | null;
    remote_commit: string | null;
    ahead: number | null;
    behind: number | null;
    dirty: boolean | null;
  };
  tools: Record<string, RuntimeComponentStatus>;
  runtime: {
    repo_root: string;
    backend_public_url: string;
    backend_local_url: string;
    backend_base_url: string;
    detected_ethernet: string | null;
    detected_wireless: string | null;
    detected_default: string;
    detected_primary_ip: string | null;
    detected_system_ips: string[];
    backend_host_ip_override: string | null;
    sim_controller_runtime_dir: string;
    update_status_file: string;
    update_status_json_file: string;
    action_log_file: string;
    web_dist_exists: boolean;
    node_modules_exists: boolean;
    python_venv_exists: boolean;
    ml_requirements_installed: boolean;
    lightgbm_model_exists: boolean;
    config_pending_restart: boolean;
    runtime_differs_from_disk_config: boolean;
  };
  recent_logs: {
    backend: string[];
    actions: string[];
  };
};

export type RuntimeConfigEntry = {
  key: string;
  label: string;
  category: string;
  type: "string" | "number" | "boolean" | "action" | "derived";
  editable: boolean;
  requiresRestart: boolean;
  description: string;
  savedValue: string;
  effectiveValue: string;
  detectedValue: string | undefined;
  overrideEnabled: boolean;
  overrideValue: string;
  value: string;
  effective_value: string;
  detected_value: string | undefined;
  overridden: boolean;
  restart_required: boolean;
  input: "text" | "number" | "boolean";
};

export type RuntimeConfigPayload = {
  env_file: string;
  effective: Record<string, string>;
  detected: {
    detectedEthernet: string | null;
    detectedWireless: string | null;
    detectedDefault: string;
    primary_ip: string | null;
    system_ips: string[];
  };
  entries: RuntimeConfigEntry[];
  pending_restart: boolean;
  runtime_differs_from_disk_config: boolean;
};

export type RuntimeConfigSaveResult = {
  accepted: boolean;
  message: string;
  changed_keys: string[];
  restart_required: boolean;
  config: RuntimeConfigPayload;
};

export type RuntimeActionResult = {
  accepted: boolean;
  action: string;
  message: string;
  log_file: string;
  started_at: string;
};

export type RuntimeSafetyResult = {
  accepted: boolean;
  locked: boolean;
  message: string;
  config: RuntimeConfigPayload;
};

export interface RuntimeAdminService {
  status(): Promise<RuntimeAdminStatus>;
  readConfig(): Promise<RuntimeConfigPayload>;
  saveConfig(updates: Record<string, unknown>): Promise<RuntimeConfigSaveResult>;
  setAdminSafetyLocked(locked: boolean): Promise<RuntimeSafetyResult>;
  isAdminSafetyLocked(): Promise<boolean>;
  runAction(action: string): Promise<RuntimeActionResult>;
}

const BLOCKED_WHEN_LOCKED = [
  "start_backend",
  "stop_backend",
  "restart_backend",
  "full_restart",
  "start_postgres",
  "stop_postgres",
  "update_repo",
  "clear_db",
  "apply_config_restart"
];

const CONFIG_SCHEMA: Array<{
  key: string;
  label: string;
  category: string;
  type: "string" | "number" | "boolean" | "derived";
  restart_required: boolean;
  description: string;
  automated?: boolean;
  validate?: (value: string) => string | null;
}> = [
  { key: "PORT", label: "Port", category: "Network", type: "number", restart_required: true, description: "Backend HTTP port.", validate: validatePort },
  { key: "HOST", label: "Bind host", category: "Network", type: "string", restart_required: true, description: "Backend listen host." },
  { key: "BACKEND_HOST_IP", label: "Host IP", category: "Network", type: "string", restart_required: false, description: "Host IP used for public URL defaults.", automated: true, validate: validateIpAddress },
  { key: "BACKEND_PUBLIC_URL", label: "Public URL", category: "Network", type: "string", restart_required: false, description: "Operator-facing backend URL.", automated: true, validate: validateUrl },
  { key: "BACKEND_LOCAL_URL", label: "Local URL", category: "Network", type: "string", restart_required: false, description: "Local backend URL for scripts.", automated: true, validate: validateUrl },
  { key: "BACKEND_BASE_URL", label: "Backend base URL", category: "Network", type: "string", restart_required: true, description: "Backend base URL used by server config.", automated: true, validate: validateUrl },
  { key: "CORS_ALLOW_ORIGIN", label: "CORS origin", category: "Network", type: "string", restart_required: true, description: "Allowed CORS origin." },
  { key: "DATABASE_URL", label: "Database URL", category: "Database", type: "string", restart_required: true, description: "Application Postgres connection string." },
  { key: "PG_BOOTSTRAP_URL", label: "Bootstrap URL", category: "Database", type: "string", restart_required: true, description: "Bootstrap Postgres connection string." },
  { key: "POSTGRES_DB", label: "Postgres DB", category: "Database", type: "string", restart_required: true, description: "Postgres database name." },
  { key: "POSTGRES_USER", label: "Postgres user", category: "Database", type: "string", restart_required: true, description: "Postgres username." },
  { key: "POSTGRES_PORT", label: "Postgres port", category: "Database", type: "number", restart_required: true, description: "Host Postgres port.", validate: validatePort },
  { key: "AUTO_BOOTSTRAP_DATABASE", label: "Auto bootstrap database", category: "Database", type: "boolean", restart_required: true, description: "Auto-create database on startup.", validate: validateBoolean },
  { key: "AUTO_MIGRATE", label: "Auto migrate", category: "Database", type: "boolean", restart_required: true, description: "Auto-run migrations on server startup.", validate: validateBoolean },
  { key: "ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS", label: "Destructive DB APIs", category: "Admin", type: "boolean", restart_required: true, description: "Enable legacy destructive DB admin APIs.", validate: validateBoolean },
  { key: "ENABLE_ADMIN_SIM_CONTROL", label: "Simulator admin APIs", category: "Admin", type: "boolean", restart_required: true, description: "Enable simulator admin control APIs.", validate: validateBoolean },
  { key: "TRACE_DECISION_REQUESTS", label: "Decision request trace", category: "Admin", type: "boolean", restart_required: true, description: "Emit compact structured backend decision trace logs.", validate: validateBoolean },
  { key: "REQUEST_BODY_LIMIT", label: "Request body limit", category: "Admin", type: "string", restart_required: true, description: "HTTP JSON request body limit, e.g. 25mb. Takes precedence over MAX_REQUEST_BODY_MB.", validate: validateByteSize },
  { key: "MAX_REQUEST_BODY_MB", label: "Request body MB", category: "Admin", type: "number", restart_required: true, description: "Fallback HTTP request body limit in MiB.", validate: validatePositiveNumber },
  { key: "TELEMETRY_MODE", label: "Telemetry mode", category: "Admin", type: "string", restart_required: false, description: "Default simulator telemetry mode: minimal or full.", validate: validateTelemetryMode },
  { key: "TELEMETRY_MAX_POST_BYTES", label: "Telemetry max post bytes", category: "Admin", type: "number", restart_required: false, description: "Simulator-side maximum telemetry POST size before local skip.", validate: validatePositiveNumber },
  { key: "SIM_CONTROLLER_RUNTIME_DIR", label: "Sim controller runtime dir", category: "Runtime", type: "string", restart_required: true, description: "Simulator controller runtime directory." },
  { key: "AUTO_UPDATE_ON_START", label: "Auto update on start", category: "Git", type: "boolean", restart_required: false, description: "Force-sync repo on Linux startup.", validate: validateBoolean },
  { key: "GIT_BRANCH", label: "Git branch", category: "Git", type: "string", restart_required: false, description: "Git branch for force-sync/update." },
  { key: "REPO_URL", label: "Repo URL", category: "Git", type: "string", restart_required: false, description: "Git remote URL for force-sync/update.", validate: validateUrl },
  { key: "PYTHON_EXECUTABLE", label: "Python executable", category: "ML", type: "string", restart_required: true, description: "Python executable for ML inference." },
  { key: "LIGHTGBM_INFER_SCRIPT", label: "LightGBM infer script", category: "ML", type: "string", restart_required: true, description: "LightGBM inference script path." },
  { key: "LIGHTGBM_MODEL_PATH", label: "LightGBM model", category: "ML", type: "string", restart_required: true, description: "LightGBM model file path." },
  { key: "LIGHTGBM_MODEL_META_PATH", label: "LightGBM model metadata", category: "ML", type: "string", restart_required: true, description: "LightGBM model metadata path." }
];

const EDITABLE_KEYS = new Set(CONFIG_SCHEMA.map((entry) => entry.key));
const CONFIG_STATUS_FILE = "config-status.json";

function nowIso(): string {
  return new Date().toISOString();
}

function validatePort(value: string): string | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536
    ? null
    : "Expected an integer port from 1 to 65535.";
}

function validateBoolean(value: string): string | null {
  return /^(true|false)$/iu.test(value)
    ? null
    : "Expected true or false.";
}

function validatePositiveNumber(value: string): string | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? null
    : "Expected a positive number.";
}

function validateByteSize(value: string): string | null {
  return value.trim() === "" || /^\d+(?:\.\d+)?\s*(b|kb|kib|mb|mib)?$/iu.test(value)
    ? null
    : "Expected a byte size such as 25mb or 26214400.";
}

function validateTelemetryMode(value: string): string | null {
  return /^(minimal|full)$/iu.test(value)
    ? null
    : "Expected minimal or full.";
}

function normalizeBooleanValue(value: string): string {
  return value.toLowerCase() === "true" ? "true" : "false";
}

function validateUrl(value: string): string | null {
  if (value.trim() === "" || value.trim() === "*") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? null
      : "Expected an http or https URL.";
  } catch {
    return "Expected a valid URL.";
  }
}

function validateIpAddress(value: string): string | null {
  if (value.trim() === "") {
    return null;
  }
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u.test(
    value
  )
    ? null
    : "Expected a valid IPv4 address.";
}

function command(
  file: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 6000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout ?? "").trim(),
          stderr: String(stderr ?? "").trim(),
          code:
            error && typeof (error as { code?: unknown }).code === "number"
              ? (error as { code: number }).code
              : error
                ? 1
                : 0
        });
      }
    );
    child.stdin?.end();
  });
}

async function commandText(
  file: string,
  args: string[],
  cwd?: string
): Promise<string | null> {
  const result = await command(file, args, cwd ? { cwd } : {});
  return result.ok ? result.stdout : null;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function tailFile(filePath: string, limit: number): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean).slice(-limit);
}

async function fetchReachable(url: string, init?: RequestInit): Promise<RuntimeComponentStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { ...(init ?? {}), signal: controller.signal });
    return {
      ok: response.ok || [400, 409, 422].includes(response.status),
      label: `HTTP ${response.status}`,
      detail: response.statusText || "reachable"
    };
  } catch (error) {
    return {
      ok: false,
      label: "unreachable",
      detail: error instanceof Error ? error.message : "request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class FileRuntimeAdminService implements RuntimeAdminService {
  constructor(private readonly config: ServerConfig) {}

  private runtimeDir(): string {
    return path.join(this.config.repoRoot, ".runtime");
  }

  private envPath(): string {
    return path.join(this.config.repoRoot, ".env");
  }

  private actionLogPath(): string {
    return path.join(this.runtimeDir(), "actions.ndjson");
  }

  private updateStatusJsonPath(): string {
    return path.join(this.runtimeDir(), "backend-update-status.json");
  }

  private configStatusPath(): string {
    return path.join(this.runtimeDir(), CONFIG_STATUS_FILE);
  }

  private async composeCommand(): Promise<{ file: string; args: string[] } | null> {
    const dockerCompose = await command("docker", ["compose", "version"]);
    if (dockerCompose.ok) {
      return { file: "docker", args: ["compose"] };
    }
    const legacy = await command("docker-compose", ["version"]);
    return legacy.ok ? { file: "docker-compose", args: [] } : null;
  }

  private async readBackendPid(): Promise<number | null> {
    const pidFile = path.join(this.runtimeDir(), "backend.pid");
    if (!fs.existsSync(pidFile)) {
      return null;
    }
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (!Number.isInteger(pid)) {
      return null;
    }
    const result = await command("node", ["-e", `try { process.kill(${pid}, 0); process.exit(0); } catch { process.exit(1); }`]);
    return result.ok ? pid : null;
  }

  private async portListeners(): Promise<number[]> {
    if (process.platform === "win32") {
      return [];
    }
    const result = await command("sh", [
      "-c",
      `if command -v lsof >/dev/null 2>&1; then lsof -tiTCP:${this.config.port} -sTCP:LISTEN; elif command -v fuser >/dev/null 2>&1; then fuser -n tcp ${this.config.port} 2>/dev/null | tr ' ' '\\n'; elif command -v ss >/dev/null 2>&1; then ss -ltnp 'sport = :${this.config.port}' | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p'; fi`
    ]);
    return result.stdout
      .split(/\s+/u)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  }

  private async pidUptimeSeconds(pid: number | null): Promise<number | null> {
    if (!pid || process.platform === "win32") {
      return null;
    }
    const value = await commandText("ps", ["-p", String(pid), "-o", "etimes="]);
    const seconds = value ? Number(value.trim()) : null;
    return Number.isFinite(seconds) ? seconds : null;
  }

  private readEnvValues(): Record<string, string> {
    if (!fs.existsSync(this.envPath())) {
      return {};
    }
    return parseEnvText(fs.readFileSync(this.envPath(), "utf8")).values;
  }

  private getOverrideState(
    disk: Record<string, string>,
    key: string
  ): { enabled: boolean; value: string } {
    const enabledKey = `${key}_OVERRIDE_ENABLED`;
    const valueKey = `${key}_OVERRIDE`;
    if (enabledKey in disk || valueKey in disk) {
      return {
        enabled: normalizeBooleanValue(disk[enabledKey] ?? "false") === "true",
        value: disk[valueKey] ?? ""
      };
    }

    const legacyValue = disk[key]?.trim() ?? "";
    return {
      enabled: legacyValue.length > 0,
      value: legacyValue
    };
  }

  private getDetectedValue(
    key: string,
    disk: Record<string, string>,
    effectiveSoFar: Record<string, string> = {}
  ): string | undefined {
    const detected = detectSystemIps();
    const port = disk.PORT?.trim() || effectiveSoFar.PORT || String(this.config.port);
    const hostIp =
      effectiveSoFar.BACKEND_HOST_IP || detected.detectedDefault || "127.0.0.1";

    if (key === "BACKEND_HOST_IP") {
      return detected.detectedDefault;
    }
    if (key === "BACKEND_PUBLIC_URL") {
      return `http://${hostIp}:${port}`;
    }
    if (key === "BACKEND_LOCAL_URL") {
      return `http://127.0.0.1:${port}`;
    }
    if (key === "BACKEND_BASE_URL") {
      return effectiveSoFar.BACKEND_PUBLIC_URL || `http://${hostIp}:${port}`;
    }
    return undefined;
  }

  private getEffectiveValue(
    key: string,
    disk: Record<string, string>,
    effectiveSoFar: Record<string, string> = {}
  ): string {
    const schema = CONFIG_SCHEMA.find((entry) => entry.key === key);
    const detected = schema?.automated
      ? this.getDetectedValue(key, disk, effectiveSoFar)
      : undefined;
    if (schema?.automated) {
      const override = this.getOverrideState(disk, key);
      return override.enabled ? override.value : detected ?? "";
    }

    const fallback: Record<string, string> = {
      PORT: String(this.config.port),
      HOST: this.config.host,
      DATABASE_URL: this.config.databaseUrl,
      PG_BOOTSTRAP_URL: this.config.pgBootstrapUrl,
      CORS_ALLOW_ORIGIN: this.config.allowedOrigin,
      POSTGRES_DB: "tichu",
      POSTGRES_USER: "tichu",
      POSTGRES_PORT: "54329",
      AUTO_BOOTSTRAP_DATABASE: String(this.config.autoBootstrapDatabase),
      AUTO_MIGRATE: String(this.config.autoMigrate),
      ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS: String(
        this.config.destructiveAdminEndpointsEnabled
      ),
      ENABLE_ADMIN_SIM_CONTROL: String(this.config.adminSimControlEnabled),
      TRACE_DECISION_REQUESTS: String(this.config.traceDecisionRequests),
      SIM_CONTROLLER_RUNTIME_DIR: this.config.simControllerRuntimeDir,
      AUTO_UPDATE_ON_START: "true",
      GIT_BRANCH: "main",
      REPO_URL: "https://github.com/NeonButrfly/tichuml.git",
      PYTHON_EXECUTABLE: this.config.pythonExecutable,
      LIGHTGBM_INFER_SCRIPT: this.config.lightgbmInferScript,
      LIGHTGBM_MODEL_PATH: this.config.lightgbmModelPath,
      LIGHTGBM_MODEL_META_PATH: this.config.lightgbmModelMetaPath
    };
    return disk[key] ?? fallback[key] ?? "";
  }

  private effectiveConfigValues(): Record<string, string> {
    const disk = this.readEnvValues();
    const effective: Record<string, string> = {};
    for (const entry of CONFIG_SCHEMA) {
      effective[entry.key] = this.getEffectiveValue(entry.key, disk, effective);
    }
    return effective;
  }

  private runtimeDiffersFromDisk(): boolean {
    const disk = this.readEnvValues();
    const effective = this.effectiveConfigValues();
    return CONFIG_SCHEMA.some((entry) => {
      if (entry.automated) {
        const override = this.getOverrideState(disk, entry.key);
        return override.enabled && override.value !== effective[entry.key];
      }
      return entry.restart_required && entry.key in disk
        ? disk[entry.key] !== effective[entry.key]
        : false;
    });
  }

  private pendingRestart(): boolean {
    const status = readJsonFile<{ pending_restart?: boolean }>(this.configStatusPath());
    return status?.pending_restart === true || this.runtimeDiffersFromDisk();
  }

  async isAdminSafetyLocked(): Promise<boolean> {
    const disk = this.readEnvValues();
    const raw = disk.ENABLE_RUNTIME_ADMIN_CONTROL;
    return raw === undefined
      ? !this.config.runtimeAdminControlEnabled
      : normalizeBooleanValue(raw) !== "true";
  }

  async status(): Promise<RuntimeAdminStatus> {
    const pid = await this.readBackendPid();
    const listeners = await this.portListeners();
    const compose = await this.composeCommand();
    const diskEnv = this.readEnvValues();
    const effectiveConfig = this.effectiveConfigValues();
    const detectedIps = detectSystemIps();
    const adminSafetyLocked = await this.isAdminSafetyLocked();
    const localBase = `http://127.0.0.1:${this.config.port}`;
    const dockerVersion = await commandText("docker", ["--version"]);
    const composeVersion = compose
      ? await commandText(compose.file, [...compose.args, "version"], this.config.repoRoot)
      : null;
    const branch = await commandText("git", ["branch", "--show-current"], this.config.repoRoot);
    const localCommit = await commandText("git", ["rev-parse", "HEAD"], this.config.repoRoot);
    const remoteCommit = await commandText("git", ["rev-parse", "origin/" + (branch || "main")], this.config.repoRoot);
    const aheadBehind = await commandText(
      "git",
      ["rev-list", "--left-right", "--count", `HEAD...origin/${branch || "main"}`],
      this.config.repoRoot
    );
    const dirtyResult = await command("git", ["status", "--porcelain"], {
      cwd: this.config.repoRoot
    });
    const postgresRunning = compose
      ? await command(compose.file, [...compose.args, "-f", path.join(this.config.repoRoot, "docker-compose.yml"), "ps", "--status", "running", "postgres"], {
          cwd: this.config.repoRoot
        })
      : null;
    const pgReady = compose
      ? await command(compose.file, [...compose.args, "-f", path.join(this.config.repoRoot, "docker-compose.yml"), "exec", "-T", "postgres", "pg_isready", "-U", diskEnv.POSTGRES_USER ?? "tichu", "-d", diskEnv.POSTGRES_DB ?? "tichu"], {
          cwd: this.config.repoRoot
        })
      : null;
    const [aheadRaw, behindRaw] = (aheadBehind ?? "")
      .split(/\s+/u)
      .map((value) => Number(value));
    const ahead = Number.isFinite(aheadRaw) ? (aheadRaw as number) : null;
    const behind = Number.isFinite(behindRaw) ? (behindRaw as number) : null;

    return {
      checked_at: nowIso(),
      admin_safety: {
        locked: adminSafetyLocked,
        blocked_actions: adminSafetyLocked ? BLOCKED_WHEN_LOCKED : []
      },
      backend: {
        running: pid !== null,
        pid,
        uptime_seconds: await this.pidUptimeSeconds(pid),
        port_listeners: listeners,
        pid_file: path.join(this.runtimeDir(), "backend.pid"),
        log_file: path.join(this.runtimeDir(), "backend.log"),
        runtime_dir: this.runtimeDir()
      },
      endpoints: {
        health: await fetchReachable(`${localBase}/health`),
        decision: await fetchReachable(`${localBase}/api/decision/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }),
        telemetry: await fetchReachable(`${localBase}/api/telemetry/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }),
        control_panel: await fetchReachable(`${localBase}/admin/control`)
      },
      postgres: {
        container_running: postgresRunning ? postgresRunning.ok && postgresRunning.stdout.includes("postgres") : null,
        ready: pgReady ? pgReady.ok : null,
        detail: pgReady?.stdout || pgReady?.stderr || "not checked"
      },
      git: {
        branch,
        local_commit: localCommit,
        remote_commit: remoteCommit,
        ahead,
        behind,
        dirty: dirtyResult.ok ? dirtyResult.stdout.length > 0 : null
      },
      tools: {
        node: { ok: true, label: process.version, detail: process.execPath },
        npm: await toolStatus("npm", ["--version"]),
        python: await toolStatus("python3", ["--version"]),
        docker: { ok: Boolean(dockerVersion), label: dockerVersion ?? "missing", detail: dockerVersion ?? "docker not found" },
        compose: { ok: Boolean(composeVersion), label: composeVersion ?? "missing", detail: composeVersion ?? "compose not found" }
      },
      runtime: {
        repo_root: this.config.repoRoot,
        backend_public_url: effectiveConfig.BACKEND_PUBLIC_URL ?? this.config.backendBaseUrl,
        backend_local_url: effectiveConfig.BACKEND_LOCAL_URL ?? localBase,
        backend_base_url: effectiveConfig.BACKEND_BASE_URL ?? this.config.backendBaseUrl,
        detected_ethernet: detectedIps.detectedEthernet,
        detected_wireless: detectedIps.detectedWireless,
        detected_default: detectedIps.detectedDefault,
        detected_primary_ip: detectedIps.primary,
        detected_system_ips: detectedIps.addresses,
        backend_host_ip_override: this.getOverrideState(diskEnv, "BACKEND_HOST_IP")
          .enabled
          ? this.getOverrideState(diskEnv, "BACKEND_HOST_IP").value
          : null,
        sim_controller_runtime_dir: this.config.simControllerRuntimeDir,
        update_status_file: path.join(this.runtimeDir(), "backend-update-status.env"),
        update_status_json_file: this.updateStatusJsonPath(),
        action_log_file: this.actionLogPath(),
        web_dist_exists: fs.existsSync(path.join(this.config.repoRoot, "apps", "web", "dist", "index.html")),
        node_modules_exists: fs.existsSync(path.join(this.config.repoRoot, "node_modules")),
        python_venv_exists:
          fs.existsSync(path.join(this.config.repoRoot, ".venv", "bin", "python")) ||
          fs.existsSync(path.join(this.config.repoRoot, ".venv", "Scripts", "python.exe")),
        ml_requirements_installed: fs.existsSync(path.join(this.runtimeDir(), "ml-install.stamp")),
        lightgbm_model_exists: fs.existsSync(this.config.lightgbmModelPath),
        config_pending_restart: this.pendingRestart(),
        runtime_differs_from_disk_config: this.runtimeDiffersFromDisk()
      },
      recent_logs: {
        backend: tailFile(path.join(this.runtimeDir(), "backend.log"), 40),
        actions: tailFile(this.actionLogPath(), 40)
      }
    };
  }

  async readConfig(): Promise<RuntimeConfigPayload> {
    const disk = this.readEnvValues();
    const effective = this.effectiveConfigValues();
    const detected = detectSystemIps();
    return {
      env_file: this.envPath(),
      effective,
      detected: {
        detectedEthernet: detected.detectedEthernet,
        detectedWireless: detected.detectedWireless,
        detectedDefault: detected.detectedDefault,
        primary_ip: detected.primary,
        system_ips: detected.addresses
      },
      entries: CONFIG_SCHEMA.map((entry) => {
        const override = entry.automated
          ? this.getOverrideState(disk, entry.key)
          : { enabled: false, value: "" };
        const detectedValue = entry.automated
          ? this.getDetectedValue(entry.key, disk, effective)
          : undefined;
        const savedValue = entry.automated
          ? override.value
          : disk[entry.key] ?? effective[entry.key] ?? "";
        const effectiveValue = effective[entry.key] ?? "";
        return {
          key: entry.key,
          label: entry.label,
          category: entry.category,
          type: entry.type,
          editable: entry.type !== "derived",
          requiresRestart: entry.restart_required,
          description: entry.description,
          savedValue,
          effectiveValue,
          detectedValue,
          overrideEnabled: entry.automated ? override.enabled : true,
          overrideValue: override.value,
          value: savedValue,
          effective_value: effectiveValue,
          detected_value: detectedValue,
          overridden: entry.automated ? override.enabled : true,
          restart_required: entry.restart_required,
          input:
            entry.type === "boolean"
              ? "boolean"
              : entry.type === "number"
                ? "number"
                : "text"
        };
      }),
      pending_restart: this.pendingRestart(),
      runtime_differs_from_disk_config: this.runtimeDiffersFromDisk()
    };
  }

  async saveConfig(updates: Record<string, unknown>): Promise<RuntimeConfigSaveResult> {
    fs.mkdirSync(this.config.repoRoot, { recursive: true });
    const currentText = fs.existsSync(this.envPath())
      ? fs.readFileSync(this.envPath(), "utf8")
      : "";
    const parsed = parseEnvText(currentText);
    const nextValues = { ...parsed.values };
    const changedKeys: string[] = [];
    for (const [key, rawValue] of Object.entries(updates)) {
      if (!EDITABLE_KEYS.has(key)) {
        throw new Error(`Unsupported config key: ${key}`);
      }
      const metadata = CONFIG_SCHEMA.find((entry) => entry.key === key);
      const structured =
        typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)
          ? (rawValue as Record<string, unknown>)
          : null;
      const overrideEnabled = structured
        ? structured.overrideEnabled === true
        : metadata?.automated
          ? true
          : false;
      const valueSource = structured
        ? structured.overrideValue ?? structured.savedValue ?? ""
        : rawValue;
      if (typeof valueSource !== "string") {
        throw new Error(`Config value for ${key} must be a string.`);
      }
      if (/[\0\r\n]/u.test(valueSource)) {
        throw new Error(`Config value for ${key} cannot contain newlines.`);
      }
      const validationError =
        metadata?.automated && !overrideEnabled
          ? null
          : metadata?.validate?.(valueSource) ?? null;
      if (validationError) {
        throw new Error(`${key}: ${validationError}`);
      }
      const value =
        metadata?.type === "boolean" ? normalizeBooleanValue(valueSource) : valueSource;
      if (metadata?.automated) {
        const enabledKey = `${key}_OVERRIDE_ENABLED`;
        const valueKey = `${key}_OVERRIDE`;
        if ((nextValues[enabledKey] ?? "false") !== String(overrideEnabled)) {
          nextValues[enabledKey] = String(overrideEnabled);
          changedKeys.push(key);
        }
        if ((nextValues[valueKey] ?? "") !== value) {
          nextValues[valueKey] = value;
          if (!changedKeys.includes(key)) changedKeys.push(key);
        }
        if (key in nextValues && nextValues[key] !== "") {
          nextValues[key] = "";
          if (!changedKeys.includes(key)) changedKeys.push(key);
        }
      } else if ((nextValues[key] ?? "") !== value) {
        nextValues[key] = value;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      const backup = `${this.envPath()}.${Date.now()}.bak`;
      if (fs.existsSync(this.envPath())) {
        fs.copyFileSync(this.envPath(), backup);
      }
      writeFileAtomic(
        this.envPath(),
        writeEnvText(
          parsed,
          nextValues,
          [
            ...CONFIG_SCHEMA.map((entry) => entry.key),
            ...CONFIG_SCHEMA.filter((entry) => entry.automated).flatMap((entry) => [
              `${entry.key}_OVERRIDE_ENABLED`,
              `${entry.key}_OVERRIDE`
            ]),
            "ENABLE_RUNTIME_ADMIN_CONTROL"
          ]
        )
      );
    }

    const restartRequired = changedKeys.some(
      (key) => CONFIG_SCHEMA.find((entry) => entry.key === key)?.restart_required
    );
    fs.mkdirSync(this.runtimeDir(), { recursive: true });
    writeFileAtomic(
      this.configStatusPath(),
      `${JSON.stringify(
        {
          pending_restart: restartRequired || this.runtimeDiffersFromDisk(),
          changed_keys: changedKeys,
          updated_at: nowIso()
        },
        null,
        2
      )}\n`,
    );

    return {
      accepted: true,
      message:
        changedKeys.length === 0
          ? "No config changes were needed."
          : restartRequired
            ? "Config saved. Restart is required for one or more changes."
            : "Config saved.",
      changed_keys: changedKeys,
      restart_required: restartRequired,
      config: await this.readConfig()
    };
  }

  async setAdminSafetyLocked(locked: boolean): Promise<RuntimeSafetyResult> {
    const currentText = fs.existsSync(this.envPath())
      ? fs.readFileSync(this.envPath(), "utf8")
      : "";
    const parsed = parseEnvText(currentText);
    const nextValues = {
      ...parsed.values,
      ENABLE_RUNTIME_ADMIN_CONTROL: String(!locked)
    };
    writeFileAtomic(
      this.envPath(),
      writeEnvText(
        parsed,
        nextValues,
        [
          ...CONFIG_SCHEMA.map((entry) => entry.key),
          ...CONFIG_SCHEMA.filter((entry) => entry.automated).flatMap((entry) => [
            `${entry.key}_OVERRIDE_ENABLED`,
            `${entry.key}_OVERRIDE`
          ]),
          "ENABLE_RUNTIME_ADMIN_CONTROL"
        ]
      )
    );
    fs.mkdirSync(this.runtimeDir(), { recursive: true });
    writeFileAtomic(
      this.configStatusPath(),
      `${JSON.stringify(
        {
          pending_restart: true,
          changed_keys: ["ENABLE_RUNTIME_ADMIN_CONTROL"],
          updated_at: nowIso()
        },
        null,
        2
      )}\n`
    );

    return {
      accepted: true,
      locked,
      message: locked
        ? "Admin safety lock enabled. Runtime actions are blocked."
        : "Admin safety lock disabled. Runtime actions are available.",
      config: await this.readConfig()
    };
  }

  async runAction(action: string): Promise<RuntimeActionResult> {
    const supportedActions = new Set([
      "start_backend",
      "stop_backend",
      "restart_backend",
      "full_restart",
      "start_postgres",
      "stop_postgres",
      "update_repo",
      "clear_db",
      "apply_config_restart"
    ]);

    if (!supportedActions.has(action)) {
      throw new Error(`Unsupported runtime action: ${action}`);
    }
    if (await this.isAdminSafetyLocked()) {
      throw new Error(
        "Admin safety lock is enabled. Disable the lock before running runtime actions."
      );
    }

    fs.mkdirSync(this.runtimeDir(), { recursive: true });
    const logPath = this.actionLogPath();
    const scriptPath = path.join(this.config.repoRoot, "scripts", "runtime_action_linux.sh");
    const commandText = `printf '%s\\n' '${nowIso()} action=${action} start' >> ${formatEnvValue(logPath)}; bash ${formatEnvValue(scriptPath)} ${formatEnvValue(action)} >> ${formatEnvValue(logPath)} 2>&1; status=$?; printf '%s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ) action=${action} exit=$status" >> ${formatEnvValue(logPath)}`;
    const child = spawn("bash", ["-lc", commandText], {
      cwd: this.config.repoRoot,
      detached: true,
      stdio: "ignore"
    });
    child.unref();

    return {
      accepted: true,
      action,
      message: `Runtime action '${action}' started.`,
      log_file: logPath,
      started_at: nowIso()
    };
  }
}

async function toolStatus(file: string, args: string[]): Promise<RuntimeComponentStatus> {
  const result = await command(file, args);
  return {
    ok: result.ok,
    label: result.ok ? result.stdout || "available" : "missing",
    detail: result.stderr || result.stdout || (result.ok ? "available" : "not found")
  };
}
