import { createDatabaseClient } from "./postgres.js";
import { runMigrations } from "./migrations.js";

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "");
}

function escapeIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
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
  if (config.autoBootstrapDatabase) {
    await ensureDatabaseExists(config.databaseUrl, config.bootstrapUrl);
  }

  if (config.autoMigrate) {
    await runMigrations(config.databaseUrl);
  }
}
