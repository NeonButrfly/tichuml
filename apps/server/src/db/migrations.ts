import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { defaultDatabaseUrl } from "@tichuml/shared";
import { createDatabaseClient, type DatabaseClient } from "./postgres.js";

export type MigrationFile = {
  id: string;
  sql: string;
};

function getMigrationsDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../infra/db/migrations"
  );
}

export async function ensureMigrationTable(sql: DatabaseClient): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function readMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await fs.readdir(getMigrationsDir(), { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    fileNames.map(async (fileName) => ({
      id: fileName,
      sql: await fs.readFile(path.join(getMigrationsDir(), fileName), "utf8")
    }))
  );
}

export async function migrateUp(
  sql: DatabaseClient
): Promise<MigrationFile[]> {
  await ensureMigrationTable(sql);

  const appliedRows = await sql<{ id: string }[]>`
    SELECT id
    FROM schema_migrations
    ORDER BY id
  `;
  const applied = new Set(appliedRows.map((row) => row.id));
  const migrations = await readMigrationFiles();
  const pending = migrations.filter((migration) => !applied.has(migration.id));

  for (const migration of pending) {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration.sql);
      await transaction.unsafe(
        "INSERT INTO schema_migrations (id) VALUES ($1)",
        [migration.id]
      );
    });
  }

  return pending;
}

export async function getMigrationStatus(
  sql: DatabaseClient
): Promise<Array<{ id: string; status: "applied" | "pending" }>> {
  await ensureMigrationTable(sql);
  const appliedRows = await sql<{ id: string }[]>`
    SELECT id
    FROM schema_migrations
    ORDER BY id
  `;
  const applied = new Set(appliedRows.map((row) => row.id));
  const migrations = await readMigrationFiles();

  return migrations.map((migration) => ({
    id: migration.id,
    status: applied.has(migration.id) ? "applied" : "pending"
  }));
}

export async function runMigrations(databaseUrl = defaultDatabaseUrl) {
  const sql = createDatabaseClient(databaseUrl);
  try {
    return await migrateUp(sql);
  } finally {
    await sql.end();
  }
}

export async function getStatus(databaseUrl = defaultDatabaseUrl) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await getMigrationStatus(sql);
  } finally {
    await sql.end();
  }
}
