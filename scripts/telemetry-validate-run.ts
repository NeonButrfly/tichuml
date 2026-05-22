import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../apps/server/src/db/postgres.js";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";

export type TelemetryRunValidationScope = {
  game_id_prefix: string | null;
  run_id: string | null;
};

export type TelemetryRunValidationSummary = {
  scope: TelemetryRunValidationScope;
  counts: {
    matches: number;
    events: number;
    decisions: number;
    server_heuristic_decisions: number;
    server_heuristic_trick_play_decisions: number;
    legal_chosen_actions: number;
    state_features_count: number;
    candidate_scores_count: number;
    explanation_count: number;
    reward_count: number;
    invalid_decisions: number;
    exploration_selected_count: number;
    exploration_enabled_count: number;
    fallback_count: number;
    tichu_calls: number;
    grand_tichu_calls: number;
    grand_tichu_declines: number;
    bomb_chosen_count: number;
    pass_select_count: number;
  };
  rewardStats: {
    min: number | null;
    p01: number | null;
    p05: number | null;
    median: number | null;
    mean: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
  };
  phaseDistribution: Array<{ phase: string; count: number }>;
  actionDistribution: Array<{ chosen_action_type: string; count: number }>;
  missingRewardByPhaseProvider: Array<{
    provider_used: string;
    phase: string;
    total: number;
    missing_reward: number;
  }>;
  passDiagnostics: {
    protected_cards_passed: number;
    control_cards_passed: number;
    avg_partner_support: number | null;
    avg_self_structure_delta: number | null;
    avg_dead_singles_delta: number | null;
  };
  matchConsistency: {
    completed_zero_zero: number;
    completed_hands_le_one: number;
    server_mixed_provider_mismatch: number;
  };
  recentGames: string[];
};

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(...names: string[]): boolean {
  return names.some((name) => process.argv.includes(name));
}

function printHelp(): void {
  console.log(`Usage: npm run telemetry:validate-run -- --game-id-prefix <prefix> [--run-id <id>] [--database-url <url>]

Validates one scoped training/self-play run and prints counts, coverage, reward stats,
exploration diagnostics, pass diagnostics, and match consistency checks.
`);
}

function resolveDatabaseUrl(explicit: string | null): string {
  if (explicit) {
    return explicit;
  }
  const root = repoRoot();
  const diskEnv = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, "apps/server/.env")),
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

