import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SERVER_PORT,
  defaultDatabaseUrl,
  type DecisionMode,
  normalizeBackendBaseUrl,
  parseBooleanEnv
} from "@tichuml/shared";
import { detectSystemIps, parseEnvFile } from "./env-file.js";

export type ServerConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  pgBootstrapUrl: string;
  allowedOrigin: string;
  autoBootstrapDatabase: boolean;
  autoMigrate: boolean;
  backendBaseUrl: string;
  destructiveAdminEndpointsEnabled: boolean;
  adminSimControlEnabled: boolean;
  runtimeAdminControlEnabled: boolean;
  traceDecisionRequests: boolean;
  requestBodyLimitBytes: number;
  requestBodyLimitLabel: string;
  telemetryMode: "minimal" | "full";
  telemetryMaxPostBytes: number;
  telemetryPostTimeoutMs: number;
  telemetryIngestQueueMaxDepth: number;
  telemetryPersistenceBatchSize: number;
  telemetryPersistenceConcurrency: number;
  simDefaultProvider: DecisionMode;
  simDefaultBackendUrl: string;
  simDefaultWorkerCount: number;
  simDefaultGamesPerBatch: number;
  simControllerRuntimeDir: string;
  repoRoot: string;
  pythonExecutable: string;
  lightgbmInferScript: string;
  lightgbmModelPath: string;
  lightgbmModelMetaPath: string;
};

const DEFAULT_REQUEST_BODY_LIMIT_MB = 25;
const DEFAULT_TELEMETRY_MAX_POST_BYTES = 24 * 1024 * 1024;
const DEFAULT_TELEMETRY_POST_TIMEOUT_MS = 10_000;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDecisionMode(value: string | undefined): DecisionMode {
  return value === "server_heuristic" || value === "lightgbm_model"
    ? value
    : "local";
}

function parseByteSize(value: string | undefined): number | null {
  const rawValue = value?.trim().toLowerCase();
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib)?$/u);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? "b";
  const multiplier =
    unit === "mb" || unit === "mib"
      ? 1024 * 1024
      : unit === "kb" || unit === "kib"
        ? 1024
        : 1;
  return Math.floor(amount * multiplier);
}

function resolveRequestBodyLimit(env: Record<string, string | undefined>): {
  bytes: number;
  label: string;
} {
  const explicitLimit = parseByteSize(env.REQUEST_BODY_LIMIT);
  if (explicitLimit !== null) {
    return {
      bytes: explicitLimit,
      label: env.REQUEST_BODY_LIMIT?.trim() || `${explicitLimit}b`
    };
  }

  const mbValue = Number(env.MAX_REQUEST_BODY_MB ?? DEFAULT_REQUEST_BODY_LIMIT_MB);
  const mb = Number.isFinite(mbValue) && mbValue > 0 ? mbValue : DEFAULT_REQUEST_BODY_LIMIT_MB;
  return {
    bytes: Math.floor(mb * 1024 * 1024),
    label: `${mb}mb`
  };
}

export function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
}

function loadRepoEnvDefaults(repoRoot: string): Record<string, string> {
  return {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, "apps/server/.env"))
  };
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function resolveRepoPath(
  repoRoot: string,
  candidate: string | undefined,
  fallbackRelativePath: string
): string {
  const rawValue = candidate?.trim();
  if (!rawValue) {
    return path.join(repoRoot, fallbackRelativePath);
  }

  return path.isAbsolute(rawValue) ? rawValue : path.join(repoRoot, rawValue);
}

