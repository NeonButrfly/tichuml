import { getStatus, runMigrations } from "../../../apps/server/src/db/migrations.ts";

async function main() {
  const command = process.argv[2] ?? "up";

  if (command === "status") {
    const statuses = await getStatus();
    for (const migration of statuses) {
      console.log(`${migration.status} ${migration.id}`);
    }
    return;
  }

  if (command === "up") {
    const applied = await runMigrations();
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
