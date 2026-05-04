import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import postgres from "postgres";
import {
  buildTrainingBatchId,
  buildTrainingGameIdPrefix,
  buildTrainingRunId,
  buildTrainingSeedHash,
  buildTrainingSessionName,
  deriveTrainingBatchSeed,
  sanitizeSessionName,
} from "@tichuml/shared";
import { generateEntropySeed } from "../apps/server/src/entropy/index.js";
import {
  computeRemainingRequestedGames,
  runStreamingProcess,
} from "./lib/training-runner.js";

type CliOptions = Record<string, string | boolean>;
type TrainingMetadata = Record<string, unknown>;
type TableCounts = Record<"matches" | "decisions" | "events", number>;
type VerificationSnapshot = {
  run_id: string;
  game_id_prefix: string;
  requested_games: number;
  global_counts: TableCounts;
  scoped_counts: TableCounts;
  global_delta_from_baseline: TableCounts;
  scoped_delta_from_baseline: TableCounts;
  telemetry_flowing: boolean;
};

const TRAINING_CLEAR_SQL =
  "TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;";
const REQUIRED_TABLES = ["events", "decisions", "matches"] as const;

function parseCliOptions(argv: string[]): {
  command: string;
  options: CliOptions;
} {
  const [command = "", ...rest] = argv;
  const options: CliOptions = {};
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry.startsWith("--")) {
      continue;
    }
    const key = entry.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function optionString(
  options: CliOptions,
  key: string,
  fallback?: string
): string {
  const value = options[key];
  if (typeof value === "string") {
    return value;
  }
  if (value === true) {
    return "true";
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required option --${key}`);
}

function optionOptionalString(
  options: CliOptions,
  key: string
): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionBoolean(
  options: CliOptions,
  key: string,
  fallback = false
): boolean {
  const value = options[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function optionNumber(
  options: CliOptions,
  key: string,
  fallback: number
): number {
  const value = options[key];
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function resolvePassword(options: CliOptions): string {
  const filePath = optionOptionalString(options, "pg-password-file");
  if (filePath) {
    return fs.readFileSync(path.resolve(filePath), "utf8").trim();
  }
  return optionString(options, "pg-password");
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendLine(filePath: string, line: string): void {
  ensureParent(filePath);
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function writeJson(filePath: string, payload: unknown): void {
  ensureParent(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function loadMetadata(metadataFile: string): TrainingMetadata {
  const raw = fs.readFileSync(metadataFile, "utf8").replace(/^\uFEFF/u, "");
  return JSON.parse(raw) as TrainingMetadata;
}

function saveMetadata(metadataFile: string, metadata: TrainingMetadata): void {
  writeJson(metadataFile, metadata);
}

function metadataString(metadata: TrainingMetadata, key: string): string {
  const value = metadata[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected metadata.${key} to be a non-empty string.`);
  }
  return value;
}

function metadataBoolean(metadata: TrainingMetadata, key: string): boolean {
  return metadata[key] === true;
}

