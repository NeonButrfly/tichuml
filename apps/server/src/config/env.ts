import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SERVER_PORT,
  defaultDatabaseUrl,
  type DecisionMode,
  type ExplorationProfile,
  normalizeBackendBaseUrl,
  parseExplorationProfile,
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
  telemetryRetryAttempts: number;
  telemetryRetryDelayMs: number;
  telemetryBackoffMs: number;
  telemetryIngestQueueMaxDepth: number;
  telemetryPersistenceBatchSize: number;
  telemetryPersistenceConcurrency: number;
  simDefaultProvider: DecisionMode;
  simDefaultBackendUrl: string;
  simDefaultExplorationProfile: ExplorationProfile;
  simDefaultExplorationRate: number | null;
  simDefaultExplorationTopN: number | null;
  simDefaultExplorationMaxScoreGap: number | null;
  simDefaultWorkerCount: number;
  simDefaultGamesPerBatch: number;
  simControllerRuntimeDir: string;
  repoRoot: string;
  pythonExecutable: string;
  lightgbmInferScript: string;
  lightgbmModelPath: string;
  lightgbmModelMetaPath: string;
  lightgbmConfidenceMargin: number | null;
  lightgbmConfidenceDelegationMaxPreDelegationMs: number | null;
  lightgbmRolloutRerankTopK: number | null;
  lightgbmRolloutRerankSamples: number | null;
  lightgbmRolloutRerankMaxScoreMargin: number | null;
  lightgbmRolloutRerankMaxContinuationDecisions: number | null;
};

const DEFAULT_REQUEST_BODY_LIMIT_MB = 25;
const DEFAULT_TELEMETRY_MAX_POST_BYTES = 24 * 1024 * 1024;
const DEFAULT_TELEMETRY_POST_TIMEOUT_MS = 10_000;
const DEFAULT_TELEMETRY_RETRY_ATTEMPTS = 2;
const DEFAULT_TELEMETRY_RETRY_DELAY_MS = 250;
const DEFAULT_TELEMETRY_BACKOFF_MS = 15_000;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseOptionalPositiveNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNonNegativeNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalPositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseOptionalPositiveIntegerWithFallback(
  value: string | undefined,
  fallback: number | null
): number | null {
  if (value === undefined) {
    return fallback;
  }
  return parseOptionalPositiveInteger(value);
}

