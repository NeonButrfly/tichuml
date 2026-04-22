import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ServerConfig } from "../config/env.js";

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
  value: string;
  editable: boolean;
  restart_required: boolean;
  description: string;
};

export type RuntimeConfigPayload = {
  env_file: string;
  effective: Record<string, string>;
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

export interface RuntimeAdminService {
  status(): Promise<RuntimeAdminStatus>;
  readConfig(): Promise<RuntimeConfigPayload>;
  saveConfig(updates: Record<string, unknown>): Promise<RuntimeConfigSaveResult>;
  runAction(action: string): Promise<RuntimeActionResult>;
}

const EDITABLE_ENV: Array<{
  key: string;
  restart_required: boolean;
  description: string;
  validate?: (value: string) => string | null;
}> = [
  { key: "PORT", restart_required: true, description: "Backend HTTP port.", validate: validatePort },
  { key: "HOST", restart_required: true, description: "Backend listen host." },
  { key: "BACKEND_HOST_IP", restart_required: false, description: "Host IP used for public URL defaults." },
  { key: "BACKEND_PUBLIC_URL", restart_required: false, description: "Operator-facing backend URL." },
  { key: "BACKEND_LOCAL_URL", restart_required: false, description: "Local backend URL for scripts." },
  { key: "BACKEND_BASE_URL", restart_required: true, description: "Backend base URL used by server config." },
  { key: "CORS_ALLOW_ORIGIN", restart_required: true, description: "Allowed CORS origin." },
  { key: "DATABASE_URL", restart_required: true, description: "Application Postgres connection string." },
  { key: "PG_BOOTSTRAP_URL", restart_required: true, description: "Bootstrap Postgres connection string." },
  { key: "POSTGRES_DB", restart_required: true, description: "Postgres database name." },
  { key: "POSTGRES_USER", restart_required: true, description: "Postgres username." },
  { key: "POSTGRES_PORT", restart_required: true, description: "Host Postgres port.", validate: validatePort },
  { key: "AUTO_BOOTSTRAP_DATABASE", restart_required: true, description: "Auto-create database on startup.", validate: validateBoolean },
  { key: "AUTO_MIGRATE", restart_required: true, description: "Auto-run migrations on server startup.", validate: validateBoolean },
  { key: "ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS", restart_required: true, description: "Enable destructive DB admin APIs.", validate: validateBoolean },
  { key: "ENABLE_ADMIN_SIM_CONTROL", restart_required: true, description: "Enable simulator admin control APIs.", validate: validateBoolean },
  { key: "ENABLE_RUNTIME_ADMIN_CONTROL", restart_required: true, description: "Enable mutating runtime admin APIs.", validate: validateBoolean },
  { key: "SIM_CONTROLLER_RUNTIME_DIR", restart_required: true, description: "Simulator controller runtime directory." },
  { key: "AUTO_UPDATE_ON_START", restart_required: false, description: "Force-sync repo on Linux startup.", validate: validateBoolean },
  { key: "GIT_BRANCH", restart_required: false, description: "Git branch for force-sync/update." },
  { key: "REPO_URL", restart_required: false, description: "Git remote URL for force-sync/update." },
  { key: "PYTHON_EXECUTABLE", restart_required: true, description: "Python executable for ML inference." },
  { key: "LIGHTGBM_INFER_SCRIPT", restart_required: true, description: "LightGBM inference script path." },
  { key: "LIGHTGBM_MODEL_PATH", restart_required: true, description: "LightGBM model file path." },
  { key: "LIGHTGBM_MODEL_META_PATH", restart_required: true, description: "LightGBM model metadata path." }
];

const EDITABLE_KEYS = new Set(EDITABLE_ENV.map((entry) => entry.key));
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
  return /^(true|false|1|0|yes|no|on|off)$/iu.test(value)
    ? null
    : "Expected a boolean value.";
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

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvText(text: string): {
  values: Record<string, string>;
  lines: Array<{ raw: string; key?: string; value?: string }>;
} {
  const values: Record<string, string> = {};
  const lines = text.split(/\r?\n/u).map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return { raw };
    }
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      return { raw };
    }
    const key = match[1] ?? "";
    const value = stripEnvQuotes(match[2] ?? "");
    values[key] = value;
    return { raw, key, value };
  });
  return { values, lines };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]*$/u.test(value) && value.length > 0) {
    return value;
  }
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function writeEnvText(
  parsed: ReturnType<typeof parseEnvText>,
  values: Record<string, string>
): string {
  const written = new Set<string>();
  const lines = parsed.lines.map((entry) => {
    if (!entry.key || !(entry.key in values)) {
      return entry.raw;
    }
    written.add(entry.key);
    return `${entry.key}=${shellQuote(values[entry.key] ?? "")}`;
  });
  for (const key of EDITABLE_ENV.map((entry) => entry.key)) {
    if (key in values && !written.has(key)) {
      lines.push(`${key}=${shellQuote(values[key] ?? "")}`);
    }
  }
  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
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

  private effectiveConfigValues(): Record<string, string> {
    return {
      PORT: String(this.config.port),
      HOST: this.config.host,
      DATABASE_URL: this.config.databaseUrl,
      PG_BOOTSTRAP_URL: this.config.pgBootstrapUrl,
      CORS_ALLOW_ORIGIN: this.config.allowedOrigin,
      AUTO_BOOTSTRAP_DATABASE: String(this.config.autoBootstrapDatabase),
      AUTO_MIGRATE: String(this.config.autoMigrate),
      BACKEND_BASE_URL: this.config.backendBaseUrl,
      ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS: String(
        this.config.destructiveAdminEndpointsEnabled
      ),
      ENABLE_ADMIN_SIM_CONTROL: String(this.config.adminSimControlEnabled),
      SIM_CONTROLLER_RUNTIME_DIR: this.config.simControllerRuntimeDir,
      PYTHON_EXECUTABLE: this.config.pythonExecutable,
      LIGHTGBM_INFER_SCRIPT: this.config.lightgbmInferScript,
      LIGHTGBM_MODEL_PATH: this.config.lightgbmModelPath,
      LIGHTGBM_MODEL_META_PATH: this.config.lightgbmModelMetaPath
    };
  }

  private runtimeDiffersFromDisk(): boolean {
    const disk = this.readEnvValues();
    const effective = this.effectiveConfigValues();
    return Object.entries(effective).some(([key, value]) =>
      key in disk ? disk[key] !== value : false
    );
  }

  private pendingRestart(): boolean {
    const status = readJsonFile<{ pending_restart?: boolean }>(this.configStatusPath());
    return status?.pending_restart === true || this.runtimeDiffersFromDisk();
  }

  async status(): Promise<RuntimeAdminStatus> {
    const pid = await this.readBackendPid();
    const listeners = await this.portListeners();
    const compose = await this.composeCommand();
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
      ? await command(compose.file, [...compose.args, "-f", path.join(this.config.repoRoot, "docker-compose.yml"), "exec", "-T", "postgres", "pg_isready", "-U", this.readEnvValues().POSTGRES_USER ?? "tichu", "-d", this.readEnvValues().POSTGRES_DB ?? "tichu"], {
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
        backend_public_url: this.readEnvValues().BACKEND_PUBLIC_URL ?? this.config.backendBaseUrl,
        backend_local_url: this.readEnvValues().BACKEND_LOCAL_URL ?? localBase,
        backend_base_url: this.config.backendBaseUrl,
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
    return {
      env_file: this.envPath(),
      effective,
      entries: EDITABLE_ENV.map((entry) => ({
        key: entry.key,
        value: disk[entry.key] ?? effective[entry.key] ?? "",
        editable: true,
        restart_required: entry.restart_required,
        description: entry.description
      })),
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
      if (typeof rawValue !== "string") {
        throw new Error(`Config value for ${key} must be a string.`);
      }
      if (/[\0\r\n]/u.test(rawValue)) {
        throw new Error(`Config value for ${key} cannot contain newlines.`);
      }
      const metadata = EDITABLE_ENV.find((entry) => entry.key === key);
      const validationError = metadata?.validate?.(rawValue) ?? null;
      if (validationError) {
        throw new Error(`${key}: ${validationError}`);
      }
      if ((nextValues[key] ?? "") !== rawValue) {
        nextValues[key] = rawValue;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      const backup = `${this.envPath()}.${Date.now()}.bak`;
      if (fs.existsSync(this.envPath())) {
        fs.copyFileSync(this.envPath(), backup);
      }
      fs.writeFileSync(this.envPath(), writeEnvText(parsed, nextValues), "utf8");
    }

    const restartRequired = changedKeys.some(
      (key) => EDITABLE_ENV.find((entry) => entry.key === key)?.restart_required
    );
    fs.mkdirSync(this.runtimeDir(), { recursive: true });
    fs.writeFileSync(
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
      "utf8"
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

  async runAction(action: string): Promise<RuntimeActionResult> {
    const scripts = {
      start_backend: "scripts/start_backend_linux.sh",
      stop_backend: "scripts/stop_backend_linux.sh --backend-only",
      restart_backend:
        "scripts/stop_backend_linux.sh --backend-only && scripts/start_backend_linux.sh",
      full_restart:
        "scripts/stop_backend_linux.sh --full && scripts/start_backend_linux.sh",
      start_postgres:
        ". scripts/backend-linux-common.sh && load_repo_env && ensure_runtime_dirs && ensure_docker_running && start_postgres && wait_for_postgres",
      stop_postgres:
        ". scripts/backend-linux-common.sh && load_repo_env && ensure_runtime_dirs && stop_postgres",
      apply_config_restart:
        "scripts/stop_backend_linux.sh --backend-only && scripts/start_backend_linux.sh"
    } as Record<string, string>;

    const script = scripts[action];
    if (!script) {
      throw new Error(`Unsupported runtime action: ${action}`);
    }

    fs.mkdirSync(this.runtimeDir(), { recursive: true });
    const logPath = this.actionLogPath();
    const commandText = `printf '%s\\n' '${nowIso()} action=${action} start' >> ${shellQuote(logPath)}; ${script} >> ${shellQuote(logPath)} 2>&1; status=$?; printf '%s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ) action=${action} exit=$status" >> ${shellQuote(logPath)}`;
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
