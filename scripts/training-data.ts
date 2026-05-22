import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
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
} from "./training-runner.js";
import {
  finalizeTelemetryResults,
  validateTelemetryTrainingData,
  type TelemetryFinalizeSummary,
  type TrainingDataValidationSummary
} from "../apps/server/src/services/telemetry-outcome-finalizer.js";
import {
  validateTelemetryScopedRun,
  type TelemetryRunValidationSummary
} from "./telemetry-validate-run.js";

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

type ParsedSimBatchSummary = {
  gamesPlayed: number;
  handsPlayed: number;
  decisionsRecorded: number;
  eventsRecorded: number;
  errors: number;
  fallbackCount: number;
  decisionProviderFailures: number;
  decisionTimeoutCount: number;
  invalidDecisionCount: number;
  providerUsage: Record<string, number>;
  averageLatencyByProvider: Record<string, number>;
  telemetryRuntime: Record<string, unknown> | null;
};

type PersistenceMismatchValue = {
  executed: number;
  persisted: number;
  missing: number;
  extra: number;
};

type PersistenceMismatchSummary = {
  games: PersistenceMismatchValue & { requested: number };
  hands: { executed: number };
  decisions: PersistenceMismatchValue;
  events: PersistenceMismatchValue;
  hasMismatch: boolean;
};

type ScopedTimeWindow = {
  minTs: string | null;
  maxTs: string | null;
};

type ConcurrentWriterOverlap = {
  warning: boolean;
  scoped_window: ScopedTimeWindow;
  overlapping_decisions: number;
  overlapping_events: number;
  overlapping_matches: number;
  overlap_first_ts: string | null;
  overlap_last_ts: string | null;
};

type TrainingRunLookupFilters = {
  sessionName?: string;
  gameIdPrefix?: string;
  runId?: string;
};

type TrainingStartAssessmentInput = {
  processRunning: boolean;
  runComplete: boolean;
  logShowsBatchStart: boolean;
  backendHealthy: boolean;
  telemetryAccepted: boolean;
  telemetryReady: boolean;
  scopedCounts: TableCounts;
  fallbackCount: number;
  decisionProviderFailures: number;
  decisionTimeoutCount: number;
  telemetryPending: number;
  persistenceFailures: number;
  simExitCode: number | null;
};

type TrainingStartAssessmentResult = {
  kind: "pending" | "success" | "failure";
  message: string;
};

type TelemetryReadinessAssessmentInput = {
  requestedGames: number;
  runComplete: boolean;
  failureReason: string | null;
  fallbackCount: number;
  decisionProviderFailures: number;
  decisionTimeoutCount: number;
  invalidDecisionCount: number;
  telemetryFlushStatus: Record<string, unknown> | null;
  persistenceMismatch: PersistenceMismatchSummary | null;
  concurrentWriterOverlap: ConcurrentWriterOverlap | null;
  mlExportValidationSummary: Record<string, unknown> | null;
  trainingDataValidationSummary: TrainingDataValidationSummary;
  scopedRunValidationSummary: TelemetryRunValidationSummary;
};

type TelemetryReadinessAssessmentResult = {
  ok: boolean;
  failures: string[];
};

const TRAINING_CLEAR_SQL =
  "TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;";
