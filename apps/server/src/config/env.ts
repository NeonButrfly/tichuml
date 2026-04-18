import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SERVER_PORT,
  defaultDatabaseUrl,
  normalizeBackendBaseUrl,
  parseBooleanEnv
} from "@tichuml/shared";

export type ServerConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  pgBootstrapUrl: string;
  allowedOrigin: string;
  autoBootstrapDatabase: boolean;
  autoMigrate: boolean;
  backendBaseUrl: string;
};

export function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
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

  return {
    port: Number.isFinite(portValue) ? portValue : DEFAULT_SERVER_PORT,
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
    backendBaseUrl: normalizeBackendBaseUrl(
      mergedEnv.BACKEND_BASE_URL ?? `http://localhost:${portValue}`
    )
  };
}
