import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "../apps/server/src/db/postgres.js";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";
import {
  finalizeTelemetryResults,
  validateTelemetryTrainingData
} from "../apps/server/src/services/telemetry-outcome-finalizer.js";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
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
    if (hasFlag("--finalize-first")) {
      await finalizeTelemetryResults(sql);
    }
    const summary = await validateTelemetryTrainingData(sql);
    console.log("Telemetry training-data validation");
    console.log(`- decisions: ${summary.coverage.decisions}`);
    console.log(`- state_features coverage: ${summary.coverage.state_features_coverage}`);
    console.log(`- candidate_scores coverage: ${summary.coverage.candidate_scores_coverage}`);
    console.log(`- chosen_action_type coverage: ${summary.coverage.chosen_action_type_coverage}`);
    console.log(`- hand_result coverage: ${summary.coverage.hand_result_coverage}`);
    console.log(`- game_result coverage: ${summary.coverage.game_result_coverage}`);
    console.log(`- outcome_reward coverage: ${summary.coverage.outcome_reward_coverage}`);
    console.log(`- pass rate / pass with legal play: ${summary.coverage.pass_turn_rate} / ${summary.coverage.pass_turn_with_legal_play_rate}`);
    console.log(`- call_tichu / decline_grand_tichu / call_grand_tichu: ${summary.coverage.call_tichu_rate} / ${summary.coverage.decline_grand_tichu_rate} / ${summary.coverage.grand_tichu_call_rate}`);
    console.log(`- reward min/avg/max: ${summary.rewardStats.min ?? "null"} / ${summary.rewardStats.avg ?? "null"} / ${summary.rewardStats.max ?? "null"}`);
    console.log(`- aggression counts: ${JSON.stringify(summary.aggressionComponentCounts)}`);
    for (const warning of summary.warnings) {
      console.log(`- warning: ${warning}`);
    }
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
