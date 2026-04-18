import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createDatabaseClient } from "./postgres.js";
import { runMigrations } from "./migrations.js";
import { getRepoRoot } from "../config/env.js";

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "");
}

function escapeIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function extractErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function extractNestedErrors(error: unknown): unknown[] {
  if (error instanceof AggregateError) {
    return error.errors;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    return error.errors;
  }

  return [];
}

function isConnectionRefusedError(error: unknown): boolean {
  if (extractErrorCode(error) === "ECONNREFUSED") {
    return true;
  }

  return extractNestedErrors(error).some(
    (nestedError) => extractErrorCode(nestedError) === "ECONNREFUSED"
  );
}

async function canConnect(databaseUrl: string): Promise<boolean> {
  const sql = createDatabaseClient(databaseUrl);
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 0 });
  }
}

async function startDockerPostgres(): Promise<void> {
  const repoRoot = getRepoRoot();
  const composeFile = path.join(repoRoot, "infra/docker/docker-compose.yml");
  const envFile = path.join(repoRoot, ".env");
  const args = ["compose", "-f", composeFile];

  if (fs.existsSync(envFile)) {
    args.push("--env-file", envFile);
  }

  args.push("up", "-d", "postgres");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to launch Docker while starting Postgres: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim().length > 0
            ? `docker compose failed while starting Postgres: ${stderr.trim()}`
            : `docker compose exited with code ${code} while starting Postgres.`
        )
      );
    });
  });
}

async function waitForPostgres(
  databaseUrl: string,
  timeoutMs = 60_000,
  pollIntervalMs = 2_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await canConnect(databaseUrl)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Postgres did not become reachable at ${databaseUrl} within ${timeoutMs}ms.`
  );
}

async function ensureBootstrapConnection(
  bootstrapUrl: string,
  autoBootstrapDatabase: boolean
): Promise<void> {
  if (await canConnect(bootstrapUrl)) {
    return;
  }

  if (!autoBootstrapDatabase) {
    throw new Error(
      `Postgres is not reachable at ${bootstrapUrl}. Start the database or enable AUTO_BOOTSTRAP_DATABASE.`
    );
  }

  await startDockerPostgres();
  await waitForPostgres(bootstrapUrl);
}

export async function ensureDatabaseExists(
  databaseUrl: string,
  bootstrapUrl: string
): Promise<void> {
  const targetDatabaseName = getDatabaseName(databaseUrl);
  const bootstrapSql = createDatabaseClient(bootstrapUrl);

  try {
    const rows = await bootstrapSql<{ datname: string }[]>`
      SELECT datname
      FROM pg_database
      WHERE datname = ${targetDatabaseName}
    `;
    if (rows.length > 0) {
      return;
    }

    await bootstrapSql.unsafe(
      `CREATE DATABASE ${escapeIdentifier(targetDatabaseName)}`
    );
  } finally {
    await bootstrapSql.end();
  }
}

export async function ensureDatabaseReady(config: {
  databaseUrl: string;
  bootstrapUrl: string;
  autoBootstrapDatabase: boolean;
  autoMigrate: boolean;
}): Promise<void> {
  try {
    await ensureBootstrapConnection(
      config.bootstrapUrl,
      config.autoBootstrapDatabase
    );
  } catch (error) {
    if (!isConnectionRefusedError(error)) {
      throw error;
    }

    await ensureBootstrapConnection(
      config.bootstrapUrl,
      config.autoBootstrapDatabase
    );
  }

  if (config.autoBootstrapDatabase) {
    await ensureDatabaseExists(config.databaseUrl, config.bootstrapUrl);
  }

  if (config.autoMigrate) {
    await waitForPostgres(config.databaseUrl);
    await runMigrations(config.databaseUrl);
  }
}
