import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";

type Args = {
  backendUrl: string | null;
  databaseUrl: string | null;
  jsonOutput: string | null;
};

type TableStatsRow = {
  relname: string;
  n_live_tup: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_dead_tup: number;
};

type WalStatsRow = {
  wal_records: number | null;
  wal_bytes: string | number | null;
  wal_write: number | null;
  wal_sync: number | null;
};

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function argValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function parseArgs(argv: string[]): Args {
  return {
    backendUrl: argValue(argv, "--backend-url"),
    databaseUrl: argValue(argv, "--database-url"),
    jsonOutput: argValue(argv, "--json-output")
  };
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

function sanitizeDatabaseUrl(value: string): string {
  return value.replace(/\/\/([^:/@]+):([^@/]+)@/u, "//$1:***@");
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(6));
}

function asNumber(value: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchTelemetryHealth(backendUrl: string | null): Promise<unknown> {
  if (!backendUrl) {
    return null;
  }
  const response = await fetch(
    `${backendUrl.replace(/\/+$/u, "")}/api/telemetry/health`
  );
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: text
    };
  }
  return text.length > 0 ? JSON.parse(text) : null;
}

function printSummary(summary: Record<string, unknown>): void {
  const completed = summary.completed as Record<string, unknown>;
  const ratios = summary.ratios as Record<string, unknown>;
  const tables = summary.tables as Record<string, TableStatsRow>;
  const wal = summary.wal as Record<string, unknown>;

  console.log("Telemetry write amplification");
  console.log(`- completed games: ${completed.completed_games}`);
  console.log(`- completed hands: ${completed.completed_hands}`);
  console.log(`- avg seconds/game: ${completed.avg_seconds_per_game}`);
  console.log(`- avg seconds/hand: ${completed.avg_seconds_per_hand}`);
  console.log(
    `- matches live/inserts/updates/dead: ${tables.matches?.n_live_tup ?? 0} / ${tables.matches?.n_tup_ins ?? 0} / ${tables.matches?.n_tup_upd ?? 0} / ${tables.matches?.n_dead_tup ?? 0}`
  );
  console.log(
    `- decisions live/inserts/updates/dead: ${tables.decisions?.n_live_tup ?? 0} / ${tables.decisions?.n_tup_ins ?? 0} / ${tables.decisions?.n_tup_upd ?? 0} / ${tables.decisions?.n_dead_tup ?? 0}`
  );
  console.log(
    `- events live/inserts/updates/dead: ${tables.events?.n_live_tup ?? 0} / ${tables.events?.n_tup_ins ?? 0} / ${tables.events?.n_tup_upd ?? 0} / ${tables.events?.n_dead_tup ?? 0}`
  );
  console.log(`- wal syncs: ${wal.wal_sync}`);
  console.log(`- wal writes: ${wal.wal_write}`);
  console.log(`- wal bytes: ${wal.wal_bytes}`);
  console.log(
    `- matches updates/completed game: ${ratios.matches_updates_per_completed_game}`
  );
  console.log(
    `- decision updates/decision insert: ${ratios.decision_updates_per_decision_insert}`
  );
  console.log(
    `- wal syncs/telemetry row: ${ratios.wal_syncs_per_telemetry_row}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(args.databaseUrl);
  const sql = postgres(databaseUrl, {
    idle_timeout: 5,
    max: 3,
    connect_timeout: 10
  });

  try {
    const tableRows = await sql<TableStatsRow[]>`
      SELECT
        relname,
        n_live_tup::INTEGER AS n_live_tup,
        n_tup_ins::INTEGER AS n_tup_ins,
        n_tup_upd::INTEGER AS n_tup_upd,
        n_dead_tup::INTEGER AS n_dead_tup
      FROM pg_stat_user_tables
      WHERE relname IN ('matches', 'decisions', 'events')
      ORDER BY relname ASC
    `;
    const tableStats = Object.fromEntries(
      tableRows.map((row) => [row.relname, row])
    ) as Record<string, TableStatsRow>;

    const [completed] = await sql<Array<{
      completed_games: number;
      completed_hands: number;
      avg_seconds_per_game: number | null;
      avg_seconds_per_hand: number | null;
    }>>`
      SELECT
        COUNT(*) FILTER (
          WHERE completed_at IS NOT NULL OR status IN ('completed', 'failed')
        )::INTEGER AS completed_games,
        COALESCE(
          SUM(COALESCE(hands_played, 0)) FILTER (
            WHERE completed_at IS NOT NULL OR status IN ('completed', 'failed')
          ),
          0
        )::INTEGER AS completed_hands,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
          WHERE completed_at IS NOT NULL
            AND started_at IS NOT NULL
        )::DOUBLE PRECISION AS avg_seconds_per_game,
        AVG(
          EXTRACT(EPOCH FROM (completed_at - started_at)) /
          NULLIF(hands_played, 0)
        ) FILTER (
          WHERE completed_at IS NOT NULL
            AND started_at IS NOT NULL
            AND hands_played IS NOT NULL
            AND hands_played > 0
        )::DOUBLE PRECISION AS avg_seconds_per_hand
      FROM matches
    `;

    let wal: WalStatsRow = {
      wal_records: null,
      wal_bytes: null,
      wal_write: null,
      wal_sync: null
    };
    try {
      const [walRow] = await sql<WalStatsRow[]>`
        SELECT
          wal_records::BIGINT AS wal_records,
          wal_bytes::TEXT AS wal_bytes,
          wal_write::BIGINT AS wal_write,
          wal_sync::BIGINT AS wal_sync
        FROM pg_stat_wal
      `;
      wal = walRow ?? wal;
    } catch (error) {
      wal = {
        ...wal,
        wal_bytes: error instanceof Error ? error.message : String(error)
      };
    }

    const telemetryRows =
      (tableStats.decisions?.n_tup_ins ?? 0) + (tableStats.events?.n_tup_ins ?? 0);
    const ratios = {
      matches_updates_per_completed_game: safeRatio(
        tableStats.matches?.n_tup_upd ?? 0,
        completed?.completed_games ?? 0
      ),
      decision_updates_per_decision_insert: safeRatio(
        tableStats.decisions?.n_tup_upd ?? 0,
        tableStats.decisions?.n_tup_ins ?? 0
      ),
      wal_syncs_per_telemetry_row: safeRatio(wal.wal_sync, telemetryRows)
    };

    const telemetryHealth = await fetchTelemetryHealth(args.backendUrl).catch(
      (error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );

    const summary = {
      ok: true,
      generated_at: new Date().toISOString(),
      database_url: sanitizeDatabaseUrl(databaseUrl),
      backend_url: args.backendUrl,
      completed: {
        completed_games: completed?.completed_games ?? 0,
        completed_hands: completed?.completed_hands ?? 0,
        avg_seconds_per_game: completed?.avg_seconds_per_game ?? null,
        avg_seconds_per_hand: completed?.avg_seconds_per_hand ?? null
      },
      tables: {
        matches: tableStats.matches ?? null,
        decisions: tableStats.decisions ?? null,
        events: tableStats.events ?? null
      },
      wal: {
        wal_records: wal.wal_records,
        wal_bytes: asNumber(wal.wal_bytes),
        wal_write: wal.wal_write,
        wal_sync: wal.wal_sync
      },
      ratios,
      telemetry_health: telemetryHealth
    };

    printSummary(summary);
    console.log(JSON.stringify(summary, null, 2));

    if (args.jsonOutput) {
      await fs.mkdir(path.dirname(path.resolve(args.jsonOutput)), {
        recursive: true
      });
      await fs.writeFile(args.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`);
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
