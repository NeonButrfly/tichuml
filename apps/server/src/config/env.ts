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

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  const portValue = Number(env.PORT ?? DEFAULT_SERVER_PORT);
  const databaseUrl = env.DATABASE_URL ?? defaultDatabaseUrl;

  return {
    port: Number.isFinite(portValue) ? portValue : DEFAULT_SERVER_PORT,
    host: env.HOST?.trim() || "0.0.0.0",
    databaseUrl,
    pgBootstrapUrl:
      env.PG_BOOTSTRAP_URL?.trim() || withDatabaseName(databaseUrl, "postgres"),
    allowedOrigin: env.CORS_ALLOW_ORIGIN?.trim() || "*",
    autoBootstrapDatabase: parseBooleanEnv(env.AUTO_BOOTSTRAP_DATABASE, true),
    autoMigrate: parseBooleanEnv(env.AUTO_MIGRATE, true),
    backendBaseUrl: normalizeBackendBaseUrl(
      env.BACKEND_BASE_URL ?? `http://localhost:${portValue}`
    )
  };
}