function metadataNumber(metadata: TrainingMetadata, key: string): number {
  const value = metadata[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected metadata.${key} to be a finite number.`);
  }
  return value;
}

function metadataOptionalNumber(
  metadata: TrainingMetadata,
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gitOutput(repoRoot: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/u.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function formatCommandForLog(command: string, args: string[]): string {
  return [command, ...args].map((part) => quoteShellArg(part)).join(" ");
}

function toForwardSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function createDatabaseClient(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}) {
  return postgres({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: config.database,
    max: 1,
    prepare: false,
    idle_timeout: 5,
  });
}

async function collectTableCounts(sql: ReturnType<typeof createDatabaseClient>): Promise<TableCounts> {
  const [matches] = await sql<{ row_count: string }[]>`SELECT count(*)::text AS row_count FROM matches`;
  const [decisions] = await sql<{ row_count: string }[]>`SELECT count(*)::text AS row_count FROM decisions`;
  const [events] = await sql<{ row_count: string }[]>`SELECT count(*)::text AS row_count FROM events`;
  return {
    matches: Number(matches?.row_count ?? 0),
    decisions: Number(decisions?.row_count ?? 0),
    events: Number(events?.row_count ?? 0),
  };
}

async function verifyRequiredTables(sql: ReturnType<typeof createDatabaseClient>): Promise<void> {
  const rows = await sql.unsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('events', 'decisions', 'matches')"
  );
  const seen = new Set(rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((tableName) => !seen.has(tableName));
  if (missing.length > 0) {
    throw new Error(`Training data tables are missing: ${missing.join(", ")}`);
  }
}

async function currentDatabaseName(sql: ReturnType<typeof createDatabaseClient>): Promise<string> {
  const [row] = await sql<{ current_database: string }[]>`
    SELECT current_database() AS current_database
  `;
  return row?.current_database ?? "";
}

async function backendHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function scopePrefix(metadata: TrainingMetadata): string {
  return metadataString(metadata, "game_id_prefix");
}

async function collectScopedCounts(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<TableCounts> {
  const likeValue = `${prefix}%`;
  const [matches] = await sql<{ row_count: string }[]>`
    SELECT count(*)::text AS row_count FROM matches WHERE game_id LIKE ${likeValue}
  `;
  const [decisions] = await sql<{ row_count: string }[]>`
    SELECT count(*)::text AS row_count FROM decisions WHERE game_id LIKE ${likeValue}
  `;
  const [events] = await sql<{ row_count: string }[]>`
    SELECT count(*)::text AS row_count FROM events WHERE game_id LIKE ${likeValue}
  `;
  return {
    matches: Number(matches?.row_count ?? 0),
    decisions: Number(decisions?.row_count ?? 0),
    events: Number(events?.row_count ?? 0),
  };
}

async function buildVerificationSnapshot(
  metadata: TrainingMetadata,
  sql: ReturnType<typeof createDatabaseClient>
): Promise<VerificationSnapshot> {
  const prefix = scopePrefix(metadata);
  const globalCounts = await collectTableCounts(sql);
  const scopedCounts = await collectScopedCounts(sql, prefix);
  const baseline =
    (metadata.post_clear_counts as TableCounts | null) ??
    (metadata.pre_clear_counts as TableCounts | null) ?? {
      matches: 0,
      decisions: 0,
      events: 0,
    };
  const requestedGames =
    metadataOptionalNumber(metadata, "requested_games") ??
    metadataNumber(metadata, "games_per_batch");
  return {
    run_id: metadataString(metadata, "run_id"),
    game_id_prefix: prefix,
    requested_games: requestedGames,
    global_counts: globalCounts,
    scoped_counts: scopedCounts,
    global_delta_from_baseline: {
      matches: globalCounts.matches - baseline.matches,
      decisions: globalCounts.decisions - baseline.decisions,
      events: globalCounts.events - baseline.events,
    },
    scoped_delta_from_baseline: scopedCounts,
    telemetry_flowing: scopedCounts.decisions > 0 && scopedCounts.events > 0,
  };
}

function logVerification(
  verificationLog: string,
  payload: Record<string, unknown>
): void {
  appendLine(verificationLog, JSON.stringify({ ts: nowIso(), ...payload }));
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHandNumberFromHandId(handId: string | null): number | null {
  if (!handId) {
    return null;
  }
  const match = /-hand-(\d+)$/u.exec(handId);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function renderLastTenGames(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<string> {
  const likeValue = `${prefix}%`;
  const rows = await sql<
    Array<{
      game_id: string;
      latest_hand_id: string | null;
      decisions: number;
      events: number;
      match_hands: number | null;
      match_ns_score: number | null;
      match_ew_score: number | null;
      match_winner: string | null;
      last_event: string | null;
      state_norm: Record<string, unknown> | null;
    }>
  >`
    WITH decision_counts AS (
      SELECT game_id, count(*)::int AS decisions
      FROM decisions
      WHERE game_id LIKE ${likeValue}
      GROUP BY game_id
    ),
    event_counts AS (
      SELECT game_id, count(*)::int AS events, max(ts)::text AS last_event
      FROM events
      WHERE game_id LIKE ${likeValue}
      GROUP BY game_id
    ),
    latest_events AS (
      SELECT DISTINCT ON (game_id)
        game_id,
        hand_id AS latest_hand_id,
        ts::text AS last_event,
        state_norm
      FROM events
      WHERE game_id LIKE ${likeValue}
      ORDER BY game_id ASC, ts DESC, event_index DESC
    )
    SELECT
      e.game_id,
      l.latest_hand_id,
      COALESCE(d.decisions, 0) AS decisions,
      e.events,
      m.hands_played AS match_hands,
      m.final_team_0_score AS match_ns_score,
      m.final_team_1_score AS match_ew_score,
      m.winner_team AS match_winner,
      l.last_event,
      l.state_norm
    FROM event_counts e
    LEFT JOIN decision_counts d ON d.game_id = e.game_id
    LEFT JOIN latest_events l ON l.game_id = e.game_id
    LEFT JOIN matches m ON m.game_id = e.game_id
    ORDER BY l.last_event DESC NULLS LAST, e.game_id DESC
    LIMIT 10
  `;

  const lines = [
    `Last 10 games for ${prefix}:`,
    "game_id\thands\tdecisions\tevents\tns_score\tew_score\twinner\tlast_event",
  ];
  for (const row of rows) {
    const stateNorm =
      row.state_norm && typeof row.state_norm === "object" ? row.state_norm : null;
    const stateMatchScore =
      stateNorm && typeof stateNorm.matchScore === "object"
        ? (stateNorm.matchScore as Record<string, unknown>)
        : null;
    const hands =
      parseHandNumberFromHandId(row.latest_hand_id) ??
      (typeof row.match_hands === "number" && row.match_hands > 0
        ? row.match_hands
        : null);
    const nsScore =
      readFiniteNumber(stateMatchScore?.["team-0"]) ??
      readFiniteNumber(row.match_ns_score);
    const ewScore =
      readFiniteNumber(stateMatchScore?.["team-1"]) ??
      readFiniteNumber(row.match_ew_score);
    const winner =
      (typeof stateNorm?.matchWinner === "string" && stateNorm.matchWinner) ||
      row.match_winner ||
      "";
    lines.push(
      [
        row.game_id,
        hands ?? "",
        row.decisions,
        row.events,
        nsScore ?? "",
        ewScore ?? "",
        winner,
        row.last_event ?? "",
      ].join("\t")
    );
  }
  return lines.join("\n");
}

function buildScopedSelect(table: "matches" | "decisions" | "events", prefix: string): string {
  return `SELECT * FROM ${table} WHERE game_id LIKE '${escapeSqlLiteral(prefix)}%' ORDER BY game_id ASC`;
}

function buildDatabaseUrl(metadata: TrainingMetadata, password: string): string {
  const host = encodeURIComponent(metadataString(metadata, "pg_host"));
  const port = encodeURIComponent(metadataString(metadata, "pg_port"));
  const user = encodeURIComponent(metadataString(metadata, "pg_user"));
  const database = encodeURIComponent(metadataString(metadata, "pg_db"));
  const encodedPassword = encodeURIComponent(password);
  return `postgres://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

function runPsqlCopy(config: {
  host: string;
  port: string;
  user: string;
  database: string;
  password: string;
  query: string;
  outputFile: string;
}): void {
  ensureParent(config.outputFile);
  const command = `\\copy (${config.query}) TO '${escapeSqlLiteral(
    toForwardSlashes(config.outputFile)
  )}' WITH CSV HEADER`;
  const result = spawnSync(
    "psql",
    [
      "-h",
      config.host,
      "-p",
      config.port,
      "-U",
      config.user,
      "-d",
      config.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      command,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: config.password,
      },
      encoding: "utf8",
      windowsHide: true,
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `psql export failed for ${config.outputFile}: ${(result.stderr ?? result.stdout ?? "").trim()}`
    );
  }
}

function spawnNpm(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  }
) {
  return spawnSync("npm", args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

async function runMlExportCheck(metadata: TrainingMetadata): Promise<Record<string, unknown>> {
  const repoRoot = metadataString(metadata, "repo_root");
  const mlExportCommand = metadataString(metadata, "ml_export_command");
  const runId = metadataString(metadata, "run_id");
  const gameIdPrefix = metadataString(metadata, "game_id_prefix");
  const outputDir = path.join(metadataString(metadata, "run_directory"), "ml");
  const logFile = metadataString(metadata, "ml_export_check_log");
  const summaryFile = metadataString(metadata, "ml_export_check_summary_file");

  const fullArgs = [
    "run",
    "ml:export",
    "--",
    "--validate-only",
    "--run-id",
    runId,
    "--game-id-prefix",
    gameIdPrefix,
    "--output-dir",
    outputDir,
  ];
  appendLine(logFile, `Running validation command at ${nowIso()}`);
  appendLine(logFile, `npm run ml:export -- --validate-only --run-id ${runId} --game-id-prefix ${gameIdPrefix} --output-dir ${outputDir}`);
  const pgPasswordFile = path.join(path.dirname(metadataString(metadata, "stop_file")), "pg-password.txt");
  const databaseUrl =
    fs.existsSync(pgPasswordFile)
      ? buildDatabaseUrl(metadata, fs.readFileSync(pgPasswordFile, "utf8").trim())
      : null;
  const result = spawnNpm(fullArgs, {
    cwd: repoRoot,
    env: databaseUrl
      ? {
          ...process.env,
          TRAINING_DATABASE_URL: databaseUrl,
        }
      : process.env,
  });
  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (combinedOutput.length > 0) {
    appendLine(logFile, combinedOutput);
  }
  const summaryText = (result.stdout ?? "").trim().split(/\r?\n/u).at(-1) ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(summaryText) as Record<string, unknown>;
  } catch {
    parsed = {
      accepted: false,
      validation_status: "failed",
      validation_errors: ["Unable to parse ml:export validation output."],
      raw_output: combinedOutput,
    };
  }
  const summary = {
    run_id: runId,
    game_id_prefix: gameIdPrefix,
    ml_export_command: mlExportCommand,
    ...parsed,
  };
  writeJson(summaryFile, summary);
  return summary;
}

async function prepareRun(options: CliOptions): Promise<void> {
  const repoRoot = path.resolve(optionString(options, "repo-root"));
  const startedAt = new Date();
  const sessionNameInput = optionOptionalString(options, "session-name");
  let seed = "";
  let seedHash = "";
  let providerFallback = false;
  let providerFallbackReason: string | null = null;
  let runSeedInfo: Record<string, unknown> | null = null;
  const originalLog = console.log;
  const originalInfo = console.info;
  console.log = (...args: unknown[]) => {
    console.error(...args);
  };
  console.info = (...args: unknown[]) => {
    console.error(...args);
  };

  try {
    try {
      const entropy = await generateEntropySeed({ roundIndex: 0 });
      seed = entropy.shuffleSeedHex;
      seedHash = buildTrainingSeedHash(seed);
      runSeedInfo = {
        mode: "automatic_entropy",
        resolved_run_seed: entropy.shuffleSeedHex,
        derivation_namespace: "training-data",
        manual_override_enabled: false,
        manual_override_seed: null,
        generated_at: startedAt.toISOString(),
        entropy_game_id: entropy.gameId,
        audit_hash_hex: entropy.auditHashHex,
        primary_provider: entropy.provenance.primaryProvider,
        local_fallback_used: entropy.provenance.localFallbackUsed,
        source_summary: entropy.sourceSummary,
      };
    } catch (error) {
      providerFallback = true;
      providerFallbackReason = error instanceof Error ? error.message : String(error);
      seed = cryptoRandomBytes(32).toString("hex");
      seedHash = buildTrainingSeedHash(seed);
      runSeedInfo = {
        mode: "fallback_entropy",
        resolved_run_seed: seed,
        derivation_namespace: "training-data",
        manual_override_enabled: false,
        manual_override_seed: null,
        generated_at: startedAt.toISOString(),
        entropy_game_id: null,
        audit_hash_hex: null,
        primary_provider: null,
        local_fallback_used: null,
        source_summary: null,
      };
      console.error(
        `[WARN] Authoritative seed provider failed; using emergency fallback seed. ${providerFallbackReason}`
      );
    }
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
  }

  const runId = buildTrainingRunId({ seed, startedAt });
  const sessionName = sessionNameInput
    ? sanitizeSessionName(sessionNameInput)
    : buildTrainingSessionName(runId);
  const runDirectory = path.resolve(
    optionOptionalString(options, "run-directory") ??
      path.join(optionString(options, "training-runs-root"), runId)
  );
  const exportRoot =
    optionOptionalString(options, "export-root") ??
    path.join(os.tmpdir(), ".");
  const exportDirectory = path.resolve(
    optionOptionalString(options, "export-directory") ??
      path.join(exportRoot, `tichuml-training-export-${runId}`)
  );
  const archiveRoot =
    optionOptionalString(options, "archive-root") ?? exportRoot;
  const archivePath = path.resolve(
    optionOptionalString(options, "archive-path") ??
      path.join(archiveRoot, `tichuml-training-export-${runId}.tar.gz`)
  );
  const controlDirectory = path.join(runDirectory, "control");
  const requestedGames = optionNumber(options, "games-per-batch", 1000);
  const decisionTimeoutMs = optionNumber(options, "decision-timeout-ms", 500);
  const metadata: TrainingMetadata = {
    run_id: runId,
    session_name: sessionName,
    session_name_source: sessionNameInput ? "user" : "auto",
    seed,
    seed_hash: seedHash,
    seed_provider_name: "generateEntropySeed",
    seed_provider_source_module: "apps/server/src/entropy/index.ts",
    seed_provider_version: 2,
    seed_provider_primary_provider: runSeedInfo?.primary_provider ?? null,
    seed_provider_fallback: providerFallback,
    seed_provider_fallback_reason: providerFallbackReason,
    seed_provider_local_fallback_used: runSeedInfo?.local_fallback_used ?? null,
    seed_provider_generated_at: runSeedInfo?.generated_at ?? startedAt.toISOString(),
    seed_provider_entropy_game_id: runSeedInfo?.entropy_game_id ?? null,
    seed_provider_audit_hash: runSeedInfo?.audit_hash_hex ?? null,
    seed_provider_source_summary: runSeedInfo?.source_summary ?? null,
    started_at: startedAt.toISOString(),
    local_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown",
    repo_root: repoRoot,
    git_branch: gitOutput(repoRoot, ["branch", "--show-current"]),
    git_commit: gitOutput(repoRoot, ["rev-parse", "HEAD"]),
    dirty_git_status_summary: gitOutput(repoRoot, ["status", "--short"])
      .split(/\r?\n/u)
      .filter((line) => line.length > 0),
    provider: optionString(options, "provider"),
    games_per_batch: requestedGames,
    requested_games: requestedGames,
    backend_url: optionString(options, "backend-url"),
    strict_telemetry: optionBoolean(options, "strict-telemetry", false),
    telemetry_mode: optionString(options, "telemetry-mode", "full"),
    decision_timeout_ms: decisionTimeoutMs,
    pg_host: optionString(options, "pg-host"),
    pg_port: optionString(options, "pg-port"),
    pg_user: optionString(options, "pg-user"),
    pg_db: optionString(options, "pg-db"),
    clear_database: optionBoolean(options, "clear-database", true),
    clear_mode: optionBoolean(options, "clear-database", true)
      ? "truncate_training_tables"
      : "no_clear_append",
    cleared_tables: optionBoolean(options, "clear-database", true)
      ? ["events", "decisions", "matches"]
      : [],
    pre_clear_counts: null,
    post_clear_counts: null,
    game_id_prefix: buildTrainingGameIdPrefix({ runId }),
    export_directory: exportDirectory,
    archive_path: archivePath,
    run_directory: runDirectory,
    commands_file: path.join(runDirectory, "commands.txt"),
    run_log: path.join(runDirectory, "run.log"),
    verification_log: path.join(runDirectory, "verification.log"),
    database_counts_file: path.join(runDirectory, "database_counts.txt"),
    last_10_games_file: path.join(runDirectory, "last_10_games.txt"),
    ml_export_check_log: path.join(runDirectory, "ml_export_check.log"),
    ml_export_check_summary_file: path.join(
      runDirectory,
      "ml_export_check_summary.json"
    ),
    metadata_file: path.join(runDirectory, "metadata.json"),
    stop_file: path.resolve(
      optionOptionalString(options, "stop-file") ??
        path.join(controlDirectory, "stop.signal")
    ),
    pid_file: path.resolve(
      optionOptionalString(options, "pid-file") ??
        path.join(controlDirectory, "runner.pid")
    ),
    ml_export_check_enabled: optionBoolean(options, "ml-export-check-enabled", true),
    ml_export_command: optionString(options, "ml-export-command"),
    ml_export_supports_scoped_run: null,
    ml_export_supports_lightgbm_output: null,
    ml_export_check_status: "pending",
    completed_scoped_matches: 0,
    completed_scoped_decisions: 0,
    completed_scoped_events: 0,
    run_complete: false,
    failure_reason: null,
    sim_exit_code: null,
    enobufs_detected: false,
    run_seed_info: runSeedInfo,
  };
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

async function prepareDatabase(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const metadata = loadMetadata(metadataFile);
  const verificationLog = metadataString(metadata, "verification_log");
  const healthy = await backendHealthy(metadataString(metadata, "backend_url"));
  if (!healthy && !optionBoolean(options, "allow-unhealthy-backend", false)) {
    throw new Error(
      "Backend health check failed. Pass --allow-unhealthy-backend true to continue."
    );
  }
  const sql = createDatabaseClient({
    host: metadataString(metadata, "pg_host"),
    port: Number(metadataString(metadata, "pg_port")),
    user: metadataString(metadata, "pg_user"),
    password: resolvePassword(options),
    database: metadataString(metadata, "pg_db"),
  });
  try {
    await verifyRequiredTables(sql);
    const dbName = await currentDatabaseName(sql);
    const expectedClearDb = optionOptionalString(options, "allow-clear-db-name") ?? "tichu";
    if (metadataBoolean(metadata, "clear_database") && dbName !== expectedClearDb) {
      throw new Error(
        `Refusing to clear database ${dbName}; expected ${expectedClearDb}.`
      );
    }
    const preCounts = await collectTableCounts(sql);
    metadata.pre_clear_counts = preCounts;
    logVerification(verificationLog, {
      event: "database_prepare",
      clear_mode: metadata["clear_mode"],
      pre_clear_counts: preCounts,
      sql: TRAINING_CLEAR_SQL,
    });
    if (metadataBoolean(metadata, "clear_database") && !optionBoolean(options, "dry-run", false)) {
      await sql.unsafe(TRAINING_CLEAR_SQL);
      metadata.post_clear_counts = await collectTableCounts(sql);
    } else {
      metadata.post_clear_counts = null;
    }
    saveMetadata(metadataFile, metadata);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function verifyRunOnce(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const metadata = loadMetadata(metadataFile);
  const verificationLog = metadataString(metadata, "verification_log");
  const countsFile = metadataString(metadata, "database_counts_file");
  const sql = createDatabaseClient({
    host: metadataString(metadata, "pg_host"),
    port: Number(metadataString(metadata, "pg_port")),
    user: metadataString(metadata, "pg_user"),
    password: resolvePassword(options),
    database: metadataString(metadata, "pg_db"),
  });
  try {
    const snapshot = await buildVerificationSnapshot(metadata, sql);
    logVerification(verificationLog, {
      event: "verification_snapshot",
      ...snapshot,
    });
    writeJson(countsFile, snapshot);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function finalizeRun(metadata: TrainingMetadata, pgPassword: string): Promise<void> {
  const verificationLog = metadataString(metadata, "verification_log");
  const countsFile = metadataString(metadata, "database_counts_file");
  const exportDirectory = metadataString(metadata, "export_directory");
  const archivePath = metadataString(metadata, "archive_path");
  const lastTenFile = metadataString(metadata, "last_10_games_file");
  const metadataFile = metadataString(metadata, "metadata_file");
  const prefix = scopePrefix(metadata);
  const sql = createDatabaseClient({
    host: metadataString(metadata, "pg_host"),
    port: Number(metadataString(metadata, "pg_port")),
    user: metadataString(metadata, "pg_user"),
    password: pgPassword,
    database: metadataString(metadata, "pg_db"),
  });
  try {
    const globalCounts = await collectTableCounts(sql);
    const scopedCounts = await collectScopedCounts(sql, prefix);
    const requestedGames =
      metadataOptionalNumber(metadata, "requested_games") ??
      metadataNumber(metadata, "games_per_batch");
    metadata.completed_scoped_matches = scopedCounts.matches;
    metadata.completed_scoped_decisions = scopedCounts.decisions;
    metadata.completed_scoped_events = scopedCounts.events;
    if (metadata.run_complete !== true) {
      metadata.run_complete =
        scopedCounts.matches >= requestedGames &&
        (metadata.failure_reason === null ||
          metadata.failure_reason === undefined);
    }
    writeJson(countsFile, {
      run_id: metadataString(metadata, "run_id"),
      game_id_prefix: prefix,
      requested_games: requestedGames,
      global_counts: globalCounts,
      scoped_counts: scopedCounts,
      run_complete: metadata.run_complete === true,
      failure_reason: metadata.failure_reason ?? null,
      sim_exit_code: metadata.sim_exit_code ?? null,
      enobufs_detected: metadata.enobufs_detected === true,
    });
    const lastTen = await renderLastTenGames(sql, prefix);
    fs.mkdirSync(exportDirectory, { recursive: true });
    fs.writeFileSync(lastTenFile, `${lastTen}\n`, "utf8");
    fs.writeFileSync(
      path.join(exportDirectory, "last_10_games.txt"),
      `${lastTen}\n`,
      "utf8"
    );
    console.log(lastTen);
    logVerification(verificationLog, {
      event: "finalize_snapshot",
      global_counts: globalCounts,
      scoped_counts: scopedCounts,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  for (const tableName of ["matches", "decisions", "events"] as const) {
    runPsqlCopy({
      host: metadataString(metadata, "pg_host"),
      port: metadataString(metadata, "pg_port"),
      user: metadataString(metadata, "pg_user"),
      database: metadataString(metadata, "pg_db"),
      password: pgPassword,
      query: buildScopedSelect(tableName, prefix),
      outputFile: path.join(exportDirectory, `${tableName}.csv`),
    });
  }

  const copies: Array<[string, string]> = [
    [metadataFile, path.join(exportDirectory, "metadata.json")],
    [metadataString(metadata, "run_log"), path.join(exportDirectory, "run.log")],
    [verificationLog, path.join(exportDirectory, "verification.log")],
    [metadataString(metadata, "commands_file"), path.join(exportDirectory, "commands.txt")],
    [countsFile, path.join(exportDirectory, "database_counts.txt")],
    [lastTenFile, path.join(exportDirectory, "last_10_games.txt")],
  ];

  if (metadataBoolean(metadata, "ml_export_check_enabled")) {
    const summary = await runMlExportCheck(metadata);
    metadata.ml_export_supports_scoped_run = summary["supports_run_id_filter"] === true || summary["supports_game_id_prefix_filter"] === true;
    metadata.ml_export_supports_lightgbm_output = summary["supports_lightgbm_output"] === true;
    metadata.ml_export_check_status = String(summary["validation_status"] ?? "unknown");
    copies.push(
      [
        metadataString(metadata, "ml_export_check_log"),
        path.join(exportDirectory, "ml_export_check.log"),
      ],
      [
        metadataString(metadata, "ml_export_check_summary_file"),
        path.join(exportDirectory, "ml_export_check_summary.json"),
      ]
    );
  }

  saveMetadata(metadataFile, metadata);

  for (const [source, target] of copies) {
    if (fs.existsSync(source)) {
      ensureParent(target);
      fs.copyFileSync(source, target);
    }
  }

  const archiveParent = path.dirname(exportDirectory);
  const archiveName = path.basename(exportDirectory);
  const tarResult = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", archiveParent, archiveName],
    {
      encoding: "utf8",
      windowsHide: true,
    }
  );
  if (tarResult.status !== 0) {
    throw new Error(`tar archive failed: ${(tarResult.stderr ?? tarResult.stdout ?? "").trim()}`);
  }
  console.log(`Export ready:\n${archivePath}`);
}

async function runLoop(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const metadata = loadMetadata(metadataFile);
  const runLog = metadataString(metadata, "run_log");
  const verificationLog = metadataString(metadata, "verification_log");
  const countsFile = metadataString(metadata, "database_counts_file");
  const stopFile = metadataString(metadata, "stop_file");
  const pidFile = metadataString(metadata, "pid_file");
  const repoRoot = metadataString(metadata, "repo_root");
  const pgPassword = resolvePassword(options);
  const requestedGames =
    metadataOptionalNumber(metadata, "requested_games") ??
    metadataNumber(metadata, "games_per_batch");
  const decisionTimeoutMs =
    metadataOptionalNumber(metadata, "decision_timeout_ms") ?? 500;
  ensureParent(pidFile);
  fs.writeFileSync(pidFile, String(process.pid), "utf8");
  let stopping = false;
  let fatalError: Error | null = null;
  const requestStop = () => {
    stopping = true;
    ensureParent(stopFile);
    fs.writeFileSync(stopFile, nowIso(), "utf8");
  };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  const collectSnapshot = async (): Promise<VerificationSnapshot> => {
    const sql = createDatabaseClient({
      host: metadataString(metadata, "pg_host"),
      port: Number(metadataString(metadata, "pg_port")),
      user: metadataString(metadata, "pg_user"),
      password: pgPassword,
      database: metadataString(metadata, "pg_db"),
    });
    try {
      return await buildVerificationSnapshot(metadata, sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  };

  const persistSnapshot = (snapshot: VerificationSnapshot): void => {
    metadata.completed_scoped_matches = snapshot.scoped_counts.matches;
    metadata.completed_scoped_decisions = snapshot.scoped_counts.decisions;
    metadata.completed_scoped_events = snapshot.scoped_counts.events;
    metadata.run_complete = snapshot.scoped_counts.matches >= requestedGames;
    logVerification(verificationLog, {
      event: "verification_snapshot",
      ...snapshot,
    });
    writeJson(countsFile, snapshot);
    saveMetadata(metadataFile, metadata);
  };

  let batchNumber = 1;
  try {
    while (!stopping && !fs.existsSync(stopFile)) {
      const beforeSnapshot = await collectSnapshot();
      persistSnapshot(beforeSnapshot);
      if (beforeSnapshot.scoped_counts.matches >= requestedGames) {
        metadata.failure_reason = null;
        metadata.sim_exit_code = 0;
        break;
      }

      const remainingGames = computeRemainingRequestedGames({
        requestedGames,
        scopedMatches: beforeSnapshot.scoped_counts.matches,
      });
      const batchId = buildTrainingBatchId(batchNumber);
      const batchSeed = deriveTrainingBatchSeed({
        resolvedRunSeed: metadataString(metadata, "seed"),
        derivationNamespace: "training-data",
        batchId,
      });
      const batchGameIdPrefix = buildTrainingGameIdPrefix({
        runId: metadataString(metadata, "run_id"),
        batchId,
      });
      const args = [
        "run",
        "sim",
        "--",
        "--games",
        String(remainingGames),
        "--provider",
        metadataString(metadata, "provider"),
        "--backend-url",
        metadataString(metadata, "backend_url"),
        "--telemetry",
        "true",
        "--strict-telemetry",
        metadataBoolean(metadata, "strict_telemetry") ? "true" : "false",
        "--telemetry-mode",
        metadataString(metadata, "telemetry_mode"),
        "--full-state",
        "true",
        "--seed",
        batchSeed,
        "--seed-prefix",
        "training-data",
        "--run-id",
        metadataString(metadata, "run_id"),
        "--batch-id",
        batchId,
        "--game-id-prefix",
        batchGameIdPrefix,
        "--seed-hash",
        metadataString(metadata, "seed_hash"),
      ];
      if (decisionTimeoutMs > 0) {
        args.push("--decision-timeout-ms", String(decisionTimeoutMs));
      }
      const command = formatCommandForLog("npm", args);
      appendLine(
        runLog,
        JSON.stringify({
          ts: nowIso(),
          event: "batch_start",
          batch_id: batchId,
          batch_seed: batchSeed,
          game_id_prefix: batchGameIdPrefix,
          requested_games: requestedGames,
          remaining_games_before_batch: remainingGames,
          completed_scoped_matches_before_batch:
            beforeSnapshot.scoped_counts.matches,
          command,
          args,
        })
      );
      const result = await runStreamingProcess({
        command: "npm",
        args,
        cwd: repoRoot,
        logFile: runLog,
        shell: process.platform === "win32",
        mirrorToParent: true,
      });
      metadata.sim_exit_code = result.exitCode;
      metadata.enobufs_detected =
        metadata.enobufs_detected === true || result.enobufsDetected;
      if (result.errorMessage) {
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_process_error",
            batch_id: batchId,
            exit_code: result.exitCode,
            error: result.errorMessage,
            enobufs_detected: result.enobufsDetected,
          })
        );
      }
      appendLine(
        runLog,
        JSON.stringify({
          ts: nowIso(),
          event: "batch_end",
          batch_id: batchId,
          exit_code: result.exitCode,
          signal: result.signal,
        })
      );
      const afterSnapshot = await collectSnapshot();
      persistSnapshot(afterSnapshot);
      appendLine(
        runLog,
        JSON.stringify({
          ts: nowIso(),
          event: "batch_progress",
          run_id: metadataString(metadata, "run_id"),
          batch_id: batchId,
          requested_games: requestedGames,
          scoped_matches: afterSnapshot.scoped_counts.matches,
          scoped_decisions: afterSnapshot.scoped_counts.decisions,
          scoped_events: afterSnapshot.scoped_counts.events,
          global_matches: afterSnapshot.global_counts.matches,
          global_decisions: afterSnapshot.global_counts.decisions,
          global_events: afterSnapshot.global_counts.events,
        })
      );

      const madeScopedProgress =
        afterSnapshot.scoped_counts.matches >
          beforeSnapshot.scoped_counts.matches ||
        afterSnapshot.scoped_counts.decisions >
          beforeSnapshot.scoped_counts.decisions ||
        afterSnapshot.scoped_counts.events >
          beforeSnapshot.scoped_counts.events;

      if (afterSnapshot.scoped_counts.matches >= requestedGames) {
        metadata.run_complete = true;
        metadata.failure_reason = null;
        saveMetadata(metadataFile, metadata);
        break;
      }

      if (result.exitCode !== 0) {
        metadata.failure_reason = result.errorMessage
          ? `sim exited with code ${result.exitCode}: ${result.errorMessage}`
          : `sim exited with code ${result.exitCode}`;
        saveMetadata(metadataFile, metadata);
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_failure_tail",
            batch_id: batchId,
            output_tail: result.outputTail,
          })
        );
        fatalError = new Error(
          `${metadata.failure_reason}\n${result.outputTail.join("\n")}`.trim()
        );
        break;
      }

      if (!madeScopedProgress) {
        metadata.failure_reason =
          "sim exited without increasing scoped matches, decisions, or events";
        saveMetadata(metadataFile, metadata);
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_progress_stalled",
            batch_id: batchId,
            output_tail: result.outputTail,
          })
        );
        fatalError = new Error(
          `Training run stalled after ${batchId}: ${metadata.failure_reason}\n${result.outputTail.join("\n")}`.trim()
        );
        break;
      }

      batchNumber += 1;
    }
  } finally {
    if (!metadata.run_complete && !metadata.failure_reason) {
      metadata.failure_reason =
        stopping || fs.existsSync(stopFile) ? "operator_stop" : null;
    }
    saveMetadata(metadataFile, metadata);
    try {
      await finalizeRun(metadata, pgPassword);
    } catch (error) {
      appendLine(
        runLog,
        JSON.stringify({
          ts: nowIso(),
          event: "finalize_error",
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }
  if (fatalError) {
    throw fatalError;
  }
}

async function main(): Promise<void> {
  const { command, options } = parseCliOptions(process.argv.slice(2));
  if (command === "prepare-run") {
    await prepareRun(options);
    return;
  }
  if (command === "prepare-database") {
    await prepareDatabase(options);
    return;
  }
  if (command === "verify-run") {
    await verifyRunOnce(options);
    return;
  }
  if (command === "run-loop") {
    await runLoop(options);
    return;
  }
  if (command === "finalize-run") {
    const metadata = loadMetadata(path.resolve(optionString(options, "metadata-file")));
    await finalizeRun(metadata, resolvePassword(options));
    return;
  }
  throw new Error(`Unknown training-data command: ${command}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
