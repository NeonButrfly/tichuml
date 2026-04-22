import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SERVER_PORT,
  defaultDatabaseUrl,
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
  simControllerRuntimeDir: string;
  repoRoot: string;
  pythonExecutable: string;
  lightgbmInferScript: string;
  lightgbmModelPath: string;
  lightgbmModelMetaPath: string;
};

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