function resolvePythonExecutable(
  repoRoot: string,
  envValue: string | undefined
): string {
  const rawValue = envValue?.trim();
  if (rawValue) {
    return rawValue;
  }

  const windowsVenvPython = path.join(repoRoot, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(windowsVenvPython)) {
    return windowsVenvPython;
  }

  const unixVenvPython = path.join(repoRoot, ".venv", "bin", "python");
  if (fs.existsSync(unixVenvPython)) {
    return unixVenvPython;
  }

  return "python";
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    repoRoot?: string;
  } = {}
): ServerConfig {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const mergedEnv = {
    ...loadRepoEnvDefaults(repoRoot),
    ...env
  };
  const portValue = Number(mergedEnv.PORT ?? DEFAULT_SERVER_PORT);
  const databaseUrl = mergedEnv.DATABASE_URL ?? defaultDatabaseUrl;
  const port = Number.isFinite(portValue) ? portValue : DEFAULT_SERVER_PORT;
  const detected = detectSystemIps();
  const detectedPublicUrl = `http://${detected.detectedDefault}:${port}`;
  const backendBaseUrl =
    parseBooleanEnv(mergedEnv.BACKEND_BASE_URL_OVERRIDE_ENABLED, false)
      ? mergedEnv.BACKEND_BASE_URL_OVERRIDE?.trim() ||
        mergedEnv.BACKEND_BASE_URL?.trim() ||
        detectedPublicUrl
      : mergedEnv.BACKEND_BASE_URL?.trim() || detectedPublicUrl;
  const requestBodyLimit = resolveRequestBodyLimit(mergedEnv);
  const telemetryMaxPostBytes = parsePositiveInteger(
    mergedEnv.TELEMETRY_MAX_POST_BYTES,
    DEFAULT_TELEMETRY_MAX_POST_BYTES
  );
  const simBackendUrl =
    mergedEnv.SIM_BACKEND_URL?.trim() ||
    mergedEnv.BACKEND_URL?.trim() ||
    backendBaseUrl;

  return {
    port,
    host: mergedEnv.HOST?.trim() || "0.0.0.0",
    databaseUrl,
    pgBootstrapUrl:
      mergedEnv.PG_BOOTSTRAP_URL?.trim() ||
      withDatabaseName(databaseUrl, "postgres"),
    allowedOrigin: mergedEnv.CORS_ALLOW_ORIGIN?.trim() || "*",
    autoBootstrapDatabase: parseBooleanEnv(
      mergedEnv.AUTO_BOOTSTRAP_DATABASE,
      true
    ),
    autoMigrate: parseBooleanEnv(mergedEnv.AUTO_MIGRATE, true),
    backendBaseUrl: normalizeBackendBaseUrl(backendBaseUrl),
    destructiveAdminEndpointsEnabled: parseBooleanEnv(
      mergedEnv.ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS,
      false
    ),
    adminSimControlEnabled: parseBooleanEnv(
      mergedEnv.ENABLE_ADMIN_SIM_CONTROL,
      false
    ),
    runtimeAdminControlEnabled: parseBooleanEnv(
      mergedEnv.ENABLE_RUNTIME_ADMIN_CONTROL,
      parseBooleanEnv(mergedEnv.ENABLE_ADMIN_SIM_CONTROL, false)
    ),
    traceDecisionRequests: parseBooleanEnv(
      mergedEnv.TRACE_DECISION_REQUESTS,
      false
    ),
    requestBodyLimitBytes: requestBodyLimit.bytes,
    requestBodyLimitLabel: requestBodyLimit.label,
    telemetryMode: mergedEnv.TELEMETRY_MODE === "full" ? "full" : "minimal",
    telemetryMaxPostBytes,
    telemetryPostTimeoutMs: parsePositiveInteger(
      mergedEnv.TELEMETRY_POST_TIMEOUT_MS,
      DEFAULT_TELEMETRY_POST_TIMEOUT_MS
    ),
    telemetryIngestQueueMaxDepth: parsePositiveInteger(
      mergedEnv.TELEMETRY_INGEST_QUEUE_MAX_DEPTH,
      5000
    ),
    telemetryPersistenceBatchSize: parsePositiveInteger(
      mergedEnv.TELEMETRY_PERSISTENCE_BATCH_SIZE,
      100
    ),
    telemetryPersistenceConcurrency: parsePositiveInteger(
      mergedEnv.TELEMETRY_PERSISTENCE_CONCURRENCY,
      2
    ),
    simDefaultProvider: parseDecisionMode(mergedEnv.SIM_PROVIDER),
    simDefaultBackendUrl: normalizeBackendBaseUrl(simBackendUrl),
    simDefaultWorkerCount: parsePositiveInteger(mergedEnv.SIM_WORKER_COUNT, 1),
    simDefaultGamesPerBatch: parsePositiveInteger(
      mergedEnv.SIM_GAMES_PER_BATCH,
      1
    ),
    simControllerRuntimeDir: resolveRepoPath(
      repoRoot,
      mergedEnv.SIM_CONTROLLER_RUNTIME_DIR,
      path.join(".runtime", "sim-controller")
    ),
    repoRoot,
    pythonExecutable: resolvePythonExecutable(repoRoot, mergedEnv.PYTHON_EXECUTABLE),
    lightgbmInferScript: resolveRepoPath(
      repoRoot,
      mergedEnv.LIGHTGBM_INFER_SCRIPT,
      path.join("ml", "infer.py")
    ),
    lightgbmModelPath: resolveRepoPath(
      repoRoot,
      mergedEnv.LIGHTGBM_MODEL_PATH,
      path.join("ml", "model_registry", "lightgbm_action_model.txt")
    ),
    lightgbmModelMetaPath: resolveRepoPath(
      repoRoot,
      mergedEnv.LIGHTGBM_MODEL_META_PATH,
      path.join("ml", "model_registry", "lightgbm_action_model.meta.json")
    )
  };
}
