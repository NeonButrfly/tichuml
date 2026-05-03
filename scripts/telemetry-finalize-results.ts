import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "../apps/server/src/db/postgres.js";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";
import { finalizeTelemetryResults } from "../apps/server/src/services/telemetry-outcome-finalizer.js";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveDatabaseUrl(explicit: string | null): string {
  if (explicit) {
    return explicit;
  }
  const root = repoRoot();
  const diskEnv = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, "apps/server/.env"))
  };
  const databaseUrl =
    process.env.DATABASE_URL_OVERRIDE_ENABLED === "true"
      ? process.env.DATABASE_URL
      : (diskEnv.DATABASE_URL ?? process.env.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Pass --database-url or configure .env."
    );
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const sql = createDatabaseClient(resolveDatabaseUrl(readArg("--database-url")));
  try {
    const summary = await finalizeTelemetryResults(sql);
    console.log("Telemetry outcome finalization summary");
    console.log(`- decisions: ${summary.decisions}`);
    console.log(`- trick attributed: ${summary.trickAttributed}`);
    console.log(`- hand attributed: ${summary.handAttributed}`);
    console.log(`- game attributed: ${summary.gameAttributed}`);
    console.log(`- reward attributed: ${summary.rewardAttributed}`);
    console.log(`- attribution exact/range/unknown: ${summary.exactAttribution}/${summary.rangeAttribution}/${summary.unknownAttribution}`);
    console.log(`- reward min/avg/max: ${summary.rewardMin ?? "null"} / ${summary.rewardAvg ?? "null"} / ${summary.rewardMax ?? "null"}`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