function parseOptionalNonNegativeNumberWithFallback(
  value: string | undefined,
  fallback: number | null
): number | null {
  if (value === undefined) {
    return fallback;
  }

  return parseOptionalNonNegativeNumber(value);
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

function isUsableExecutable(candidate: string): boolean {
  const result = spawnSync(candidate, ["--version"], {
    stdio: "ignore",
    timeout: 2_000,
    shell: false
  });
  return result.error === undefined && result.status === 0;
}

function resolvePythonExecutable(
  repoRoot: string,
  envValue: string | undefined
): string {
  const rawValue = envValue?.trim();
  if (rawValue && isUsableExecutable(rawValue)) {
    return rawValue;
  }

  const windowsVenvPython = path.join(repoRoot, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(windowsVenvPython) && isUsableExecutable(windowsVenvPython)) {
    return windowsVenvPython;
  }

  const unixVenvPython = path.join(repoRoot, ".venv", "bin", "python");
  if (fs.existsSync(unixVenvPython) && isUsableExecutable(unixVenvPython)) {
    return unixVenvPython;
  }

  if (isUsableExecutable("python")) {
    return "python";
  }

  if (isUsableExecutable("python3")) {
    return "python3";
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
  const repoEnvDefaults = loadRepoEnvDefaults(repoRoot);
  const mergedEnv = {
    ...repoEnvDefaults,
    ...env
  };
  const portValue = Number(mergedEnv.PORT ?? DEFAULT_SERVER_PORT);
  const useRepoDatabaseEnvForRuntime =
    env === process.env &&
    typeof repoEnvDefaults.DATABASE_URL === "string" &&
    repoEnvDefaults.DATABASE_URL.trim().length > 0;
  const useRepoBootstrapEnvForRuntime =
    env === process.env &&
    typeof repoEnvDefaults.PG_BOOTSTRAP_URL === "string" &&
    repoEnvDefaults.PG_BOOTSTRAP_URL.trim().length > 0;
  const databaseUrl = useRepoDatabaseEnvForRuntime
    ? repoEnvDefaults.DATABASE_URL!
    : mergedEnv.DATABASE_URL ?? defaultDatabaseUrl;
  const port = Number.isFinite(portValue) ? portValue : DEFAULT_SERVER_PORT;
  const detected = detectSystemIps();
  const detectedPublicUrl = `http://${detected.detectedDefault}:${port}`;
  const backendBaseUrl =
    parseBooleanEnv(mergedEnv.BACKEND_BASE_URL_OVERRIDE_ENABLED, false)
      ? mergedEnv.BACKEND_BASE_URL_OVERRIDE?.trim() ||
        mergedEnv.BACKEND_BASE_URL?.trim() ||
        detectedPublicUrl
      : mergedEnv.BACKEND_BASE_URL?.trim() || detectedPublicUrl;
  const backendLocalUrl =
    mergedEnv.BACKEND_LOCAL_URL?.trim() || `http://127.0.0.1:${port}`;
  const requestBodyLimit = resolveRequestBodyLimit(mergedEnv);
  const telemetryMaxPostBytes = parsePositiveInteger(
    mergedEnv.TELEMETRY_MAX_POST_BYTES,
    DEFAULT_TELEMETRY_MAX_POST_BYTES
  );
  const simBackendUrl =
    mergedEnv.SIM_BACKEND_URL?.trim() ||
    mergedEnv.BACKEND_URL?.trim() ||
    backendLocalUrl;

  return {
    port,
    host: mergedEnv.HOST?.trim() || "0.0.0.0",
    databaseUrl,
    pgBootstrapUrl:
      (useRepoBootstrapEnvForRuntime
        ? repoEnvDefaults.PG_BOOTSTRAP_URL?.trim()
        : mergedEnv.PG_BOOTSTRAP_URL?.trim()) ||
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
    telemetryRetryAttempts: parsePositiveInteger(
      mergedEnv.TELEMETRY_RETRY_ATTEMPTS,
      DEFAULT_TELEMETRY_RETRY_ATTEMPTS
    ),
    telemetryRetryDelayMs: parsePositiveInteger(
      mergedEnv.TELEMETRY_RETRY_DELAY_MS,
      DEFAULT_TELEMETRY_RETRY_DELAY_MS
    ),
    telemetryBackoffMs: parsePositiveInteger(
      mergedEnv.TELEMETRY_BACKOFF_MS,
      DEFAULT_TELEMETRY_BACKOFF_MS
    ),
    telemetryIngestQueueMaxDepth: parsePositiveInteger(
      mergedEnv.TELEMETRY_INGEST_QUEUE_MAX_DEPTH,
      50000
    ),
    telemetryPersistenceBatchSize: parsePositiveInteger(
      mergedEnv.TELEMETRY_PERSISTENCE_BATCH_SIZE,
      1
    ),
    telemetryPersistenceConcurrency: parsePositiveInteger(
      mergedEnv.TELEMETRY_PERSISTENCE_CONCURRENCY,
      1
    ),
    simDefaultProvider: parseDecisionMode(mergedEnv.SIM_PROVIDER),
    simDefaultBackendUrl: normalizeBackendBaseUrl(simBackendUrl),
    simDefaultExplorationProfile: parseExplorationProfile(
      mergedEnv.TICHU_EXPLORATION_PROFILE,
      "off"
    ),
    simDefaultExplorationRate: parseOptionalPositiveNumber(
      mergedEnv.TICHU_EXPLORATION_RATE
    ),
    simDefaultExplorationTopN: parseOptionalPositiveNumber(
      mergedEnv.TICHU_EXPLORATION_TOP_N
    ),
    simDefaultExplorationMaxScoreGap: parseOptionalNonNegativeNumber(
      mergedEnv.TICHU_EXPLORATION_MAX_SCORE_GAP
    ),
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
    ),
    lightgbmConfidenceMargin: parseOptionalNonNegativeNumberWithFallback(
      mergedEnv.LIGHTGBM_CONFIDENCE_MARGIN,
      1.0
    ),
    lightgbmConfidenceDelegationMaxPreDelegationMs:
      parseOptionalPositiveIntegerWithFallback(
        mergedEnv.LIGHTGBM_CONFIDENCE_DELEGATION_MAX_PRE_DELEGATION_MS,
        1000
      ),
    lightgbmRolloutRerankTopK: parseOptionalPositiveIntegerWithFallback(
      mergedEnv.LIGHTGBM_ROLLOUT_RERANK_TOP_K,
      2
    ),
    lightgbmRolloutRerankSamples: parseOptionalPositiveIntegerWithFallback(
      mergedEnv.LIGHTGBM_ROLLOUT_RERANK_SAMPLES,
      1
    ),
    lightgbmRolloutRerankMaxScoreMargin:
      parseOptionalNonNegativeNumberWithFallback(
        mergedEnv.LIGHTGBM_ROLLOUT_RERANK_MAX_SCORE_MARGIN,
        0.1
      ),
    lightgbmRolloutRerankMaxContinuationDecisions:
      parseOptionalPositiveIntegerWithFallback(
        mergedEnv.LIGHTGBM_ROLLOUT_RERANK_MAX_CONTINUATION_DECISIONS,
        12
      )
  };
}
