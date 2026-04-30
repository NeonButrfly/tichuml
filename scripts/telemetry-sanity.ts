import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import postgres from "postgres";
import {
  areDecisionProvidersEquivalent,
  normalizeDecisionProviderName
} from "@tichuml/shared";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";

type Args = {
  backendUrl: string | null;
  databaseUrl: string | null;
  jsonOutput: string | null;
};

type ProviderRow = {
  requested_provider: string | null;
  provider_used: string | null;
  fallback_used: boolean | null;
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

async function fetchTelemetryHealth(
  backendUrl: string | null
): Promise<unknown> {
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

function summarizeProviderRows(rows: ProviderRow[]): {
  providerMismatchCount: number;
  falseFallbackSuspicionCount: number;
} {
  let providerMismatchCount = 0;
  let falseFallbackSuspicionCount = 0;
  for (const row of rows) {
    const requested = normalizeDecisionProviderName(row.requested_provider);
    const used = normalizeDecisionProviderName(row.provider_used);
    if (
      row.requested_provider &&
      row.provider_used &&
      requested !== "unknown" &&
      used !== "unknown" &&
      requested !== used
    ) {
      providerMismatchCount += 1;
    }
    if (
      row.fallback_used === true &&
      areDecisionProvidersEquivalent(row.requested_provider, row.provider_used)
    ) {
      falseFallbackSuspicionCount += 1;
    }
  }
  return { providerMismatchCount, falseFallbackSuspicionCount };
}

function rate(passing: number, total: number): number | null {
  return total > 0 ? Number((passing / total).toFixed(6)) : null;
}

function printHumanSummary(summary: Record<string, unknown>): void {
  const metrics = summary.metrics as Record<string, unknown>;
  console.log("Telemetry sanity summary");
  console.log(`- matches: ${metrics.match_count}`);
  console.log(`- completed matches: ${metrics.completed_match_count}`);
  console.log(`- decisions: ${metrics.decision_count}`);
  console.log(`- events: ${metrics.event_count}`);
  console.log(`- provider mismatches: ${metrics.provider_mismatch_count}`);
  console.log(
    `- false fallback suspicions: ${metrics.false_fallback_suspicion_count}`
  );
  console.log(`- active wish decisions: ${metrics.active_wish_decision_count}`);
  console.log(`- active wish events: ${metrics.active_wish_event_count}`);
  console.log(`- Mahjong played: ${metrics.mahjong_played_count}`);
  console.log(
    `- Mahjong with wish rank: ${metrics.mahjong_with_wish_rank_count}`
  );
  console.log(
    `- Mahjong available but skipped: ${metrics.mahjong_wish_available_but_skipped_count}`
  );
  console.log(
    `- required wish violations: ${metrics.required_wish_violation_count}`
  );
  console.log(
    `- legal chosen action pass rate: ${metrics.legal_chosen_action_pass_rate}`
  );
  console.log(
    `- select_pass semantic pass rate: ${metrics.select_pass_semantic_validation_pass_rate}`
  );
  console.log(
    `- candidate score coverage rate: ${metrics.candidate_score_coverage_rate}`
  );
  console.log(`- event ordering problems: ${metrics.event_ordering_problems}`);
  console.log(`- JSON parse errors: ${metrics.json_parse_errors}`);
  console.log(`- training readiness: ${summary.training_readiness_verdict}`);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof AggregateError) {
    return {
      name: error.name,
      message: error.message || "AggregateError",
      errors: error.errors.map((entry) => serializeError(entry))
    };
  }
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause !== undefined
        ? { cause: serializeError(error.cause) }
        : {};
    return {
      name: error.name,
      message: error.message || error.name,
      stack: error.stack,
      ...cause
    };
  }
  if (typeof error === "object" && error !== null) {
    return {
      name: "object",
      message: JSON.stringify(error)
    };
  }
  return {
    name: typeof error,
    message: String(error)
  };
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
    const [counts] = await sql<
      Array<{
        match_count: number;
        completed_match_count: number;
        decision_count: number;
        event_count: number;
        active_wish_decision_count: number;
        active_wish_event_count: number;
        legal_chosen_action_count: number;
        select_pass_count: number;
        select_pass_legal_count: number;
        candidate_score_covered_count: number;
        candidate_score_denominator: number;
        mahjong_played_count: number;
        mahjong_with_wish_rank_count: number;
        mahjong_without_wish_rank_count: number;
        mahjong_wish_available_but_skipped_count: number;
        required_wish_fulfilled_count: number;
        required_wish_violation_count: number;
        wish_considered_tichu_pressure_count: number;
        wish_considered_grand_tichu_pressure_count: number;
      }>
    >`
      WITH decision_flags AS (
        SELECT
          *,
          (
            metadata->>'mahjong_played' = 'true'
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                COALESCE(chosen_action->'cardIds', '[]'::jsonb)
              ) AS card_ids(card_id)
              WHERE card_id = 'mahjong'
            )
          ) AS mahjong_played_flag,
          (
            metadata->>'mahjong_wish_available' = 'true'
            OR jsonb_array_length(
              COALESCE(chosen_action->'availableWishRanks', '[]'::jsonb)
            ) > 0
          ) AS mahjong_wish_available_flag,
          (
            metadata->>'mahjong_wish_selected' = 'true'
            OR chosen_action ? 'wishRank'
          ) AS mahjong_wish_selected_flag
        FROM decisions
      )
      SELECT
        (SELECT COUNT(*)::INTEGER FROM matches) AS match_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM matches
          WHERE completed_at IS NOT NULL OR status = 'completed'
        ) AS completed_match_count,
        (SELECT COUNT(*)::INTEGER FROM decisions) AS decision_count,
        (SELECT COUNT(*)::INTEGER FROM events) AS event_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE has_wish
             OR metadata->>'wish_active' = 'true'
             OR metadata->>'current_wish' IS NOT NULL
        ) AS active_wish_decision_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM events
          WHERE metadata->>'wish_active' = 'true'
             OR state_norm->>'currentWish' IS NOT NULL
        ) AS active_wish_event_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE chosen_action_is_legal
        ) AS legal_chosen_action_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE chosen_action_type = 'select_pass'
        ) AS select_pass_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE chosen_action_type = 'select_pass'
            AND chosen_action_is_legal
        ) AS select_pass_legal_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE metadata->>'chosen_action_has_scored_candidate' = 'true'
             OR COALESCE(metadata->>'chosen_action_unscored_reason', '') <> ''
        ) AS candidate_score_covered_count,
        (SELECT COUNT(*)::INTEGER FROM decision_flags) AS candidate_score_denominator,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE mahjong_played_flag
        ) AS mahjong_played_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE mahjong_played_flag
            AND mahjong_wish_selected_flag
        ) AS mahjong_with_wish_rank_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE mahjong_played_flag
            AND NOT mahjong_wish_selected_flag
        ) AS mahjong_without_wish_rank_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE mahjong_played_flag
            AND mahjong_wish_available_flag
            AND NOT mahjong_wish_selected_flag
        ) AS mahjong_wish_available_but_skipped_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE metadata->>'wish_fulfillment_required' = 'true'
            AND metadata->>'chosen_action_fulfilled_wish' = 'true'
        ) AS required_wish_fulfilled_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE metadata->>'chosen_action_failed_required_wish' = 'true'
        ) AS required_wish_violation_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE metadata->>'wish_considered_tichu_pressure' = 'true'
        ) AS wish_considered_tichu_pressure_count,
        (
          SELECT COUNT(*)::INTEGER
          FROM decision_flags
          WHERE metadata->>'wish_considered_grand_tichu_pressure' = 'true'
        ) AS wish_considered_grand_tichu_pressure_count
    `;
    const skippedReasonRows = await sql<
      Array<{ reason: string; count: number }>
    >`
      SELECT
        COALESCE(metadata->>'mahjong_wish_skipped_reason', 'unknown') AS reason,
        COUNT(*)::INTEGER AS count
      FROM decisions
      WHERE metadata->>'mahjong_played' = 'true'
        AND metadata->>'mahjong_wish_available' = 'true'
        AND metadata->>'mahjong_wish_selected' <> 'true'
      GROUP BY reason
      ORDER BY count DESC, reason ASC
    `;
    const wishReasonRows = await sql<Array<{ reason: string; count: number }>>`
      SELECT
        COALESCE(metadata->>'wish_reason', 'unknown') AS reason,
        COUNT(*)::INTEGER AS count
      FROM decisions
      WHERE metadata->>'mahjong_played' = 'true'
        AND COALESCE(metadata->>'wish_reason', '') <> ''
      GROUP BY reason
      ORDER BY count DESC, reason ASC
    `;
    const [ordering] = await sql<
      Array<{
        duplicate_event_indexes: number;
        nonmonotonic_insert_order_events: number;
      }>
    >`
      WITH ordered_events AS (
        SELECT
          game_id,
          hand_id,
          event_index,
          LAG(event_index) OVER (
            PARTITION BY game_id, hand_id
            ORDER BY created_at ASC, id ASC
          ) AS previous_event_index
        FROM events
      ),
      duplicate_indexes AS (
        SELECT game_id, hand_id, event_index
        FROM events
        GROUP BY game_id, hand_id, event_index
        HAVING COUNT(*) > 1
      )
      SELECT
        (SELECT COUNT(*)::INTEGER FROM duplicate_indexes) AS duplicate_event_indexes,
        (
          SELECT COUNT(*)::INTEGER
          FROM ordered_events
          WHERE previous_event_index IS NOT NULL
            AND event_index < previous_event_index
        ) AS nonmonotonic_insert_order_events
    `;
    const providerRows = [
      ...(await sql<ProviderRow[]>`
        SELECT requested_provider, provider_used, fallback_used FROM decisions
      `),
      ...(await sql<ProviderRow[]>`
        SELECT requested_provider, provider_used, fallback_used FROM events
      `)
    ];
    const providerSummary = summarizeProviderRows(providerRows);
    const telemetryHealth = await fetchTelemetryHealth(args.backendUrl).catch(
      (error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    const rowCounts = counts ?? {
      match_count: 0,
      completed_match_count: 0,
      decision_count: 0,
      event_count: 0,
      active_wish_decision_count: 0,
      active_wish_event_count: 0,
      legal_chosen_action_count: 0,
      select_pass_count: 0,
      select_pass_legal_count: 0,
      candidate_score_covered_count: 0,
      candidate_score_denominator: 0,
      mahjong_played_count: 0,
      mahjong_with_wish_rank_count: 0,
      mahjong_without_wish_rank_count: 0,
      mahjong_wish_available_but_skipped_count: 0,
      required_wish_fulfilled_count: 0,
      required_wish_violation_count: 0,
      wish_considered_tichu_pressure_count: 0,
      wish_considered_grand_tichu_pressure_count: 0
    };
    const orderingCounts = ordering ?? {
      duplicate_event_indexes: 0,
      nonmonotonic_insert_order_events: 0
    };
    const eventOrderingProblems =
      orderingCounts.duplicate_event_indexes +
      orderingCounts.nonmonotonic_insert_order_events;
    const legalPassRate = rate(
      rowCounts.legal_chosen_action_count,
      rowCounts.decision_count
    );
    const selectPassRate = rate(
      rowCounts.select_pass_legal_count,
      rowCounts.select_pass_count
    );
    const candidateCoverageRate = rate(
      rowCounts.candidate_score_covered_count,
      rowCounts.candidate_score_denominator
    );
    const trainingReady =
      rowCounts.completed_match_count > 0 &&
      rowCounts.decision_count > 0 &&
      rowCounts.event_count > 0 &&
      providerSummary.falseFallbackSuspicionCount === 0 &&
      eventOrderingProblems === 0 &&
      rowCounts.required_wish_violation_count === 0 &&
      (legalPassRate ?? 0) >= 0.99 &&
      (selectPassRate ?? 1) >= 0.99 &&
      (candidateCoverageRate ?? 0) >= 0.95;
    const summary = {
      ok: trainingReady,
      database_url: sanitizeDatabaseUrl(databaseUrl),
      backend_url: args.backendUrl,
      generated_at: new Date().toISOString(),
      metrics: {
        match_count: rowCounts.match_count,
        completed_match_count: rowCounts.completed_match_count,
        decision_count: rowCounts.decision_count,
        event_count: rowCounts.event_count,
        provider_mismatch_count: providerSummary.providerMismatchCount,
        false_fallback_suspicion_count:
          providerSummary.falseFallbackSuspicionCount,
        active_wish_event_count: rowCounts.active_wish_event_count,
        active_wish_decision_count: rowCounts.active_wish_decision_count,
        mahjong_played_count: rowCounts.mahjong_played_count,
        mahjong_with_wish_rank_count: rowCounts.mahjong_with_wish_rank_count,
        mahjong_without_wish_rank_count:
          rowCounts.mahjong_without_wish_rank_count,
        mahjong_wish_available_but_skipped_count:
          rowCounts.mahjong_wish_available_but_skipped_count,
        mahjong_wish_skipped_reasons: Object.fromEntries(
          skippedReasonRows.map((row) => [row.reason, row.count])
        ),
        wish_reason_counts: Object.fromEntries(
          wishReasonRows.map((row) => [row.reason, row.count])
        ),
        required_wish_fulfilled_count:
          rowCounts.required_wish_fulfilled_count,
        required_wish_violation_count:
          rowCounts.required_wish_violation_count,
        wish_considered_tichu_pressure_count:
          rowCounts.wish_considered_tichu_pressure_count,
        wish_considered_grand_tichu_pressure_count:
          rowCounts.wish_considered_grand_tichu_pressure_count,
        legal_chosen_action_pass_rate: legalPassRate,
        select_pass_semantic_validation_pass_rate: selectPassRate,
        candidate_score_coverage_rate: candidateCoverageRate,
        event_ordering_problems: eventOrderingProblems,
        duplicate_event_indexes: orderingCounts.duplicate_event_indexes,
        nonmonotonic_insert_order_events:
          orderingCounts.nonmonotonic_insert_order_events,
        json_parse_errors: 0
      },
      training_readiness_verdict: trainingReady ? "ready" : "not_ready",
      telemetry_health: telemetryHealth
    };

    printHumanSummary(summary);
    console.log(JSON.stringify(summary, null, 2));
    if (args.jsonOutput) {
      await fs.mkdir(path.dirname(path.resolve(args.jsonOutput)), {
        recursive: true
      });
      await fs.writeFile(
        args.jsonOutput,
        `${JSON.stringify(summary, null, 2)}\n`
      );
    }
    if (!trainingReady) {
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
        error: serializeError(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