function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildScope(): {
  whereSql: string;
  descriptor: TelemetryRunValidationScope;
} {
  const gameIdPrefix = readArg("--game-id-prefix");
  const runId = readArg("--run-id");

  if (gameIdPrefix && gameIdPrefix.trim().length > 0) {
    return {
      whereSql: `game_id LIKE '${escapeLikePrefix(gameIdPrefix.trim())}%' ESCAPE '\\'`,
      descriptor: {
        game_id_prefix: gameIdPrefix.trim(),
        run_id: null,
      },
    };
  }
  if (runId && runId.trim().length > 0) {
    const escapedRunId = runId.trim().replace(/'/g, "''");
    return {
      whereSql: `metadata->>'run_id' = '${escapedRunId}'`,
      descriptor: {
        game_id_prefix: null,
        run_id: runId.trim(),
      },
    };
  } else {
    throw new Error("Pass --game-id-prefix or --run-id to scope validation.");
  }
}

export async function validateTelemetryScopedRun(
  sql: DatabaseClient,
  config: {
    whereSql: string;
    descriptor: TelemetryRunValidationScope;
  }
): Promise<TelemetryRunValidationSummary> {
  const { whereSql, descriptor } = config;
  const [counts] = await sql.unsafe<
    Array<{
      decisions: number;
      events: number;
      matches: number;
      server_heuristic_decisions: number;
      server_heuristic_trick_play_decisions: number;
      legal_chosen_actions: number;
      state_features_count: number;
      candidate_scores_count: number;
      explanation_count: number;
      reward_count: number;
      invalid_decisions: number;
      exploration_selected_count: number;
      exploration_enabled_count: number;
      fallback_count: number;
      tichu_calls: number;
      grand_tichu_calls: number;
      grand_tichu_declines: number;
      bomb_chosen_count: number;
      pass_select_count: number;
    }>
  >(
    `
      WITH scoped_decisions AS (
        SELECT *
        FROM decisions
        WHERE ${whereSql}
      ),
      scoped_events AS (
        SELECT *
        FROM events
        WHERE ${whereSql}
      ),
      scoped_matches AS (
        SELECT *
        FROM matches
        WHERE game_id IN (SELECT DISTINCT game_id FROM scoped_decisions)
      )
      SELECT
        (SELECT COUNT(*)::INTEGER FROM scoped_decisions) AS decisions,
        (SELECT COUNT(*)::INTEGER FROM scoped_events) AS events,
        (SELECT COUNT(*)::INTEGER FROM scoped_matches) AS matches,
        (SELECT COUNT(*) FILTER (WHERE COALESCE(provider_used, policy_source) = 'server_heuristic')::INTEGER FROM scoped_decisions) AS server_heuristic_decisions,
        (SELECT COUNT(*) FILTER (WHERE COALESCE(provider_used, policy_source) = 'server_heuristic' AND phase = 'trick_play')::INTEGER FROM scoped_decisions) AS server_heuristic_trick_play_decisions,
        (SELECT COUNT(*) FILTER (WHERE chosen_action_is_legal)::INTEGER FROM scoped_decisions) AS legal_chosen_actions,
        (SELECT COUNT(*) FILTER (WHERE has_state_features)::INTEGER FROM scoped_decisions) AS state_features_count,
        (SELECT COUNT(*) FILTER (WHERE has_candidate_scores)::INTEGER FROM scoped_decisions) AS candidate_scores_count,
        (SELECT COUNT(*) FILTER (WHERE has_explanation)::INTEGER FROM scoped_decisions) AS explanation_count,
        (SELECT COUNT(*) FILTER (WHERE outcome_reward IS NOT NULL)::INTEGER FROM scoped_decisions) AS reward_count,
        (SELECT COUNT(*) FILTER (WHERE NOT chosen_action_is_legal)::INTEGER FROM scoped_decisions) AS invalid_decisions,
        (SELECT COUNT(*) FILTER (WHERE COALESCE((explanation->'exploration'->>'exploration_selected')::BOOLEAN, FALSE))::INTEGER FROM scoped_decisions) AS exploration_selected_count,
        (SELECT COUNT(*) FILTER (WHERE COALESCE((explanation->'exploration'->>'exploration_enabled')::BOOLEAN, FALSE))::INTEGER FROM scoped_decisions) AS exploration_enabled_count,
        (SELECT COUNT(*) FILTER (WHERE fallback_used)::INTEGER FROM scoped_decisions) AS fallback_count,
        (SELECT COUNT(*) FILTER (WHERE chosen_action_type = 'call_tichu')::INTEGER FROM scoped_decisions) AS tichu_calls,
        (SELECT COUNT(*) FILTER (WHERE chosen_action_type = 'call_grand_tichu')::INTEGER FROM scoped_decisions) AS grand_tichu_calls,
        (SELECT COUNT(*) FILTER (WHERE chosen_action_type = 'decline_grand_tichu')::INTEGER FROM scoped_decisions) AS grand_tichu_declines,
        (SELECT COUNT(*) FILTER (
          WHERE chosen_action_type = 'play_cards'
            AND (
              COALESCE((chosen_action->'combination'->>'isBomb')::BOOLEAN, FALSE)
              OR COALESCE((explanation->'selectedFeatures'->>'uses_bomb')::BOOLEAN, FALSE)
            )
        )::INTEGER FROM scoped_decisions) AS bomb_chosen_count,
        (SELECT COUNT(*) FILTER (WHERE phase = 'pass_select')::INTEGER FROM scoped_decisions) AS pass_select_count
      `,
  );

  const [rewardStats] = await sql.unsafe<
    Array<{
      min: number | null;
      p01: number | null;
      p05: number | null;
      median: number | null;
      mean: number | null;
      p95: number | null;
      p99: number | null;
      max: number | null;
    }>
  >(
    `
      SELECT
        MIN(outcome_reward)::DOUBLE PRECISION AS min,
        PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY outcome_reward)::DOUBLE PRECISION AS p01,
        PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY outcome_reward)::DOUBLE PRECISION AS p05,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY outcome_reward)::DOUBLE PRECISION AS median,
        AVG(outcome_reward)::DOUBLE PRECISION AS mean,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY outcome_reward)::DOUBLE PRECISION AS p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY outcome_reward)::DOUBLE PRECISION AS p99,
        MAX(outcome_reward)::DOUBLE PRECISION AS max
      FROM decisions
      WHERE ${whereSql}
        AND outcome_reward IS NOT NULL
      `,
  );

  const phaseDistribution = await sql.unsafe<
    Array<{ phase: string; count: number }>
  >(
    `
      SELECT phase, COUNT(*)::INTEGER AS count
      FROM decisions
      WHERE ${whereSql}
      GROUP BY phase
      ORDER BY count DESC, phase ASC
      `,
  );

  const actionDistribution = await sql.unsafe<
    Array<{ chosen_action_type: string; count: number }>
  >(
    `
      SELECT chosen_action_type, COUNT(*)::INTEGER AS count
      FROM decisions
      WHERE ${whereSql}
      GROUP BY chosen_action_type
      ORDER BY count DESC, chosen_action_type ASC
      `,
  );

  const missingRewardByPhaseProvider = await sql.unsafe<
    Array<{
      provider_used: string;
      phase: string;
      total: number;
      missing_reward: number;
    }>
  >(
    `
      SELECT
        COALESCE(provider_used, policy_source, 'unknown') AS provider_used,
        phase,
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE outcome_reward IS NULL)::INTEGER AS missing_reward
      FROM decisions
      WHERE ${whereSql}
      GROUP BY COALESCE(provider_used, policy_source, 'unknown'), phase
      ORDER BY missing_reward DESC, total DESC, provider_used ASC, phase ASC
      `,
  );

  const [passDiagnostics] = await sql.unsafe<
    Array<{
      protected_cards_passed: number;
      control_cards_passed: number;
      avg_partner_support: number | null;
      avg_self_structure_delta: number | null;
      avg_dead_singles_delta: number | null;
    }>
  >(
    `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE((explanation->'selectedPassBundle'->>'protected_card_passed')::BOOLEAN, FALSE))::INTEGER AS protected_cards_passed,
        COUNT(*) FILTER (WHERE COALESCE((explanation->'selectedPassBundle'->>'control_card_passed')::BOOLEAN, FALSE))::INTEGER AS control_cards_passed,
        AVG((explanation->'selectedPassBundle'->>'partner_support_score')::DOUBLE PRECISION)::DOUBLE PRECISION AS avg_partner_support,
        AVG((explanation->'selectedPassBundle'->>'self_structure_delta')::DOUBLE PRECISION)::DOUBLE PRECISION AS avg_self_structure_delta,
        AVG((explanation->'selectedPassBundle'->>'dead_singles_delta')::DOUBLE PRECISION)::DOUBLE PRECISION AS avg_dead_singles_delta
      FROM decisions
      WHERE ${whereSql}
        AND phase = 'pass_select'
      `,
  );

  const [matchConsistency] = await sql.unsafe<
    Array<{
      completed_zero_zero: number;
      completed_hands_le_one: number;
      server_mixed_provider_mismatch: number;
    }>
  >(
    `
      WITH decision_provider_majority AS (
        SELECT
          game_id,
          COUNT(*) FILTER (WHERE COALESCE(provider_used, policy_source) = 'server_heuristic')::INTEGER AS server_decisions,
          COUNT(*)::INTEGER AS total_decisions
        FROM decisions
        WHERE ${whereSql}
        GROUP BY game_id
      ),
      decision_hand_counts AS (
        SELECT game_id, COUNT(DISTINCT hand_id)::INTEGER AS observed_hands
        FROM decisions
        WHERE ${whereSql}
        GROUP BY game_id
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed' AND final_team_0_score = 0 AND final_team_1_score = 0)::INTEGER AS completed_zero_zero,
        COUNT(*) FILTER (WHERE status = 'completed' AND COALESCE(hands_played, 0) <= 1 AND COALESCE(decision_hand_counts.observed_hands, 0) > 1)::INTEGER AS completed_hands_le_one,
        COUNT(*) FILTER (WHERE decision_provider_majority.server_decisions > 0 AND decision_provider_majority.server_decisions >= GREATEST(1, decision_provider_majority.total_decisions / 2) AND provider = 'system_local')::INTEGER AS server_mixed_provider_mismatch
      FROM matches
      LEFT JOIN decision_provider_majority USING (game_id)
      LEFT JOIN decision_hand_counts USING (game_id)
      WHERE game_id IN (SELECT DISTINCT game_id FROM decisions WHERE ${whereSql})
      `,
  );

  const recentGames = await sql.unsafe<Array<{ game_id: string }>>(
    `
      SELECT DISTINCT game_id
      FROM decisions
      WHERE ${whereSql}
      ORDER BY game_id DESC
      LIMIT 10
      `,
  );

  return {
    scope: descriptor,
    counts: counts ?? {
      matches: 0,
      events: 0,
      decisions: 0,
      server_heuristic_decisions: 0,
      server_heuristic_trick_play_decisions: 0,
      legal_chosen_actions: 0,
      state_features_count: 0,
      candidate_scores_count: 0,
      explanation_count: 0,
      reward_count: 0,
      invalid_decisions: 0,
      exploration_selected_count: 0,
      exploration_enabled_count: 0,
      fallback_count: 0,
      tichu_calls: 0,
      grand_tichu_calls: 0,
      grand_tichu_declines: 0,
      bomb_chosen_count: 0,
      pass_select_count: 0
    },
    rewardStats: rewardStats ?? {
      min: null,
      p01: null,
      p05: null,
      median: null,
      mean: null,
      p95: null,
      p99: null,
      max: null
    },
    phaseDistribution,
    actionDistribution,
    missingRewardByPhaseProvider,
    passDiagnostics: passDiagnostics ?? {
      protected_cards_passed: 0,
      control_cards_passed: 0,
      avg_partner_support: null,
      avg_self_structure_delta: null,
      avg_dead_singles_delta: null
    },
    matchConsistency: matchConsistency ?? {
      completed_zero_zero: 0,
      completed_hands_le_one: 0,
      server_mixed_provider_mismatch: 0
    },
    recentGames: recentGames.map((row) => row.game_id)
  };
}

async function main(): Promise<void> {
  if (hasFlag("--help", "-h", "help")) {
    printHelp();
    return;
  }

  const { whereSql, descriptor } = buildScope();
  const sql = createDatabaseClient(resolveDatabaseUrl(readArg("--database-url")));

  try {
    const summary = await validateTelemetryScopedRun(sql, {
      whereSql,
      descriptor
    });

    console.log("Run validation");
    console.log(`- scope: ${descriptor.game_id_prefix ?? descriptor.run_id}`);
    console.log(
      `- matches / decisions / events: ${summary.counts.matches} / ${summary.counts.decisions} / ${summary.counts.events}`,
    );
    console.log(
      `- server_heuristic trick_play decisions: ${summary.counts.server_heuristic_trick_play_decisions}`,
    );
    console.log(
      `- chosen_action_is_legal / has_state_features / has_candidate_scores / has_explanation: ${summary.counts.legal_chosen_actions} / ${summary.counts.state_features_count} / ${summary.counts.candidate_scores_count} / ${summary.counts.explanation_count}`,
    );
    console.log(`- outcome_reward rows: ${summary.counts.reward_count}`);
    console.log(
      `- exploration selected / enabled: ${summary.counts.exploration_selected_count} / ${summary.counts.exploration_enabled_count}`,
    );
    console.log(
      `- tichu / grand_tichu / decline_grand_tichu / bomb chosen: ${summary.counts.tichu_calls} / ${summary.counts.grand_tichu_calls} / ${summary.counts.grand_tichu_declines} / ${summary.counts.bomb_chosen_count}`,
    );
    console.log(
      `- reward min / median / mean / max: ${summary.rewardStats.min ?? "null"} / ${summary.rewardStats.median ?? "null"} / ${summary.rewardStats.mean ?? "null"} / ${summary.rewardStats.max ?? "null"}`,
    );
    console.log(
      `- pass diagnostics protected/control passed: ${summary.passDiagnostics.protected_cards_passed} / ${summary.passDiagnostics.control_cards_passed}`,
    );
    console.log(
      `- match consistency zero-zero / hands<=1 / provider mismatch: ${summary.matchConsistency.completed_zero_zero} / ${summary.matchConsistency.completed_hands_le_one} / ${summary.matchConsistency.server_mixed_provider_mismatch}`,
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