const REQUIRED_TABLES = ["events", "decisions", "matches"] as const;
const TRAINING_METADATA_REQUIRED_FIELDS = [
  "run_id",
  "session_name",
  "game_id_prefix",
  "metadata_file",
  "run_directory",
  "started_at"
] as const;
const TRAINING_METADATA_IGNORED_ROOTS = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules"
]);

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

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => typeof entry === "number" && Number.isFinite(entry)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrainingMetadataRecord(
  value: unknown
): value is Record<(typeof TRAINING_METADATA_REQUIRED_FIELDS)[number], unknown> &
  Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  return TRAINING_METADATA_REQUIRED_FIELDS.every((field) => field in value);
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mergeNumberCounts(
  current: unknown,
  next: Record<string, number>
): Record<string, number> {
  const merged = isNumberRecord(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(next)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

export function parseSimBatchSummaryFromLines(
  lines: string[]
): ParsedSimBatchSummary | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line || !line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (
        typeof parsed.gamesPlayed === "number" &&
        typeof parsed.errors === "number" &&
        typeof parsed.fallbackCount === "number"
      ) {
        return {
          gamesPlayed: parsed.gamesPlayed,
          handsPlayed:
            typeof parsed.handsPlayed === "number" ? parsed.handsPlayed : 0,
          decisionsRecorded:
            typeof parsed.decisionsRecorded === "number"
              ? parsed.decisionsRecorded
              : 0,
          eventsRecorded:
            typeof parsed.eventsRecorded === "number"
              ? parsed.eventsRecorded
              : 0,
          errors: parsed.errors,
          fallbackCount: parsed.fallbackCount,
          decisionProviderFailures:
            typeof parsed.decisionProviderFailures === "number"
              ? parsed.decisionProviderFailures
              : 0,
          decisionTimeoutCount:
            typeof parsed.decisionTimeoutCount === "number"
              ? parsed.decisionTimeoutCount
              : 0,
          invalidDecisionCount:
            typeof parsed.invalidDecisionCount === "number"
              ? parsed.invalidDecisionCount
              : 0,
          providerUsage: isNumberRecord(parsed.providerUsage)
            ? parsed.providerUsage
            : {},
          averageLatencyByProvider: isNumberRecord(
            parsed.averageLatencyByProvider
          )
            ? parsed.averageLatencyByProvider
            : {},
          telemetryRuntime: isRecord(parsed.telemetryRuntime)
            ? parsed.telemetryRuntime
            : null
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function mergeBatchSummaries(
  current: ParsedSimBatchSummary | null,
  next: ParsedSimBatchSummary
): ParsedSimBatchSummary {
  if (current === null) {
    return {
      ...next,
      providerUsage: { ...next.providerUsage },
      averageLatencyByProvider: { ...next.averageLatencyByProvider },
      telemetryRuntime: next.telemetryRuntime
        ? { ...next.telemetryRuntime }
        : null
    };
  }

  const providerUsage = mergeNumberCounts(current.providerUsage, next.providerUsage);
  const latencyProviders = new Set([
    ...Object.keys(current.averageLatencyByProvider),
    ...Object.keys(next.averageLatencyByProvider)
  ]);
  const averageLatencyByProvider: Record<string, number> = {};
  for (const provider of latencyProviders) {
    const currentCount = finiteNumber(current.providerUsage[provider]);
    const nextCount = finiteNumber(next.providerUsage[provider]);
    const totalCount = currentCount + nextCount;
    if (totalCount <= 0) {
      continue;
    }
    const currentLatency =
      finiteNumber(current.averageLatencyByProvider[provider]) * currentCount;
    const nextLatency =
      finiteNumber(next.averageLatencyByProvider[provider]) * nextCount;
    averageLatencyByProvider[provider] = Number(
      ((currentLatency + nextLatency) / totalCount).toFixed(6)
    );
  }

  return {
    gamesPlayed: current.gamesPlayed + next.gamesPlayed,
    handsPlayed: current.handsPlayed + next.handsPlayed,
    decisionsRecorded: current.decisionsRecorded + next.decisionsRecorded,
    eventsRecorded: current.eventsRecorded + next.eventsRecorded,
    errors: current.errors + next.errors,
    fallbackCount: current.fallbackCount + next.fallbackCount,
    decisionProviderFailures:
      current.decisionProviderFailures + next.decisionProviderFailures,
    decisionTimeoutCount:
      current.decisionTimeoutCount + next.decisionTimeoutCount,
    invalidDecisionCount:
      current.invalidDecisionCount + next.invalidDecisionCount,
    providerUsage,
    averageLatencyByProvider,
    telemetryRuntime: next.telemetryRuntime
      ? { ...next.telemetryRuntime }
      : current.telemetryRuntime
        ? { ...current.telemetryRuntime }
        : null
  };
}

export function summarizePersistenceMismatch(input: {
  requestedGames: number;
  executedGames: number;
  executedHands: number;
  executedDecisions: number;
  executedEvents: number;
  persistedMatches: number;
  persistedDecisions: number;
  persistedEvents: number;
}): PersistenceMismatchSummary {
  const gamesMissing = Math.max(0, input.executedGames - input.persistedMatches);
  const gamesExtra = Math.max(0, input.persistedMatches - input.executedGames);
  const decisionsMissing = Math.max(
    0,
    input.executedDecisions - input.persistedDecisions
  );
  const decisionsExtra = Math.max(
    0,
    input.persistedDecisions - input.executedDecisions
  );
  const eventsMissing = Math.max(0, input.executedEvents - input.persistedEvents);
  const eventsExtra = Math.max(0, input.persistedEvents - input.executedEvents);

  return {
    games: {
      requested: input.requestedGames,
      executed: input.executedGames,
      persisted: input.persistedMatches,
      missing: gamesMissing,
      extra: gamesExtra
    },
    hands: {
      executed: input.executedHands
    },
    decisions: {
      executed: input.executedDecisions,
      persisted: input.persistedDecisions,
      missing: decisionsMissing,
      extra: decisionsExtra
    },
    events: {
      executed: input.executedEvents,
      persisted: input.persistedEvents,
      missing: eventsMissing,
      extra: eventsExtra
    },
    hasMismatch:
      gamesMissing > 0 ||
      gamesExtra > 0 ||
      decisionsMissing > 0 ||
      decisionsExtra > 0 ||
      eventsMissing > 0 ||
      eventsExtra > 0
  };
}

export function selectMlExportValidationSummaryFromOutput(
  output: string
): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];
  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      candidates.push(parsed);
    } catch {
      continue;
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (
      typeof candidate.validation_status === "string" ||
      candidate.validation_only === true ||
      candidate.supports_validate_only === true
    ) {
      return candidate;
    }
  }

  return candidates.at(-1) ?? null;
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

function escapeLikePrefixForSql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/u.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function formatTrainingSimCommandForLog(
  command: string,
  args: string[]
): string {
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

async function collectScopedProviderUsage(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<Record<string, number>> {
  const likeValue = `${prefix}%`;
  const rows = await sql<{
    provider: string;
    row_count: string;
  }[]>`
    SELECT COALESCE(provider_used, policy_source, '<unknown>') AS provider,
           count(*)::text AS row_count
    FROM decisions
    WHERE game_id LIKE ${likeValue}
    GROUP BY COALESCE(provider_used, policy_source, '<unknown>')
    ORDER BY COALESCE(provider_used, policy_source, '<unknown>') ASC
  `;
  const distribution: Record<string, number> = {};
  for (const row of rows) {
    distribution[row.provider] = Number(row.row_count ?? 0);
  }
  return distribution;
}

async function collectScopedTimeWindow(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<ScopedTimeWindow> {
  const likeValue = `${prefix}%`;
  const [row] = await sql<{
    min_ts: string | null;
    max_ts: string | null;
  }[]>`
    SELECT MIN(ts)::text AS min_ts, MAX(ts)::text AS max_ts
    FROM decisions
    WHERE game_id LIKE ${likeValue}
  `;
  return {
    minTs: row?.min_ts ?? null,
    maxTs: row?.max_ts ?? null
  };
}

async function collectConcurrentWriterOverlap(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<ConcurrentWriterOverlap> {
  const scopedWindow = await collectScopedTimeWindow(sql, prefix);
  if (!scopedWindow.minTs || !scopedWindow.maxTs) {
    return {
      warning: false,
      scoped_window: scopedWindow,
      overlapping_decisions: 0,
      overlapping_events: 0,
      overlapping_matches: 0,
      overlap_first_ts: null,
      overlap_last_ts: null
    };
  }

  const scopedLike = `${escapeLikePrefixForSql(prefix)}%`;
  const [decisionRow] = await sql.unsafe<{
    row_count: string;
    min_ts: string | null;
    max_ts: string | null;
  }[]>(
    `
      SELECT count(*)::text AS row_count,
             MIN(ts)::text AS min_ts,
             MAX(ts)::text AS max_ts
      FROM decisions
      WHERE game_id NOT LIKE '${escapeSqlLiteral(scopedLike)}' ESCAPE '\\'
        AND ts BETWEEN '${escapeSqlLiteral(scopedWindow.minTs)}'::timestamptz
                  AND '${escapeSqlLiteral(scopedWindow.maxTs)}'::timestamptz
    `
  );
  const [eventRow] = await sql.unsafe<{ row_count: string }[]>(
    `
      SELECT count(*)::text AS row_count
      FROM events
      WHERE game_id NOT LIKE '${escapeSqlLiteral(scopedLike)}' ESCAPE '\\'
        AND ts BETWEEN '${escapeSqlLiteral(scopedWindow.minTs)}'::timestamptz
                  AND '${escapeSqlLiteral(scopedWindow.maxTs)}'::timestamptz
    `
  );
  const [matchRow] = await sql.unsafe<{ row_count: string }[]>(
    `
      SELECT count(*)::text AS row_count
      FROM matches
      WHERE game_id NOT LIKE '${escapeSqlLiteral(scopedLike)}' ESCAPE '\\'
        AND created_at BETWEEN '${escapeSqlLiteral(scopedWindow.minTs)}'::timestamptz
                          AND '${escapeSqlLiteral(scopedWindow.maxTs)}'::timestamptz
    `
  );

  const overlappingDecisions = Number(decisionRow?.row_count ?? 0);
  const overlappingEvents = Number(eventRow?.row_count ?? 0);
  const overlappingMatches = Number(matchRow?.row_count ?? 0);
  return {
    warning:
      overlappingDecisions > 0 || overlappingEvents > 0 || overlappingMatches > 0,
    scoped_window: scopedWindow,
    overlapping_decisions: overlappingDecisions,
    overlapping_events: overlappingEvents,
    overlapping_matches: overlappingMatches,
    overlap_first_ts: decisionRow?.min_ts ?? null,
    overlap_last_ts: decisionRow?.max_ts ?? null
  };
}

async function fetchTelemetryHealth(
  backendUrl: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `${backendUrl.replace(/\/$/, "")}/api/telemetry/health`
    );
    if (!response.ok) {
      return {
        accepted: false,
        status: response.status
      };
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    return {
      accepted: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function waitForTelemetryFlush(
  backendUrl: string,
  timeoutMs = 20000
): Promise<Record<string, unknown> | null> {
  const startedAt = Date.now();
  let latest = await fetchTelemetryHealth(backendUrl);
  while (Date.now() - startedAt < timeoutMs) {
    const queuePending = finiteNumber(
      isRecord(latest) ? latest.queue_pending : undefined
    );
    const queue = isRecord(latest) ? latest.queue : null;
    const queueDepth = finiteNumber(isRecord(queue) ? queue.queue_depth : undefined);
    const persistenceFailures = finiteNumber(
      isRecord(latest) ? latest.persistence_failures : undefined
    );
    if (queuePending <= 0 && queueDepth <= 0 && persistenceFailures <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    latest = await fetchTelemetryHealth(backendUrl);
  }
  return latest;
}

function listTrainingRunMetadataFiles(repoRoot: string): string[] {
  const resolvedRoot = path.resolve(repoRoot);
  const results: string[] = [];
  const queue = [resolvedRoot];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) {
      continue;
    }
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "." || entry.name === "..") {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toForwardSlashes(path.relative(resolvedRoot, fullPath));
      if (entry.isDirectory()) {
        if (TRAINING_METADATA_IGNORED_ROOTS.has(entry.name)) {
          continue;
        }
        if (
          relativePath === ".runtime/telemetry" ||
          relativePath.startsWith(".runtime/telemetry/")
        ) {
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "metadata.json") {
        results.push(fullPath);
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

export function findTrainingRunMetadataFile(
  repoRoot: string,
  filters: TrainingRunLookupFilters
): string | null {
  const candidates: Array<{
    metadataPath: string;
    startedAt: string;
  }> = [];

  for (const metadataPath of listTrainingRunMetadataFiles(repoRoot)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as unknown;
      if (!isTrainingMetadataRecord(parsed)) {
        continue;
      }
      if (
        filters.sessionName &&
        String(parsed.session_name) !== filters.sessionName
      ) {
        continue;
      }
      if (
        filters.gameIdPrefix &&
        String(parsed.game_id_prefix) !== filters.gameIdPrefix
      ) {
        continue;
      }
      if (filters.runId && String(parsed.run_id) !== filters.runId) {
        continue;
      }
      candidates.push({
        metadataPath,
        startedAt: String(parsed.started_at ?? "")
      });
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return candidates[0]?.metadataPath ?? null;
}

export function assessTrainingStartStatus(
  input: TrainingStartAssessmentInput
): TrainingStartAssessmentResult {
  if (!input.backendHealthy) {
    return {
      kind: "failure",
      message: "backend health endpoint is not ready"
    };
  }
  if (!input.telemetryAccepted || !input.telemetryReady) {
    return {
      kind: "failure",
      message: "telemetry ingest health endpoint is not ready"
    };
  }
  if (input.persistenceFailures > 0) {
    return {
      kind: "failure",
      message: `telemetry persistence failures detected: ${input.persistenceFailures}`
    };
  }
  if (input.fallbackCount > 0) {
    return {
      kind: "failure",
      message: `telemetry fallback activity detected: ${input.fallbackCount}`
    };
  }
  if (input.decisionProviderFailures > 0) {
    return {
      kind: "failure",
      message: `decision provider failures detected: ${input.decisionProviderFailures}`
    };
  }
  if (input.decisionTimeoutCount > 0) {
    return {
      kind: "failure",
      message: `decision timeouts detected: ${input.decisionTimeoutCount}`
    };
  }
  if (!input.logShowsBatchStart) {
    if (input.simExitCode !== null) {
      return {
        kind: "failure",
        message: `runner exited with code ${input.simExitCode} before batch start was observed`
      };
    }
    return {
      kind: "pending",
      message: "waiting for run log to confirm batch start"
    };
  }
  const hasScopedRows =
    input.scopedCounts.matches > 0 &&
    input.scopedCounts.decisions > 0 &&
    input.scopedCounts.events > 0;
  if (!hasScopedRows) {
    if (input.simExitCode !== null && !input.runComplete) {
      return {
        kind: "failure",
        message: `runner exited with code ${input.simExitCode} before scoped rows were produced`
      };
    }
    return {
      kind: "pending",
      message: "waiting for scoped matches, decisions, and events"
    };
  }
  if (input.processRunning || input.runComplete || input.simExitCode === 0) {
    const queueSuffix =
      input.telemetryPending > 0
        ? `; telemetry queue still has ${input.telemetryPending} pending item(s)`
        : "";
    return {
      kind: "success",
      message: `training start verified with scoped matches=${input.scopedCounts.matches}, decisions=${input.scopedCounts.decisions}, events=${input.scopedCounts.events}${queueSuffix}`
    };
  }
  return {
    kind: "pending",
    message: "waiting for runner process to remain alive long enough to confirm startup"
  };
}

function isCoverageComplete(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}

function readSummaryNumber(
  record: Record<string, number> | undefined,
  key: string
): number {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function assessTelemetryReadiness(
  input: TelemetryReadinessAssessmentInput
): TelemetryReadinessAssessmentResult {
  const failures: string[] = [];
  const scopedCounts = input.scopedRunValidationSummary.counts;
  const coverage = input.trainingDataValidationSummary.coverage;
  const allowedSystemRewardPhases = new Set([
    "exchange_complete",
    "pass_reveal",
    "round_scoring"
  ]);

  if (!input.runComplete) {
    failures.push("run_complete is false.");
  }
  if (input.failureReason) {
    failures.push(`run failure_reason is set: ${input.failureReason}`);
  }
  if (scopedCounts.matches !== input.requestedGames) {
    failures.push(
      `scoped matches ${scopedCounts.matches} did not exactly match requested_games ${input.requestedGames}.`
    );
  }
  if (scopedCounts.decisions <= 0 || scopedCounts.events <= 0) {
    failures.push("scoped decisions/events were not both populated.");
  }
  if (input.fallbackCount > 0) {
    failures.push(`fallback_count was ${input.fallbackCount}.`);
  }
  if (input.decisionProviderFailures > 0) {
    failures.push(
      `decision_provider_failures was ${input.decisionProviderFailures}.`
    );
  }
  if (input.decisionTimeoutCount > 0) {
    failures.push(`decision_timeout_count was ${input.decisionTimeoutCount}.`);
  }
  if (input.invalidDecisionCount > 0 || scopedCounts.invalid_decisions > 0) {
    failures.push(
      `invalid decisions were recorded (${Math.max(
        input.invalidDecisionCount,
        scopedCounts.invalid_decisions
      )}).`
    );
  }

  const queuePending = finiteNumber(
    isRecord(input.telemetryFlushStatus)
      ? input.telemetryFlushStatus.queue_pending
      : undefined
  );
  const persistenceFailures = finiteNumber(
    isRecord(input.telemetryFlushStatus)
      ? input.telemetryFlushStatus.persistence_failures
      : undefined
  );
  if (queuePending > 0) {
    failures.push(`telemetry queue still had ${queuePending} pending item(s).`);
  }
  if (persistenceFailures > 0) {
    failures.push(
      `telemetry persistence_failures was ${persistenceFailures}.`
    );
  }

  if (input.persistenceMismatch?.hasMismatch) {
    failures.push("persisted row counts did not match executed row counts.");
  }
  if (input.concurrentWriterOverlap?.warning) {
    failures.push("concurrent writer overlap was detected in the scoped window.");
  }

  const mlExportAccepted =
    input.mlExportValidationSummary?.accepted === true &&
    input.mlExportValidationSummary?.validation_status === "accepted";
  if (!mlExportAccepted) {
    failures.push("ml_export validation did not report accepted status.");
  }

  for (const field of [
    "state_features_coverage",
    "candidate_scores_coverage",
    "chosen_action_type_coverage",
    "hand_result_coverage",
    "game_result_coverage"
  ]) {
    if (!isCoverageComplete(coverage[field])) {
      failures.push(`${field} was ${String(coverage[field] ?? 0)} instead of 1.`);
    }
  }

  if (input.trainingDataValidationSummary.warnings.length > 0) {
    for (const warning of input.trainingDataValidationSummary.warnings) {
      failures.push(`training-data warning: ${warning}`);
    }
  }

  if (scopedCounts.legal_chosen_actions !== scopedCounts.decisions) {
    failures.push(
      `legal_chosen_actions ${scopedCounts.legal_chosen_actions} did not match decisions ${scopedCounts.decisions}.`
    );
  }
  if (scopedCounts.state_features_count !== scopedCounts.decisions) {
    failures.push(
      `state_features_count ${scopedCounts.state_features_count} did not match decisions ${scopedCounts.decisions}.`
    );
  }
  if (scopedCounts.candidate_scores_count !== scopedCounts.decisions) {
    failures.push(
      `candidate_scores_count ${scopedCounts.candidate_scores_count} did not match decisions ${scopedCounts.decisions}.`
    );
  }
  if (scopedCounts.explanation_count !== scopedCounts.decisions) {
    failures.push(
      `explanation_count ${scopedCounts.explanation_count} did not match decisions ${scopedCounts.decisions}.`
    );
  }
  if (scopedCounts.tichu_calls <= 0) {
    failures.push("tichu_calls was 0 for the scoped run.");
  }

  let allowedMissingRewardRows = 0;
  for (const entry of input.scopedRunValidationSummary.missingRewardByPhaseProvider) {
    if (entry.missing_reward > 0) {
      if (
        entry.provider_used === "system_local" &&
        allowedSystemRewardPhases.has(entry.phase)
      ) {
        allowedMissingRewardRows += entry.missing_reward;
        continue;
      }
      failures.push(
        `missing_reward remained for provider=${entry.provider_used} phase=${entry.phase}: ${entry.missing_reward}.`
      );
    }
  }
  if (scopedCounts.reward_count + allowedMissingRewardRows !== scopedCounts.decisions) {
    failures.push(
      `reward_count ${scopedCounts.reward_count} plus allowed system control gaps ${allowedMissingRewardRows} did not match decisions ${scopedCounts.decisions}.`
    );
  }

  if (input.scopedRunValidationSummary.matchConsistency.completed_zero_zero > 0) {
    failures.push("completed matches with 0-0 final score were detected.");
  }
  if (input.scopedRunValidationSummary.matchConsistency.completed_hands_le_one > 0) {
    failures.push("completed matches reported implausible hands_played values.");
  }
  if (
    input.scopedRunValidationSummary.matchConsistency
      .server_mixed_provider_mismatch > 0
  ) {
    failures.push("server/local provider mismatch was detected in matches.");
  }

  if (readSummaryNumber(coverage, "aggression_context_count") <= 0) {
    failures.push("aggression_context_count was 0.");
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

function latestBatchCommandFromLogLines(lines: string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line || !line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.event === "batch_start" && typeof parsed.command === "string") {
        return parsed.command;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function hasBatchStartLog(lines: string[]): boolean {
  return lines.some(
    (line) =>
      line.includes('"event":"batch_start"') || line.includes("COMMAND npm")
  );
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

function isPidAlive(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isProcessStartCompatibleWithRun(input: {
  runStartedAt: string | null;
  processStartedAt: string | null;
}): boolean {
  if (!input.runStartedAt || !input.processStartedAt) {
    return true;
  }
  const runStartedAtMs = Date.parse(input.runStartedAt);
  const processStartedAtMs = Date.parse(input.processStartedAt);
  if (!Number.isFinite(runStartedAtMs) || !Number.isFinite(processStartedAtMs)) {
    return true;
  }
  const maxCompatibleDeltaMs = 10 * 60 * 1000;
  return (
    processStartedAtMs >= runStartedAtMs &&
    processStartedAtMs - runStartedAtMs <= maxCompatibleDeltaMs
  );
}

function readProcessStartedAt(pid: number | null): string | null {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty StartTime).ToString('o')`
      ],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );
    return result.status === 0 ? (result.stdout ?? "").trim() || null : null;
  }

  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
    windowsHide: true
  });
  const raw = (result.stdout ?? "").trim();
  if (result.status !== 0 || raw.length === 0) {
    return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function readPidValue(pidFile: string): number | null {
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!/^\d+$/u.test(raw)) {
    return null;
  }
  return Number.parseInt(raw, 10);
}

function readLogTail(filePath: string, tailLines: number): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(1, tailLines));
}

async function collectScopedLatestTimestamps(
  sql: ReturnType<typeof createDatabaseClient>,
  prefix: string
): Promise<{
  latestDecisionTs: string | null;
  latestEventTs: string | null;
}> {
  const likeValue = `${prefix}%`;
  const [row] = await sql<
    Array<{
      latest_decision_ts: string | null;
      latest_event_ts: string | null;
    }>
  >`
    SELECT
      (
        SELECT MAX(created_at)::text
        FROM decisions
        WHERE game_id LIKE ${likeValue}
      ) AS latest_decision_ts,
      (
        SELECT MAX(created_at)::text
        FROM events
        WHERE game_id LIKE ${likeValue}
      ) AS latest_event_ts
  `;
  return {
    latestDecisionTs: row?.latest_decision_ts ?? null,
    latestEventTs: row?.latest_event_ts ?? null,
  };
}

function buildScopedSelect(table: "matches" | "decisions" | "events", prefix: string): string {
  return `SELECT * FROM ${table} WHERE game_id LIKE '${escapeSqlLiteral(prefix)}%' ORDER BY game_id ASC`;
}

function buildScopedWhereSql(prefix: string): string {
  const escapedPrefix = escapeSqlLiteral(escapeLikePrefixForSql(prefix));
  return `game_id LIKE '${escapedPrefix}%' ESCAPE '\\'`;
}

function readJsonFileIfExists(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

async function runMlExportCheck(metadata: TrainingMetadata): Promise<Record<string, unknown>> {
  const repoRoot = metadataString(metadata, "repo_root");
  const mlExportCommand = metadataString(metadata, "ml_export_command");
  const runId = metadataString(metadata, "run_id");
  const gameIdPrefix = metadataString(metadata, "game_id_prefix");
  const outputDir = path.join(metadataString(metadata, "run_directory"), "ml");
  const logFile = metadataString(metadata, "ml_export_check_log");
  const summaryFile = metadataString(metadata, "ml_export_check_summary_file");

  const exportArgs = [
    "scripts/run-python.ts",
    "ml/export_training_rows.py",
    "--validate-only",
    "--run-id",
    runId,
    "--game-id-prefix",
    gameIdPrefix,
    "--provider",
    metadataString(metadata, "provider"),
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
  const result = spawnSync(
    process.execPath,
    [path.join("node_modules", "tsx", "dist", "cli.mjs"), ...exportArgs],
    {
      cwd: repoRoot,
      env: databaseUrl
        ? {
            ...process.env,
            TRAINING_DATABASE_URL: databaseUrl,
          }
        : process.env,
      encoding: "utf8",
      windowsHide: true,
    }
  );
  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (combinedOutput.length > 0) {
    appendLine(logFile, combinedOutput);
  }
  let parsed: Record<string, unknown>;
  const selectedSummary = selectMlExportValidationSummaryFromOutput(combinedOutput);
  if (selectedSummary) {
    parsed = selectedSummary;
  } else {
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

async function collectTelemetryReadinessArtifacts(
  metadata: TrainingMetadata,
  pgPassword: string
): Promise<{
  finalizeSummary: TelemetryFinalizeSummary;
  trainingDataValidationSummary: TrainingDataValidationSummary;
  scopedRunValidationSummary: TelemetryRunValidationSummary;
  readiness: TelemetryReadinessAssessmentResult;
}> {
  const prefix = scopePrefix(metadata);
  const requestedGames =
    metadataOptionalNumber(metadata, "requested_games") ??
    metadataNumber(metadata, "games_per_batch");
  const sql = createDatabaseClient({
    host: metadataString(metadata, "pg_host"),
    port: Number(metadataString(metadata, "pg_port")),
    user: metadataString(metadata, "pg_user"),
    password: pgPassword,
    database: metadataString(metadata, "pg_db"),
  });

  try {
    const finalizeSummary = await finalizeTelemetryResults(sql);
    const trainingDataValidationSummary =
      await validateTelemetryTrainingData(sql);
    const scopedRunValidationSummary = await validateTelemetryScopedRun(sql, {
      whereSql: buildScopedWhereSql(prefix),
      descriptor: {
        game_id_prefix: prefix,
        run_id: metadataString(metadata, "run_id")
      }
    });
    const readiness = assessTelemetryReadiness({
      requestedGames,
      runComplete: metadata.run_complete === true,
      failureReason:
        typeof metadata.failure_reason === "string"
          ? metadata.failure_reason
          : null,
      fallbackCount: metadataOptionalNumber(metadata, "fallback_count") ?? 0,
      decisionProviderFailures:
        metadataOptionalNumber(metadata, "decision_provider_failures") ?? 0,
      decisionTimeoutCount:
        metadataOptionalNumber(metadata, "decision_timeout_count") ?? 0,
      invalidDecisionCount:
        metadataOptionalNumber(metadata, "invalid_decision_count") ?? 0,
      telemetryFlushStatus: isRecord(metadata.telemetry_flush_status)
        ? metadata.telemetry_flush_status
        : null,
      persistenceMismatch: isRecord(metadata.persistence_mismatch)
        ? (metadata.persistence_mismatch as PersistenceMismatchSummary)
        : null,
      concurrentWriterOverlap: isRecord(metadata.concurrent_writer_overlap)
        ? (metadata.concurrent_writer_overlap as ConcurrentWriterOverlap)
        : null,
      mlExportValidationSummary: readJsonFileIfExists(
        metadataString(metadata, "ml_export_check_summary_file")
      ),
      trainingDataValidationSummary,
      scopedRunValidationSummary
    });

    writeJson(
      metadataString(metadata, "telemetry_finalize_summary_file"),
      finalizeSummary
    );
    writeJson(
      metadataString(metadata, "telemetry_validation_summary_file"),
      trainingDataValidationSummary
    );
    writeJson(
      metadataString(metadata, "telemetry_run_validation_summary_file"),
      scopedRunValidationSummary
    );
    writeJson(metadataString(metadata, "telemetry_readiness_summary_file"), {
      run_id: metadataString(metadata, "run_id"),
      game_id_prefix: prefix,
      requested_games: requestedGames,
      ok: readiness.ok,
      failures: readiness.failures,
      finalize_summary: finalizeSummary,
      training_data_validation_summary: trainingDataValidationSummary,
      scoped_run_validation_summary: scopedRunValidationSummary
    });

    return {
      finalizeSummary,
      trainingDataValidationSummary,
      scopedRunValidationSummary,
      readiness
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function buildPreparedRunMetadata(
  options: CliOptions
): Promise<TrainingMetadata> {
  const repoRoot = path.resolve(optionString(options, "repo-root"));
  const startedAt = new Date();
  const sessionNameInput = optionOptionalString(options, "session-name");
  const seedOverride = optionOptionalString(options, "seed");
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
      if (seedOverride) {
        seed = seedOverride;
        seedHash = buildTrainingSeedHash(seed);
        runSeedInfo = {
          mode: "manual_override",
          resolved_run_seed: seed,
          derivation_namespace: "training-data",
          manual_override_enabled: true,
          manual_override_seed: seed,
          generated_at: startedAt.toISOString(),
          entropy_game_id: null,
          audit_hash_hex: null,
          primary_provider: "manual",
          local_fallback_used: false,
          source_summary: "Manual seed override supplied to start-training.",
        };
      } else {
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
      }
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
  const decisionTimeoutMs = optionNumber(options, "decision-timeout-ms", 2000);
  const explorationProfile = optionString(options, "exploration-profile", "off");
  const explorationRate = optionNumber(options, "exploration-rate", 0);
  const explorationTopN = optionNumber(options, "exploration-top-n", 0);
  const explorationMaxScoreGap = optionNumber(
    options,
    "exploration-max-score-gap",
    0
  );
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
    exploration_profile: explorationProfile,
    exploration_rate: explorationRate,
    exploration_top_n: explorationTopN,
    exploration_max_score_gap: explorationMaxScoreGap,
    decision_request_mode: "fast_path_default",
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
    telemetry_finalize_summary_file: path.join(
      runDirectory,
      "telemetry_finalize_summary.json"
    ),
    telemetry_validation_summary_file: path.join(
      runDirectory,
      "telemetry_validation_summary.json"
    ),
    telemetry_run_validation_summary_file: path.join(
      runDirectory,
      "telemetry_run_validation_summary.json"
    ),
    telemetry_readiness_summary_file: path.join(
      runDirectory,
      "telemetry_readiness_summary.json"
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
    telemetry_readiness_status: "pending",
    completed_scoped_matches: 0,
    completed_scoped_decisions: 0,
    completed_scoped_events: 0,
    provider_used_distribution: {},
    batch_summary_totals: null,
    fallback_count: 0,
    decision_provider_failures: 0,
    decision_timeout_count: 0,
    invalid_decision_count: 0,
    average_latency_by_provider: {},
    persistence_mismatch: null,
    scoped_provider_distribution: {},
    concurrent_writer_overlap: null,
    telemetry_flush_status: null,
    run_complete: false,
    failure_reason: null,
    sim_exit_code: null,
    sim_exit_signal: null,
    sim_command: null,
    sim_args: [],
    sim_cwd: repoRoot,
    sim_child_started_at: null,
    sim_child_finished_at: null,
    output_tail: [],
    enobufs_detected: false,
    run_seed_info: runSeedInfo,
  };
  return metadata;
}

async function prepareRun(options: CliOptions): Promise<void> {
  const metadata = await buildPreparedRunMetadata(options);
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

function verifySimCommandHelp(repoRoot: string): void {
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Simulator command preflight failed: missing ${packageJsonPath}.`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  const simScript = typeof packageJson.scripts?.sim === "string" ? packageJson.scripts.sim : "";
  if (!simScript.trim()) {
    throw new Error("Simulator command preflight failed: package.json scripts.sim is not defined.");
  }
  const cliEntry = path.join(repoRoot, "apps", "sim-runner", "src", "cli.ts");
  if (!fs.existsSync(cliEntry)) {
    throw new Error(`Simulator command preflight failed: missing ${cliEntry}.`);
  }
  const tsxBinary = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const tsxPath = path.join(repoRoot, "node_modules", ".bin", tsxBinary);
  if (!fs.existsSync(tsxPath)) {
    throw new Error(`Simulator command preflight failed: missing ${tsxPath}. Run npm install first.`);
  }
}

function collectConflictingTrainingRuns(
  repoRoot: string,
  currentMetadataPath: string,
  metadata: TrainingMetadata
): Array<Record<string, unknown>> {
  const conflicts: Array<Record<string, unknown>> = [];
  for (const candidatePath of listTrainingRunMetadataFiles(repoRoot)) {
    const resolvedCandidate = path.resolve(candidatePath);
    if (resolvedCandidate === path.resolve(currentMetadataPath)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(resolvedCandidate, "utf8")) as unknown;
      if (!isTrainingMetadataRecord(parsed)) {
        continue;
      }
      const candidatePid = readPidValue(String(parsed.pid_file ?? ""));
      const candidateRunning = isPidAlive(candidatePid);
      if (!candidateRunning) {
        continue;
      }
      const candidateProcessStartedAt = readProcessStartedAt(candidatePid);
      if (
        !isProcessStartCompatibleWithRun({
          runStartedAt: String(parsed.started_at ?? ""),
          processStartedAt: candidateProcessStartedAt
        })
      ) {
        continue;
      }
      if (
        String(parsed.backend_url ?? "") !== metadataString(metadata, "backend_url") ||
        String(parsed.pg_host ?? "") !== metadataString(metadata, "pg_host") ||
        String(parsed.pg_port ?? "") !== metadataString(metadata, "pg_port") ||
        String(parsed.pg_db ?? "") !== metadataString(metadata, "pg_db")
      ) {
        continue;
      }
      conflicts.push({
        run_id: String(parsed.run_id),
        session_name: String(parsed.session_name),
        pid: candidatePid,
        metadata_file: resolvedCandidate
      });
    } catch {
      continue;
    }
  }
  return conflicts;
}

async function prepareDatabase(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const metadata = loadMetadata(metadataFile);
  const verificationLog = metadataString(metadata, "verification_log");
  verifySimCommandHelp(metadataString(metadata, "repo_root"));
  const healthy = await backendHealthy(metadataString(metadata, "backend_url"));
  if (!healthy && !optionBoolean(options, "allow-unhealthy-backend", false)) {
    throw new Error(
      "Backend health check failed. Pass --allow-unhealthy-backend true to continue."
    );
  }
  const telemetryHealth = await fetchTelemetryHealth(
    metadataString(metadata, "backend_url")
  );
  const telemetryAccepted = isRecord(telemetryHealth)
    ? telemetryHealth.accepted === true
    : false;
  const telemetryReady = isRecord(telemetryHealth)
    ? telemetryHealth.ready === true
    : false;
  if (
    (!telemetryAccepted || !telemetryReady) &&
    !optionBoolean(options, "allow-unhealthy-backend", false)
  ) {
    throw new Error(
      `Telemetry ingest health check failed: ${JSON.stringify(telemetryHealth)}`
    );
  }
  const conflicts = collectConflictingTrainingRuns(
    metadataString(metadata, "repo_root"),
    metadataFile,
    metadata
  );
  const allowConflictingWriters =
    optionBoolean(options, "allow-conflicting-writers", false) ||
    optionBoolean(options, "dry-run", false);
  if (
    conflicts.length > 0 &&
    !allowConflictingWriters
  ) {
    throw new Error(
      `Conflicting active training writers detected: ${JSON.stringify(conflicts)}`
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
      backend_healthy: healthy,
      telemetry_health: telemetryHealth,
      conflicting_writers: conflicts,
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

async function statusRun(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const metadata = loadMetadata(metadataFile);
  const tailLines = optionNumber(options, "tail-lines", 20);
  const prefix = scopePrefix(metadata);
  const pid = readPidValue(metadataString(metadata, "pid_file"));
  const processRunning = isPidAlive(pid);
  const backendHealthyNow = await backendHealthy(
    metadataString(metadata, "backend_url")
  );

  let dbConnected = false;
  let snapshot: VerificationSnapshot | null = null;
  let latestDecisionTs: string | null = null;
  let latestEventTs: string | null = null;
  let lastTenGames = "";

  const sql = createDatabaseClient({
    host: metadataString(metadata, "pg_host"),
    port: Number(metadataString(metadata, "pg_port")),
    user: metadataString(metadata, "pg_user"),
    password: resolvePassword(options),
    database: metadataString(metadata, "pg_db"),
  });
  try {
    snapshot = await buildVerificationSnapshot(metadata, sql);
    dbConnected = true;
    const timestamps = await collectScopedLatestTimestamps(sql, prefix);
    latestDecisionTs = timestamps.latestDecisionTs;
    latestEventTs = timestamps.latestEventTs;
    lastTenGames = await renderLastTenGames(sql, prefix);
  } catch {
    dbConnected = false;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }

  const report = {
    run_id: metadataString(metadata, "run_id"),
    session_name: metadataString(metadata, "session_name"),
    process_id: pid,
    process_running: processRunning,
    game_id_prefix: prefix,
    run_directory: metadataString(metadata, "run_directory"),
    metadata_file: metadataFile,
    run_log: metadataString(metadata, "run_log"),
    verification_log: metadataString(metadata, "verification_log"),
    latest_log_lines: readLogTail(metadataString(metadata, "run_log"), tailLines),
    latest_verification_lines: readLogTail(
      metadataString(metadata, "verification_log"),
      Math.min(10, tailLines)
    ),
    completed_scoped_matches:
      snapshot?.scoped_counts.matches ?? metadata["completed_scoped_matches"] ?? 0,
    completed_scoped_decisions:
      snapshot?.scoped_counts.decisions ?? metadata["completed_scoped_decisions"] ?? 0,
    completed_scoped_events:
      snapshot?.scoped_counts.events ?? metadata["completed_scoped_events"] ?? 0,
    sim_exit_code: metadata["sim_exit_code"] ?? null,
    sim_exit_signal: metadata["sim_exit_signal"] ?? null,
    failure_reason: metadata["failure_reason"] ?? null,
    output_tail: metadata["output_tail"] ?? [],
    backend_healthy: backendHealthyNow,
    db_connected: dbConnected,
    latest_decision_ts: latestDecisionTs,
    latest_event_ts: latestEventTs,
    scoped_snapshot: snapshot,
    last_10_games: lastTenGames,
    telemetry_failures: {
      fallback_count: metadata["fallback_count"] ?? 0,
      decision_provider_failures:
        metadata["decision_provider_failures"] ?? 0,
      decision_timeout_count: metadata["decision_timeout_count"] ?? 0,
    },
    exploration: {
      profile: metadata["exploration_profile"] ?? "off",
      rate: metadata["exploration_rate"] ?? 0,
      top_n: metadata["exploration_top_n"] ?? 0,
      max_score_gap: metadata["exploration_max_score_gap"] ?? 0,
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function waitForStart(options: CliOptions): Promise<void> {
  const metadataFile = path.resolve(optionString(options, "metadata-file"));
  const tailLines = optionNumber(options, "tail-lines", 80);
  const timeoutSeconds = optionNumber(options, "timeout-seconds", 120);
  const pollIntervalMs = optionNumber(options, "poll-interval-ms", 1000);
  const startedAtMs = Date.now();
  let lastReport: Record<string, unknown> | null = null;

  while (Date.now() - startedAtMs <= timeoutSeconds * 1000) {
    const metadata = loadMetadata(metadataFile);
    const pid = readPidValue(metadataString(metadata, "pid_file"));
    const processRunning = isPidAlive(pid);
    const backendHealthyNow = await backendHealthy(
      metadataString(metadata, "backend_url")
    );
    const telemetryHealth = await fetchTelemetryHealth(
      metadataString(metadata, "backend_url")
    );
    let dbConnected = false;
    let snapshot: VerificationSnapshot | null = null;
    let dbError: string | null = null;

    const sql = createDatabaseClient({
      host: metadataString(metadata, "pg_host"),
      port: Number(metadataString(metadata, "pg_port")),
      user: metadataString(metadata, "pg_user"),
      password: resolvePassword(options),
      database: metadataString(metadata, "pg_db"),
    });
    try {
      snapshot = await buildVerificationSnapshot(metadata, sql);
      dbConnected = true;
    } catch (error) {
      dbError = error instanceof Error ? error.message : String(error);
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }

    const latestLogLines = readLogTail(
      metadataString(metadata, "run_log"),
      tailLines
    );
    const latestVerificationLines = readLogTail(
      metadataString(metadata, "verification_log"),
      Math.min(40, tailLines)
    );
    const latestBatchCommand =
      typeof metadata.sim_command === "string" && metadata.sim_command.length > 0
        ? metadata.sim_command
        : latestBatchCommandFromLogLines(latestLogLines);
    const logShowsBatchStart =
      hasBatchStartLog(latestLogLines) || hasBatchStartLog(latestVerificationLines);

    const assessment =
      dbConnected && snapshot
        ? assessTrainingStartStatus({
            processRunning,
            runComplete: metadata.run_complete === true,
            logShowsBatchStart,
            backendHealthy: backendHealthyNow,
            telemetryAccepted:
              isRecord(telemetryHealth) && telemetryHealth.accepted === true,
            telemetryReady:
              isRecord(telemetryHealth) && telemetryHealth.ready === true,
            scopedCounts: snapshot.scoped_counts,
            fallbackCount:
              metadataOptionalNumber(metadata, "fallback_count") ?? 0,
            decisionProviderFailures:
              metadataOptionalNumber(metadata, "decision_provider_failures") ?? 0,
            decisionTimeoutCount:
              metadataOptionalNumber(metadata, "decision_timeout_count") ?? 0,
            telemetryPending: finiteNumber(
              isRecord(telemetryHealth) ? telemetryHealth.queue_pending : 0
            ),
            persistenceFailures: finiteNumber(
              isRecord(telemetryHealth) ? telemetryHealth.persistence_failures : 0
            ),
            simExitCode: metadataOptionalNumber(metadata, "sim_exit_code")
          })
        : ({
            kind:
              metadataOptionalNumber(metadata, "sim_exit_code") !== null
                ? "failure"
                : "pending",
            message: dbError
              ? `database verification failed: ${dbError}`
              : "waiting for database verification to succeed"
          } satisfies TrainingStartAssessmentResult);

    lastReport = {
      kind: assessment.kind,
      message: assessment.message,
      wait_elapsed_ms: Date.now() - startedAtMs,
      timeout_seconds: timeoutSeconds,
      poll_interval_ms: pollIntervalMs,
      run_id: metadataString(metadata, "run_id"),
      session_name: metadataString(metadata, "session_name"),
      process_id: pid,
      process_running: processRunning,
      run_complete: metadata.run_complete === true,
      sim_exit_code: metadataOptionalNumber(metadata, "sim_exit_code"),
      sim_exit_signal: metadata["sim_exit_signal"] ?? null,
      game_id_prefix: scopePrefix(metadata),
      backend_url: metadataString(metadata, "backend_url"),
      backend_healthy: backendHealthyNow,
      telemetry_health: telemetryHealth,
      db_target: {
        host: metadataString(metadata, "pg_host"),
        port: metadataString(metadata, "pg_port"),
        database: metadataString(metadata, "pg_db"),
        user: metadataString(metadata, "pg_user")
      },
      db_connected: dbConnected,
      db_error: dbError,
      scoped_snapshot: snapshot,
      latest_batch_command: latestBatchCommand,
      latest_log_lines: latestLogLines,
      latest_verification_lines: latestVerificationLines,
      failure_reason: metadata.failure_reason ?? null,
      output_tail: metadata.output_tail ?? [],
      suggested_debug_command:
        `npx tsx scripts/training-data.ts status-run --metadata-file "${metadataFile}" --pg-password-file "${path.join(path.dirname(metadataString(metadata, "stop_file")), "pg-password.txt")}" --tail-lines 80`
    };

    if (assessment.kind === "success") {
      process.stdout.write(`${JSON.stringify(lastReport, null, 2)}\n`);
      return;
    }
    if (assessment.kind === "failure") {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  process.stdout.write(`${JSON.stringify(lastReport, null, 2)}\n`);
  const reason =
    typeof lastReport?.message === "string"
      ? lastReport.message
      : "training start verification failed";
  throw new Error(reason);
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
    const scopedProviderDistribution = await collectScopedProviderUsage(sql, prefix);
    const concurrentWriterOverlap = await collectConcurrentWriterOverlap(
      sql,
      prefix
    );
    const requestedGames =
      metadataOptionalNumber(metadata, "requested_games") ??
      metadataNumber(metadata, "games_per_batch");
    const batchSummaryTotals = isRecord(metadata.batch_summary_totals)
      ? (metadata.batch_summary_totals as ParsedSimBatchSummary)
      : null;
    const persistenceMismatch = summarizePersistenceMismatch({
      requestedGames,
      executedGames: batchSummaryTotals?.gamesPlayed ?? scopedCounts.matches,
      executedHands: batchSummaryTotals?.handsPlayed ?? 0,
      executedDecisions:
        batchSummaryTotals?.decisionsRecorded ?? scopedCounts.decisions,
      executedEvents: batchSummaryTotals?.eventsRecorded ?? scopedCounts.events,
      persistedMatches: scopedCounts.matches,
      persistedDecisions: scopedCounts.decisions,
      persistedEvents: scopedCounts.events
    });
    metadata.completed_scoped_matches = scopedCounts.matches;
    metadata.completed_scoped_decisions = scopedCounts.decisions;
    metadata.completed_scoped_events = scopedCounts.events;
    metadata.scoped_provider_distribution = scopedProviderDistribution;
    metadata.concurrent_writer_overlap = concurrentWriterOverlap;
    metadata.persistence_mismatch = persistenceMismatch;
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
      requested_provider: metadataString(metadata, "provider"),
      global_counts: globalCounts,
      scoped_counts: scopedCounts,
      scoped_provider_distribution: scopedProviderDistribution,
      batch_summary_totals: batchSummaryTotals,
      persistence_mismatch: persistenceMismatch,
      concurrent_writer_overlap: concurrentWriterOverlap,
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

  metadata.telemetry_flush_status = await waitForTelemetryFlush(
    metadataString(metadata, "backend_url")
  );

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
    [
      metadataString(metadata, "telemetry_finalize_summary_file"),
      path.join(exportDirectory, "telemetry_finalize_summary.json"),
    ],
    [
      metadataString(metadata, "telemetry_validation_summary_file"),
      path.join(exportDirectory, "telemetry_validation_summary.json"),
    ],
    [
      metadataString(metadata, "telemetry_run_validation_summary_file"),
      path.join(exportDirectory, "telemetry_run_validation_summary.json"),
    ],
    [
      metadataString(metadata, "telemetry_readiness_summary_file"),
      path.join(exportDirectory, "telemetry_readiness_summary.json"),
    ],
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

  const telemetryReadinessArtifacts = await collectTelemetryReadinessArtifacts(
    metadata,
    pgPassword
  );
  metadata.telemetry_readiness_status = telemetryReadinessArtifacts.readiness.ok
    ? "ready"
    : "failed";
  logVerification(verificationLog, {
    event: "telemetry_readiness",
    readiness_ok: telemetryReadinessArtifacts.readiness.ok,
    readiness_failures: telemetryReadinessArtifacts.readiness.failures,
    finalize_summary: telemetryReadinessArtifacts.finalizeSummary
  });

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

export function buildTrainingSimArgs(config: {
  metadata: TrainingMetadata;
  remainingGames: number;
  batchId: string;
  batchSeed: string;
  batchGameIdPrefix: string;
}): string[] {
  const decisionTimeoutMs =
    metadataOptionalNumber(config.metadata, "decision_timeout_ms") ?? 2000;
  const explorationProfile =
    typeof config.metadata["exploration_profile"] === "string" &&
    `${config.metadata["exploration_profile"]}`.trim().length > 0
      ? `${config.metadata["exploration_profile"]}`.trim()
      : "off";
  const explorationRate = metadataOptionalNumber(
    config.metadata,
    "exploration_rate"
  );
  const explorationTopN = metadataOptionalNumber(
    config.metadata,
    "exploration_top_n"
  );
  const explorationMaxScoreGap = metadataOptionalNumber(
    config.metadata,
    "exploration_max_score_gap"
  );
  const args = [
    "run",
    "sim",
    "--",
    "--games",
    String(config.remainingGames),
    "--provider",
    metadataString(config.metadata, "provider"),
    "--backend-url",
    metadataString(config.metadata, "backend_url"),
    "--telemetry",
    "true",
    "--strict-telemetry",
    metadataBoolean(config.metadata, "strict_telemetry") ? "true" : "false",
    "--telemetry-mode",
    metadataString(config.metadata, "telemetry_mode"),
    "--seed",
    config.batchSeed,
    "--seed-prefix",
    "training-data",
    "--run-id",
    metadataString(config.metadata, "run_id"),
    "--batch-id",
    config.batchId,
    "--game-id-prefix",
    config.batchGameIdPrefix,
    "--seed-hash",
    metadataString(config.metadata, "seed_hash")
  ];
  if (decisionTimeoutMs > 0) {
    args.push("--decision-timeout-ms", String(decisionTimeoutMs));
  }
  args.push("--exploration-profile", explorationProfile);
  if (explorationProfile !== "off") {
    if (explorationRate !== null && explorationRate > 0) {
      args.push("--exploration-rate", String(explorationRate));
    }
    if (explorationTopN !== null && explorationTopN > 0) {
      args.push("--exploration-top-n", String(explorationTopN));
    }
    if (explorationMaxScoreGap !== null && explorationMaxScoreGap > 0) {
      args.push(
        "--exploration-max-score-gap",
        String(explorationMaxScoreGap)
      );
    }
  }
  args.push("--progress");
  return args;
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
      const args = buildTrainingSimArgs({
        metadata,
        remainingGames,
        batchId,
        batchSeed,
        batchGameIdPrefix
      });
      const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
      const command = formatTrainingSimCommandForLog(npmCommand, args);
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
      let result;
      try {
        result = await runStreamingProcess({
          command: npmCommand,
          args,
          cwd: repoRoot,
          logFile: runLog,
          mirrorToParent: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        metadata.sim_exit_code = 1;
        metadata.sim_exit_signal = null;
        metadata.sim_command = command;
        metadata.sim_args = args;
        metadata.sim_cwd = repoRoot;
        metadata.sim_child_started_at = nowIso();
        metadata.sim_child_finished_at = nowIso();
        metadata.output_tail = [errorMessage];
        metadata.failure_reason = `sim launch failed: ${errorMessage}`;
        saveMetadata(metadataFile, metadata);
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_launch_failure",
            batch_id: batchId,
            command,
            error: errorMessage,
          })
        );
        fatalError = new Error(metadata.failure_reason);
        break;
      }
      metadata.sim_exit_code = result.exitCode;
      metadata.sim_exit_signal = result.signal;
      metadata.sim_command = command;
      metadata.sim_args = args;
      metadata.sim_cwd = repoRoot;
      metadata.sim_child_started_at = result.startedAt;
      metadata.sim_child_finished_at = result.finishedAt;
      metadata.output_tail = result.outputTail;
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
            signal: result.signal,
            error: result.errorMessage,
            enobufs_detected: result.enobufsDetected,
            output_tail: result.outputTail,
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
          started_at: result.startedAt,
          finished_at: result.finishedAt,
        })
      );
      const parsedSummary = parseSimBatchSummaryFromLines(result.outputTail);
      if (parsedSummary) {
        const mergedSummary = mergeBatchSummaries(
          isRecord(metadata.batch_summary_totals)
            ? (metadata.batch_summary_totals as ParsedSimBatchSummary)
            : null,
          parsedSummary
        );
        metadata.batch_summary_totals = mergedSummary;
        metadata.provider_used_distribution = { ...mergedSummary.providerUsage };
        metadata.fallback_count = mergedSummary.fallbackCount;
        metadata.decision_provider_failures =
          mergedSummary.decisionProviderFailures;
        metadata.decision_timeout_count = mergedSummary.decisionTimeoutCount;
        metadata.invalid_decision_count = mergedSummary.invalidDecisionCount;
        metadata.average_latency_by_provider = {
          ...mergedSummary.averageLatencyByProvider
        };
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_provider_summary",
            batch_id: batchId,
            games_played: parsedSummary.gamesPlayed,
            hands_played: parsedSummary.handsPlayed,
            decisions_recorded: parsedSummary.decisionsRecorded,
            events_recorded: parsedSummary.eventsRecorded,
            requested_provider: metadataString(metadata, "provider"),
            provider_used_counts: parsedSummary.providerUsage,
            fallback_count: parsedSummary.fallbackCount,
            decision_provider_failures: parsedSummary.decisionProviderFailures,
            decision_timeout_count: parsedSummary.decisionTimeoutCount,
            invalid_decision_count: parsedSummary.invalidDecisionCount,
            telemetry_runtime: parsedSummary.telemetryRuntime,
            average_latency_by_provider:
              parsedSummary.averageLatencyByProvider
          })
        );
      }
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
          batchNumber === 1 &&
          afterSnapshot.scoped_counts.matches === 0 &&
          afterSnapshot.scoped_counts.decisions === 0 &&
          afterSnapshot.scoped_counts.events === 0
            ? "sim exited before producing scoped matches, decisions, or events"
            : "sim exited without increasing scoped matches, decisions, or events";
        saveMetadata(metadataFile, metadata);
        appendLine(
          runLog,
          JSON.stringify({
            ts: nowIso(),
            event: "batch_progress_stalled",
            batch_id: batchId,
            scoped_counts: afterSnapshot.scoped_counts,
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
      fatalError =
        error instanceof Error ? error : new Error(String(error));
      appendLine(
        runLog,
        JSON.stringify({
          ts: nowIso(),
          event: "finalize_error",
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
  if (fatalError) {
    throw fatalError;
  }
}

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function attemptLabel(index: number): string {
  return `attempt-${String(index).padStart(3, "0")}`;
}

async function readinessLoop(options: CliOptions): Promise<void> {
  const repoRoot = path.resolve(
    optionOptionalString(options, "repo-root") ?? repoRootFromScript()
  );
  const trainingRunsRoot = path.resolve(
    optionOptionalString(options, "training-runs-root") ??
      path.join(repoRoot, "training-runs")
  );
  const readinessRoot = path.resolve(
    optionOptionalString(options, "readiness-root") ??
      path.join(
        trainingRunsRoot,
        `telemetry-readiness-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}`
      )
  );
  const maxAttempts = optionNumber(options, "max-attempts", 3);
  const baseSessionName =
    optionOptionalString(options, "session-name") ?? "telemetry-readiness";
  const attemptRecords: Array<Record<string, unknown>> = [];
  const summaryFile = path.join(readinessRoot, "readiness-summary.json");
  fs.mkdirSync(readinessRoot, { recursive: true });

  for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
    const label = attemptLabel(attemptIndex);
    const attemptRunDirectory = path.join(readinessRoot, label);
    const attemptSessionName = sanitizeSessionName(
      `${baseSessionName}-${label}`
    );
    const attemptOptions: CliOptions = {
      ...options,
      "repo-root": repoRoot,
      "training-runs-root": trainingRunsRoot,
      "run-directory": attemptRunDirectory,
      "session-name": attemptSessionName,
      "provider": optionString(options, "provider", "server_heuristic"),
      "backend-url": optionString(options, "backend-url", "http://127.0.0.1:4310"),
      "telemetry-mode": optionString(options, "telemetry-mode", "full"),
      "strict-telemetry": optionBoolean(options, "strict-telemetry", false),
      "games-per-batch": String(
        optionNumber(options, "games-per-batch", optionNumber(options, "games", 1000))
      ),
      "pg-host": optionString(options, "pg-host", "127.0.0.1"),
      "pg-port": optionString(options, "pg-port", "54329"),
      "pg-user": optionString(options, "pg-user", "tichu"),
      "pg-db": optionString(options, "pg-db", "tichu"),
      "ml-export-command": optionString(options, "ml-export-command", "npm run ml:export"),
      "ml-export-check-enabled": optionBoolean(
        options,
        "ml-export-check-enabled",
        true
      ),
      "allow-unhealthy-backend": optionBoolean(
        options,
        "allow-unhealthy-backend",
        false
      ),
      "allow-conflicting-writers": false,
      "clear-database": true
    };
    if (optionOptionalString(options, "pg-password-file")) {
      attemptOptions["pg-password-file"] = optionString(
        options,
        "pg-password-file"
      );
    } else {
      attemptOptions["pg-password"] = optionString(
        options,
        "pg-password",
        "tichu_dev_password"
      );
    }
    const allowClearDbName = optionOptionalString(options, "allow-clear-db-name");
    if (allowClearDbName) {
      attemptOptions["allow-clear-db-name"] = allowClearDbName;
    }

    const metadata = await buildPreparedRunMetadata(attemptOptions);
    const metadataFile = metadataString(metadata, "metadata_file");
    saveMetadata(metadataFile, metadata);

    let errorMessage: string | null = null;
    try {
      await prepareDatabase({
        ...attemptOptions,
        "metadata-file": metadataFile
      });
      await runLoop({
        ...attemptOptions,
        "metadata-file": metadataFile
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const finalMetadata = loadMetadata(metadataFile);
    const readinessSummary = readJsonFileIfExists(
      metadataString(finalMetadata, "telemetry_readiness_summary_file")
    );
    const readinessOk =
      finalMetadata.telemetry_readiness_status === "ready" &&
      isRecord(readinessSummary) &&
      readinessSummary.ok === true;
    const attemptRecord = {
      attempt: attemptIndex,
      label,
      run_id: finalMetadata.run_id ?? metadata.run_id ?? null,
      session_name: finalMetadata.session_name ?? metadata.session_name ?? null,
      run_directory: finalMetadata.run_directory ?? metadata.run_directory ?? null,
      metadata_file: metadataFile,
      readiness_ok: readinessOk,
      readiness_status: finalMetadata.telemetry_readiness_status ?? "unknown",
      failure_reason: finalMetadata.failure_reason ?? null,
      controller_error: errorMessage,
      telemetry_readiness_summary_file:
        finalMetadata.telemetry_readiness_summary_file ?? null,
      telemetry_readiness_summary: readinessSummary
    };
    attemptRecords.push(attemptRecord);
    writeJson(summaryFile, {
      repo_root: repoRoot,
      readiness_root: readinessRoot,
      max_attempts: maxAttempts,
      attempts_completed: attemptRecords.length,
      attempts: attemptRecords
    });

    if (readinessOk) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            readiness_root: readinessRoot,
            summary_file: summaryFile,
            attempts_completed: attemptRecords.length,
            winning_attempt: attemptRecord,
            attempts: attemptRecords
          },
          null,
          2
        )}\n`
      );
      return;
    }
  }

  const finalSummary = {
    ok: false,
    readiness_root: readinessRoot,
    summary_file: summaryFile,
    attempts_completed: attemptRecords.length,
    attempts: attemptRecords
  };
  process.stdout.write(`${JSON.stringify(finalSummary, null, 2)}\n`);
  throw new Error("Telemetry readiness loop exhausted all attempts without a clean run.");
}

async function main(): Promise<void> {
  const { command, options } = parseCliOptions(process.argv.slice(2));
  if (command === "locate-run") {
    const metadataFile = findTrainingRunMetadataFile(
      optionString(options, "repo-root"),
      {
        sessionName: optionOptionalString(options, "session-name") ?? undefined,
        gameIdPrefix:
          optionOptionalString(options, "game-id-prefix") ?? undefined,
        runId: optionOptionalString(options, "run-id") ?? undefined,
      }
    );
    if (!metadataFile) {
      throw new Error("No training metadata matched the requested filters.");
    }
    process.stdout.write(`${metadataFile}\n`);
    return;
  }
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
  if (command === "status-run") {
    await statusRun(options);
    return;
  }
  if (command === "wait-for-start") {
    await waitForStart(options);
    return;
  }
  if (command === "run-loop") {
    await runLoop(options);
    return;
  }
  if (command === "readiness-loop") {
    await readinessLoop(options);
    return;
  }
  if (command === "finalize-run") {
    const metadata = loadMetadata(path.resolve(optionString(options, "metadata-file")));
    await finalizeRun(metadata, resolvePassword(options));
    return;
  }
  throw new Error(`Unknown training-data command: ${command}`);
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
