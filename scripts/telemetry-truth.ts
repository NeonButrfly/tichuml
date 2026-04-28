import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";

type Args = {
  backendUrl: string | null;
  requireRows: boolean;
};

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function argValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function parseArgs(argv: string[]): Args {
  return {
    backendUrl: argValue(argv, "--backend-url"),
    requireRows: argv.includes("--require-rows")
  };
}

function resolveDatabaseUrl(): string {
  const root = repoRoot();
  const diskEnv = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, "apps/server/.env"))
  };
  const databaseUrl = process.env.DATABASE_URL_OVERRIDE_ENABLED === "true"
    ? process.env.DATABASE_URL
    : diskEnv.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return databaseUrl;
}

function sanitizeDatabaseUrl(value: string): string {
  return value.replace(/\/\/([^:/@]+):([^@/]+)@/u, "//$1:***@");
}

async function fetchTelemetryHealth(backendUrl: string | null): Promise<unknown> {
  if (!backendUrl) {
    return null;
  }
  const response = await fetch(`${backendUrl.replace(/\/$/u, "")}/api/telemetry/health`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Telemetry health returned ${response.status}: ${text}`);
  }
  return text.length > 0 ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl();
  const sql = postgres(databaseUrl, {
    idle_timeout: 5,
    max: 2,
    connect_timeout: 10
  });

  try {
    const [counts] = await sql<Array<{
      decisions: number;
      events: number;
      matches: number;
      latest_decision_ts: string | null;
      latest_event_ts: string | null;
      latest_match_ts: string | null;
    }>>`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM decisions) AS decisions,
        (SELECT COUNT(*)::INTEGER FROM events) AS events,
        (SELECT COUNT(*)::INTEGER FROM matches) AS matches,
        (SELECT MAX(ts)::TEXT FROM decisions) AS latest_decision_ts,
        (SELECT MAX(ts)::TEXT FROM events) AS latest_event_ts,
        (SELECT MAX(COALESCE(completed_at, updated_at, started_at, created_at))::TEXT FROM matches) AS latest_match_ts
    `;
    const [joins] = await sql<Array<{
      decisions_without_match: number;
      events_without_match: number;
      distinct_decision_games_without_match: number;
      distinct_event_games_without_match: number;
    }>>`
      SELECT
        (
          SELECT COUNT(*)::INTEGER
          FROM decisions d
          LEFT JOIN matches m ON d.match_id = m.id
          WHERE d.match_id IS NULL OR m.id IS NULL OR m.game_id <> d.game_id
        ) AS decisions_without_match,
        (
          SELECT COUNT(*)::INTEGER
          FROM events e
          LEFT JOIN matches m ON e.match_id = m.id
          WHERE e.match_id IS NULL OR m.id IS NULL OR m.game_id <> e.game_id
        ) AS events_without_match,
        (
          SELECT COUNT(DISTINCT d.game_id)::INTEGER
          FROM decisions d
          LEFT JOIN matches m ON m.game_id = d.game_id
          WHERE m.id IS NULL
        ) AS distinct_decision_games_without_match,
        (
          SELECT COUNT(DISTINCT e.game_id)::INTEGER
          FROM events e
          LEFT JOIN matches m ON m.game_id = e.game_id
          WHERE m.id IS NULL
        ) AS distinct_event_games_without_match
    `;
    const telemetryHealth = await fetchTelemetryHealth(args.backendUrl).catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    }));
    const rowCounts = counts ?? {
      decisions: 0,
      events: 0,
      matches: 0,
      latest_decision_ts: null,
      latest_event_ts: null,
      latest_match_ts: null
    };
    const joinCounts = joins ?? {
      decisions_without_match: 0,
      events_without_match: 0,
      distinct_decision_games_without_match: 0,
      distinct_event_games_without_match: 0
    };
    const ok =
      joinCounts.decisions_without_match === 0 &&
      joinCounts.events_without_match === 0 &&
      joinCounts.distinct_decision_games_without_match === 0 &&
      joinCounts.distinct_event_games_without_match === 0 &&
      (!args.requireRows ||
        (rowCounts.decisions > 0 && rowCounts.events > 0 && rowCounts.matches > 0));
    const summary = {
      ok,
      database_url: sanitizeDatabaseUrl(databaseUrl),
      require_rows: args.requireRows,
      counts: rowCounts,
      joins: joinCounts,
      telemetry_health: telemetryHealth
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!ok) {
      process.exitCode = 1;
    }
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
