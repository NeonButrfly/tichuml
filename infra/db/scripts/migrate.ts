import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { defaultDatabaseUrl } from "@tichuml/shared";

const migrationsDir = path.resolve("infra/db/migrations");
type DatabaseClient = ReturnType<typeof postgres>;

type MigrationFile = {
  id: string;
  sql: string;
};

async function ensureMigrationTable(sql: DatabaseClient) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (fileName) => ({
      id: fileName,
      sql: await fs.readFile(path.join(migrationsDir, fileName), "utf8")
    }))
  );
}

async function up(sql: DatabaseClient) {
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
      await transaction`
        INSERT INTO schema_migrations (id)
        VALUES (${migration.id})
      `;
    });
  }

  console.log(
    pending.length === 0
      ? "No pending migrations."
      : `Applied ${pending.length} migration(s): ${pending
          .map((migration) => migration.id)
          .join(", ")}`
  );
}

async function status(sql: DatabaseClient) {
  await ensureMigrationTable(sql);

  const appliedRows = await sql<{ id: string }[]>`
    SELECT id
    FROM schema_migrations
    ORDER BY id
  `;
  const applied = new Set(appliedRows.map((row) => row.id));
  const migrations = await readMigrationFiles();

  for (const migration of migrations) {
    console.log(`${applied.has(migration.id) ? "applied" : "pending"} ${migration.id}`);
  }
}

async function main() {
  const command = process.argv[2] ?? "up";
  const sql = postgres(defaultDatabaseUrl, {
    max: 1
  });

  try {
    if (command === "status") {
      await status(sql);
      return;
    }

    if (command === "up") {
      await up(sql);
      return;
    }

    throw new Error(`Unsupported migration command: ${command}`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
