import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "../../../apps/server/src/config/env-file.ts";

function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function resolveDatabaseUrl(): string | undefined {
  const repoRoot = getRepoRoot();
  const diskEnv = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, "apps/server/.env"))
  };
  if (process.env.DATABASE_URL_OVERRIDE_ENABLED === "true") {
    return process.env.DATABASE_URL;
  }
  return diskEnv.DATABASE_URL ?? process.env.DATABASE_URL;
}

async function main() {
  const command = process.argv[2] ?? "up";
  const databaseUrl = resolveDatabaseUrl();
  const { getStatus, runMigrations } = await import(
    "../../../apps/server/src/db/migrations.ts"
  );

  if (command === "status") {
    const statuses = await getStatus(databaseUrl);
    for (const migration of statuses) {
      console.log(`${migration.status} ${migration.id}`);
    }
    return;
  }

  if (command === "up") {
    const applied = await runMigrations(databaseUrl);
    console.log(
      applied.length === 0
        ? "No pending migrations."
        : `Applied ${applied.length} migration(s): ${applied
            .map((migration) => migration.id)
            .join(", ")}`
    );
    return;
  }

  throw new Error(`Unsupported migration command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
