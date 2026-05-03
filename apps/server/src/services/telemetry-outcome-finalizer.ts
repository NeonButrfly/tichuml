import type { TelemetryDecisionPayload, TelemetryEventPayload } from "@tichuml/shared";
import {
  getOutcomeActorTeamForSeat,
  normalizeOutcomeActorTeam,
  type OutcomeActorTeam,
  type OutcomeAttributionQuality
} from "@tichuml/shared";
import type { DatabaseClient } from "../db/postgres.js";

type DecisionOutcomeContext = {
  actorTeam: OutcomeActorTeam | null;
  trickId: string | null;
  trickIndex: number | null;
  handIndex: number | null;
  gameIndex: number | null;
};

type TrickOutcomeMetadata = {
  trickId: string;
  trickIndex: number | null;
  trickWinnerSeat: string | null;
  trickWinnerTeam: OutcomeActorTeam | null;
  trickPointRecipientSeat: string | null;
  trickPointRecipientTeam: OutcomeActorTeam | null;
  trickPoints: number | null;
  attributionQuality: OutcomeAttributionQuality;
};

type HandOutcomeMetadata = {
  handIndex: number | null;
  handNsScoreDelta: number | null;
  handEwScoreDelta: number | null;
  finalHandWinnerTeam: OutcomeActorTeam | null;
  handResult: Record<string, unknown>;
  tichuComponentByTeam: Record<OutcomeActorTeam, number>;
};

type GameOutcomeMetadata = {
  gameIndex: number | null;
  gameNsFinalScore: number | null;
  gameEwFinalScore: number | null;
  finalGameWinnerTeam: OutcomeActorTeam | null;
  gameResult: Record<string, unknown>;
};

export type TelemetryFinalizeSummary = {
  decisions: number;
  trickAttributed: number;
  handAttributed: number;
  gameAttributed: number;
  rewardAttributed: number;
  exactAttribution: number;
  rangeAttribution: number;
  unknownAttribution: number;
  rewardMin: number | null;
  rewardAvg: number | null;
  rewardMax: number | null;
};

export type TrainingDataValidationSummary = {
  coverage: Record<string, number>;
  rewardStats: {
    min: number | null;
    avg: number | null;
    max: number | null;
  };
  actionDistribution: Record<string, number>;
  phaseDistribution: Record<string, number>;
  providerDistribution: Record<string, number>;
  averageOutcomeRewardByAction: Record<string, number | null>;
  candidateScoreStatsByAction: Record<
    string,
    {
      candidates: number;
      min: number | null;
      avg: number | null;
      max: number | null;
    }
  >;
  aggressionComponentCounts: Record<string, number>;
  warnings: string[];
};

function readJsonObject(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMetadataObject(
  metadata: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | null {
  return readJsonObject(metadata?.[key]);
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && /^-?\d+$/u.test(value)
      ? Number.parseInt(value, 10)
      : null;
}

function readOutcomeQuality(
  metadata: Record<string, unknown> | undefined
): OutcomeAttributionQuality {
  const value = readMetadataString(metadata, "attribution_quality");
  return value === "exact" || value === "range" ? value : "unknown";
}

function readCurrentHandIndex(
  payload: TelemetryDecisionPayload
): number | null {
  const metadata = payload.metadata as Record<string, unknown>;
  const metadataHandIndex =
    readMetadataNumber(metadata, "hand_index") ??
    readMetadataNumber(metadata, "hand_number");
  if (metadataHandIndex !== null) {
    return metadataHandIndex;
  }
  const stateRaw = readJsonObject(payload.state_raw);
  const history = Array.isArray(stateRaw?.matchHistory) ? stateRaw?.matchHistory : null;
  return history ? history.length + 1 : null;
}

export function deriveDecisionOutcomeContext(
  payload: TelemetryDecisionPayload
): DecisionOutcomeContext {
  const metadata = payload.metadata as Record<string, unknown>;
  const trickIndex = readMetadataNumber(metadata, "trick_index");
  const handIndex = readCurrentHandIndex(payload);
  return {
    actorTeam: getOutcomeActorTeamForSeat(payload.actor_seat),
    trickId:
      readMetadataString(metadata, "trick_id") ??
      (trickIndex !== null ? `${payload.hand_id}:trick:${trickIndex}` : null),
    trickIndex,
    handIndex,
    gameIndex: readMetadataNumber(metadata, "game_index") ?? 1
  };
}

function parseTrickOutcomeMetadata(
  payload: TelemetryEventPayload
): TrickOutcomeMetadata | null {
  const metadata = payload.metadata as Record<string, unknown>;
  const trickId = readMetadataString(metadata, "trick_id");
  if (!trickId) {
    return null;
  }
  return {
    trickId,
    trickIndex: readMetadataNumber(metadata, "trick_index"),
    trickWinnerSeat: readMetadataString(metadata, "trick_winner_seat"),
    trickWinnerTeam: normalizeOutcomeActorTeam(
      readMetadataString(metadata, "trick_winner_team")
    ),
    trickPointRecipientSeat: readMetadataString(
      metadata,
      "trick_point_recipient_seat"
    ),
    trickPointRecipientTeam: normalizeOutcomeActorTeam(
      readMetadataString(metadata, "trick_point_recipient_team")
    ),
    trickPoints: readMetadataNumber(metadata, "trick_points"),
    attributionQuality: readOutcomeQuality(metadata)
  };
}

function parseHandOutcomeMetadata(
  payload: TelemetryEventPayload
): HandOutcomeMetadata | null {
  const metadata = payload.metadata as Record<string, unknown>;
  const handResult = readMetadataObject(metadata, "hand_result");
  if (!handResult) {
    return null;
  }
  const tichuComponentByTeam: Record<OutcomeActorTeam, number> = {
    NS: 0,
    EW: 0
  };
  const bonuses = Array.isArray(handResult.tichu_bonuses)
    ? handResult.tichu_bonuses
    : [];
  for (const bonus of bonuses) {
    const bonusObject = readJsonObject(bonus);
    const team = normalizeOutcomeActorTeam(
      typeof bonusObject?.team === "string" ? bonusObject.team : null
    );
    const amountValue = bonusObject?.amount;
    const amount =
      typeof amountValue === "number" && Number.isFinite(amountValue)
        ? amountValue
        : null;
    if (team && amount !== null) {
      tichuComponentByTeam[team] += amount;
    }
  }
  return {
    handIndex:
      readMetadataNumber(metadata, "hand_index") ??
      readMetadataNumber(metadata, "hand_number"),
    handNsScoreDelta: readMetadataNumber(metadata, "hand_ns_score_delta"),
    handEwScoreDelta: readMetadataNumber(metadata, "hand_ew_score_delta"),
    finalHandWinnerTeam: normalizeOutcomeActorTeam(
      readMetadataString(metadata, "final_hand_winner_team")
    ),
    handResult,
    tichuComponentByTeam
  };
}

function parseGameOutcomeMetadata(
  payload: TelemetryEventPayload
): GameOutcomeMetadata | null {
  const metadata = payload.metadata as Record<string, unknown>;
  const gameResult = readMetadataObject(metadata, "game_result");
  if (!gameResult) {
    return null;
  }
  return {
    gameIndex: readMetadataNumber(metadata, "game_index") ?? 1,
    gameNsFinalScore: readMetadataNumber(metadata, "game_ns_final_score"),
    gameEwFinalScore: readMetadataNumber(metadata, "game_ew_final_score"),
    finalGameWinnerTeam: normalizeOutcomeActorTeam(
      readMetadataString(metadata, "final_game_winner_team")
    ),
    gameResult
  };
}

async function recomputeRewardForWhere(
  sql: DatabaseClient,
  whereSql: string,
  params: Array<string | number>
): Promise<void> {
  await sql.unsafe(
    `
      UPDATE decisions
      SET
        outcome_reward = computed.reward,
        outcome_components = computed.components,
        outcome_version = CASE
          WHEN computed.reward IS NULL THEN outcome_version
          ELSE 'outcome_reward_v1'
        END
      FROM (
        SELECT
          id,
          reward_payload.reward,
          reward_payload.components
        FROM (
          SELECT
            id,
            actor_team,
            trick_id,
            trick_winner_team,
            hand_ns_score_delta,
            hand_ew_score_delta,
            actor_team_won_trick,
            trick_points,
            actor_team_won_hand,
            actor_team_won_game,
            hand_result,
            game_result,
            metadata
          FROM decisions
          WHERE ${whereSql}
        ) decision_rows
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN decision_rows.actor_team = 'NS' THEN decision_rows.hand_ns_score_delta
              WHEN decision_rows.actor_team = 'EW' THEN decision_rows.hand_ew_score_delta
              ELSE NULL
            END AS hand_score_delta,
            CASE
              WHEN decision_rows.hand_result ? 'tichu_bonuses' THEN (
                SELECT COALESCE(SUM((bonus->>'amount')::INTEGER), 0)
                FROM jsonb_array_elements(decision_rows.hand_result->'tichu_bonuses') AS bonus
                WHERE
                  CASE
                    WHEN decision_rows.actor_team = 'NS' THEN COALESCE(bonus->>'team', '') IN ('NS', 'team-0')
                    WHEN decision_rows.actor_team = 'EW' THEN COALESCE(bonus->>'team', '') IN ('EW', 'team-1')
                    ELSE FALSE
                  END
              )
              ELSE 0
            END AS tichu_component
        ) hand_components
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN hand_components.hand_score_delta IS NULL THEN NULL
              ELSE hand_components.hand_score_delta +
                CASE
                  WHEN decision_rows.actor_team_won_trick IS TRUE THEN COALESCE(decision_rows.trick_points, 0)
                  WHEN decision_rows.actor_team_won_trick IS FALSE THEN -COALESCE(decision_rows.trick_points, 0)
                  ELSE 0
                END +
                COALESCE(hand_components.tichu_component, 0) +
                CASE WHEN decision_rows.actor_team_won_hand IS TRUE THEN 50 ELSE 0 END +
                CASE WHEN decision_rows.actor_team_won_game IS TRUE THEN 200 ELSE 0 END
            END AS reward,
            CASE
              WHEN hand_components.hand_score_delta IS NULL THEN NULL
              ELSE jsonb_strip_nulls(jsonb_build_object(
                'version', 'outcome_reward_v1',
                'actor_team', decision_rows.actor_team,
                'hand_score_delta', hand_components.hand_score_delta,
                'trick_component',
                  CASE
                    WHEN decision_rows.actor_team_won_trick IS TRUE THEN COALESCE(decision_rows.trick_points, 0)
                    WHEN decision_rows.actor_team_won_trick IS FALSE THEN -COALESCE(decision_rows.trick_points, 0)
                    ELSE 0
                  END,
                'tichu_component', COALESCE(hand_components.tichu_component, 0),
                'hand_bonus', CASE WHEN decision_rows.actor_team_won_hand IS TRUE THEN 50 ELSE 0 END,
                'game_bonus', CASE WHEN decision_rows.actor_team_won_game IS TRUE THEN 200 ELSE 0 END,
                'attribution_quality',
                  CASE
                    WHEN decision_rows.trick_id IS NOT NULL AND decision_rows.trick_winner_team IS NOT NULL THEN 'exact'
                    WHEN decision_rows.hand_result IS NOT NULL OR decision_rows.game_result IS NOT NULL THEN 'range'
                    ELSE 'unknown'
                  END,
                'aggression_context_v1', decision_rows.metadata->'aggression_context_v1'
              ))
            END AS components
        ) reward_payload
      ) AS computed
      WHERE decisions.id = computed.id
    `,
    params
  );
}

export async function applyOutcomeAttributionForDecisionEvent(
  sql: DatabaseClient,
  payload: TelemetryEventPayload
): Promise<void> {
  const trickOutcome = parseTrickOutcomeMetadata(payload);
  if (trickOutcome) {
    const creditedTeam =
      trickOutcome.trickPointRecipientTeam ?? trickOutcome.trickWinnerTeam;
    await sql`
      UPDATE decisions
      SET
        trick_id = ${trickOutcome.trickId},
        trick_index = COALESCE(${trickOutcome.trickIndex}, trick_index),
        trick_winner_seat = ${trickOutcome.trickWinnerSeat},
        trick_winner_team = ${trickOutcome.trickWinnerTeam},
        trick_points = CAST(${trickOutcome.trickPoints} AS INTEGER),
        actor_team_won_trick =
          CASE
            WHEN actor_team IS NULL THEN NULL
            WHEN CAST(${creditedTeam} AS TEXT) IS NULL THEN NULL
            ELSE actor_team = CAST(${creditedTeam} AS TEXT)
          END
      WHERE game_id = ${payload.game_id}
        AND hand_id = ${payload.hand_id}
        AND trick_id = ${trickOutcome.trickId}
    `;
    await recomputeRewardForWhere(
      sql,
      "game_id = $1 AND hand_id = $2 AND trick_id = $3",
      [payload.game_id, payload.hand_id, trickOutcome.trickId]
    );
  }

  const handOutcome = parseHandOutcomeMetadata(payload);
  if (handOutcome) {
    await sql`
      UPDATE decisions
      SET
        hand_index = COALESCE(${handOutcome.handIndex}, hand_index),
        hand_ns_score_delta = CAST(${handOutcome.handNsScoreDelta} AS INTEGER),
        hand_ew_score_delta = CAST(${handOutcome.handEwScoreDelta} AS INTEGER),
        actor_team_hand_score_delta =
          CASE
            WHEN actor_team = 'NS' THEN CAST(${handOutcome.handNsScoreDelta} AS INTEGER)
            WHEN actor_team = 'EW' THEN CAST(${handOutcome.handEwScoreDelta} AS INTEGER)
            ELSE NULL
          END,
        actor_team_won_hand =
          CASE
            WHEN actor_team IS NULL THEN NULL
            WHEN CAST(${handOutcome.finalHandWinnerTeam} AS TEXT) IS NULL THEN NULL
            ELSE actor_team = CAST(${handOutcome.finalHandWinnerTeam} AS TEXT)
          END,
        final_hand_winner_team = ${handOutcome.finalHandWinnerTeam},
        hand_result = ${sql.json(handOutcome.handResult as never)}
      WHERE game_id = ${payload.game_id}
        AND hand_id = ${payload.hand_id}
    `;
    await recomputeRewardForWhere(
      sql,
      "game_id = $1 AND hand_id = $2",
      [payload.game_id, payload.hand_id]
    );
  }

  const gameOutcome = parseGameOutcomeMetadata(payload);
  if (gameOutcome) {
    await sql`
      UPDATE decisions
      SET
        game_index = COALESCE(${gameOutcome.gameIndex}, game_index),
        game_ns_final_score = CAST(${gameOutcome.gameNsFinalScore} AS INTEGER),
        game_ew_final_score = CAST(${gameOutcome.gameEwFinalScore} AS INTEGER),
        actor_team_won_game =
          CASE
            WHEN actor_team IS NULL THEN NULL
            WHEN CAST(${gameOutcome.finalGameWinnerTeam} AS TEXT) IS NULL THEN NULL
            ELSE actor_team = CAST(${gameOutcome.finalGameWinnerTeam} AS TEXT)
          END,
        final_game_winner_team = ${gameOutcome.finalGameWinnerTeam},
        game_result = ${sql.json(gameOutcome.gameResult as never)}
      WHERE game_id = ${payload.game_id}
    `;
    await recomputeRewardForWhere(sql, "game_id = $1", [payload.game_id]);
  }
}

export async function finalizeTelemetryResults(
  sql: DatabaseClient
): Promise<TelemetryFinalizeSummary> {
  await sql`
    UPDATE decisions
    SET actor_team = CASE
      WHEN actor_team IS NOT NULL THEN actor_team
      WHEN actor_seat IN ('seat-0', 'seat-2', 'north', 'south') THEN 'NS'
      WHEN actor_seat IN ('seat-1', 'seat-3', 'east', 'west') THEN 'EW'
      ELSE NULL
    END
  `;
  await sql`
    UPDATE decisions
    SET game_index = COALESCE(game_index, 1),
        hand_index = COALESCE(
          hand_index,
          NULLIF(metadata->>'hand_index', '')::INTEGER,
          NULLIF(metadata->>'hand_number', '')::INTEGER,
          1
        ),
        trick_index = COALESCE(
          trick_index,
          NULLIF(metadata->>'trick_index', '')::INTEGER
        ),
        trick_id = COALESCE(
          trick_id,
          metadata->>'trick_id',
          CASE
            WHEN COALESCE(NULLIF(metadata->>'trick_index', '')::INTEGER, trick_index) IS NOT NULL
              THEN hand_id || ':trick:' || COALESCE(NULLIF(metadata->>'trick_index', '')::INTEGER, trick_index)::TEXT
            ELSE NULL
          END
        )
  `;

  const events = await sql<Array<{ payload: TelemetryEventPayload }>>`
    SELECT jsonb_build_object(
      'ts', ts,
      'game_id', game_id,
      'hand_id', hand_id,
      'phase', phase,
      'event_type', event_type,
      'actor_seat', actor_seat,
      'event_index', event_index,
      'schema_version', schema_version,
      'engine_version', engine_version,
      'sim_version', sim_version,
      'requested_provider', requested_provider,
      'provider_used', provider_used,
      'fallback_used', fallback_used,
      'state_norm', state_norm,
      'payload', payload,
      'metadata', metadata
    ) AS payload
    FROM events
    ORDER BY ts ASC, id ASC
  `;

  for (const row of events) {
    await applyOutcomeAttributionForDecisionEvent(sql, row.payload);
  }

  const [summary] = await sql<Array<{
    decisions: number;
    trick_attributed: number;
    hand_attributed: number;
    game_attributed: number;
    reward_attributed: number;
    exact_attribution: number;
    range_attribution: number;
    unknown_attribution: number;
    reward_min: number | null;
    reward_avg: number | null;
    reward_max: number | null;
  }>>`
    SELECT
      COUNT(*)::INTEGER AS decisions,
      COUNT(*) FILTER (WHERE trick_id IS NOT NULL AND trick_winner_team IS NOT NULL)::INTEGER AS trick_attributed,
      COUNT(*) FILTER (WHERE hand_result IS NOT NULL)::INTEGER AS hand_attributed,
      COUNT(*) FILTER (WHERE game_result IS NOT NULL)::INTEGER AS game_attributed,
      COUNT(*) FILTER (WHERE outcome_reward IS NOT NULL)::INTEGER AS reward_attributed,
      COUNT(*) FILTER (WHERE outcome_components->>'attribution_quality' = 'exact')::INTEGER AS exact_attribution,
      COUNT(*) FILTER (WHERE outcome_components->>'attribution_quality' = 'range')::INTEGER AS range_attribution,
      COUNT(*) FILTER (WHERE outcome_components->>'attribution_quality' = 'unknown')::INTEGER AS unknown_attribution,
      MIN(outcome_reward)::DOUBLE PRECISION AS reward_min,
      AVG(outcome_reward)::DOUBLE PRECISION AS reward_avg,
      MAX(outcome_reward)::DOUBLE PRECISION AS reward_max
    FROM decisions
  `;

  return {
    decisions: summary?.decisions ?? 0,
    trickAttributed: summary?.trick_attributed ?? 0,
    handAttributed: summary?.hand_attributed ?? 0,
    gameAttributed: summary?.game_attributed ?? 0,
    rewardAttributed: summary?.reward_attributed ?? 0,
    exactAttribution: summary?.exact_attribution ?? 0,
    rangeAttribution: summary?.range_attribution ?? 0,
    unknownAttribution: summary?.unknown_attribution ?? 0,
    rewardMin: summary?.reward_min ?? null,
    rewardAvg: summary?.reward_avg ?? null,
    rewardMax: summary?.reward_max ?? null
  };
}

export async function validateTelemetryTrainingData(
  sql: DatabaseClient
): Promise<TrainingDataValidationSummary> {
  const [coverage] = await sql<Array<{
    decisions: number;
    state_features_coverage: number;
    candidate_scores_coverage: number;
    chosen_action_type_coverage: number;
    hand_result_coverage: number;
    game_result_coverage: number;
    outcome_reward_coverage: number;
    pass_turn_rate: number | null;
    pass_turn_with_legal_play_rate: number | null;
    call_tichu_rate: number | null;
    decline_grand_tichu_rate: number | null;
    grand_tichu_call_rate: number | null;
  }>>`
    WITH decision_base AS (
      SELECT
        *,
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) candidate
          WHERE candidate ? 'pass_reduction_v1'
             OR candidate ? 'tichu_aggression_v1'
             OR candidate ? 'grand_tichu_aggression_v1'
        ) AS has_aggression_components
      FROM decisions
    )
    SELECT
      COUNT(*)::INTEGER AS decisions,
      COUNT(*) FILTER (WHERE has_state_features)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS state_features_coverage,
      COUNT(*) FILTER (WHERE has_candidate_scores)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS candidate_scores_coverage,
      COUNT(*) FILTER (WHERE chosen_action_type IS NOT NULL)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS chosen_action_type_coverage,
      COUNT(*) FILTER (WHERE hand_result IS NOT NULL)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS hand_result_coverage,
      COUNT(*) FILTER (WHERE game_result IS NOT NULL)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS game_result_coverage,
      COUNT(*) FILTER (WHERE outcome_reward IS NOT NULL)::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS outcome_reward_coverage,
      COUNT(*) FILTER (WHERE chosen_action_type = 'pass_turn')::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS pass_turn_rate,
      COUNT(*) FILTER (
        WHERE chosen_action_type = 'pass_turn'
          AND legal_action_count > 1
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) candidate
            WHERE candidate->'action'->>'type' = 'play_cards'
          )
      )::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS pass_turn_with_legal_play_rate,
      COUNT(*) FILTER (WHERE chosen_action_type = 'call_tichu')::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS call_tichu_rate,
      COUNT(*) FILTER (WHERE chosen_action_type = 'decline_grand_tichu')::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS decline_grand_tichu_rate,
      COUNT(*) FILTER (WHERE chosen_action_type = 'call_grand_tichu')::DOUBLE PRECISION / NULLIF(COUNT(*), 0) AS grand_tichu_call_rate
    FROM decision_base
  `;

  const [rewardStats] = await sql<Array<{
    min: number | null;
    avg: number | null;
    max: number | null;
  }>>`
    SELECT
      MIN(outcome_reward)::DOUBLE PRECISION AS min,
      AVG(outcome_reward)::DOUBLE PRECISION AS avg,
      MAX(outcome_reward)::DOUBLE PRECISION AS max
    FROM decisions
    WHERE outcome_reward IS NOT NULL
  `;
  const actionRows = await sql<Array<{ key: string | null; count: number }>>`
    SELECT chosen_action_type AS key, COUNT(*)::INTEGER AS count
    FROM decisions
    GROUP BY chosen_action_type
    ORDER BY count DESC, key ASC
  `;
  const rewardByActionRows = await sql<
    Array<{ key: string | null; avg_reward: number | null }>
  >`
    SELECT
      chosen_action_type AS key,
      AVG(outcome_reward)::DOUBLE PRECISION AS avg_reward
    FROM decisions
    GROUP BY chosen_action_type
    ORDER BY key ASC
  `;
  const phaseRows = await sql<Array<{ key: string | null; count: number }>>`
    SELECT phase AS key, COUNT(*)::INTEGER AS count
    FROM decisions
    GROUP BY phase
    ORDER BY count DESC, key ASC
  `;
  const providerRows = await sql<Array<{ key: string | null; count: number }>>`
    SELECT provider_used AS key, COUNT(*)::INTEGER AS count
    FROM decisions
    GROUP BY provider_used
    ORDER BY count DESC, key ASC
  `;
  const [aggressionCounts] = await sql<Array<{
    pass_reduction_count: number;
    tichu_aggression_count: number;
    grand_tichu_aggression_count: number;
    aggression_context_count: number;
  }>>`
    SELECT
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) candidate
          WHERE candidate ? 'pass_reduction_v1'
        )
      )::INTEGER AS pass_reduction_count,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) candidate
          WHERE candidate ? 'tichu_aggression_v1'
        )
      )::INTEGER AS tichu_aggression_count,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) candidate
          WHERE candidate ? 'grand_tichu_aggression_v1'
        )
      )::INTEGER AS grand_tichu_aggression_count,
      COUNT(*) FILTER (WHERE metadata ? 'aggression_context_v1')::INTEGER AS aggression_context_count
    FROM decisions
  `;
  const candidateScoreStatsRows = await sql<
    Array<{
      key: string | null;
      candidates: number;
      min_score: number | null;
      avg_score: number | null;
      max_score: number | null;
    }>
  >`
    SELECT
      candidate->'action'->>'type' AS key,
      COUNT(*)::INTEGER AS candidates,
      MIN((candidate->>'score')::DOUBLE PRECISION)::DOUBLE PRECISION AS min_score,
      AVG((candidate->>'score')::DOUBLE PRECISION)::DOUBLE PRECISION AS avg_score,
      MAX((candidate->>'score')::DOUBLE PRECISION)::DOUBLE PRECISION AS max_score
    FROM decisions
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(candidate_scores, '[]'::jsonb)) AS candidates(candidate)
    WHERE COALESCE(candidate->>'score', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    GROUP BY candidate->'action'->>'type'
    ORDER BY key ASC
  `;

  const warnings: string[] = [];
  if ((coverage?.pass_turn_rate ?? 0) > 0.55) {
    warnings.push("pass_turn rate exceeds 55% of decisions.");
  }
  if ((coverage?.call_tichu_rate ?? 0) === 0) {
    warnings.push("No Tichu calls were recorded.");
  }
  if ((coverage?.grand_tichu_call_rate ?? 0) > 0.08) {
    warnings.push("Grand Tichu call rate looks unusually high.");
  }
  if ((aggressionCounts?.aggression_context_count ?? 0) === 0) {
    warnings.push("Aggression context metadata is missing.");
  }
  if ((aggressionCounts?.pass_reduction_count ?? 0) === 0) {
    warnings.push("Pass reduction components are missing.");
  }
  if ((aggressionCounts?.tichu_aggression_count ?? 0) === 0) {
    warnings.push("Tichu aggression components are missing.");
  }
  if ((aggressionCounts?.grand_tichu_aggression_count ?? 0) === 0) {
    warnings.push("Grand Tichu aggression components are missing.");
  }

  return {
    coverage: {
      decisions: coverage?.decisions ?? 0,
      state_features_coverage: coverage?.state_features_coverage ?? 0,
      candidate_scores_coverage: coverage?.candidate_scores_coverage ?? 0,
      chosen_action_type_coverage: coverage?.chosen_action_type_coverage ?? 0,
      hand_result_coverage: coverage?.hand_result_coverage ?? 0,
      game_result_coverage: coverage?.game_result_coverage ?? 0,
      outcome_reward_coverage: coverage?.outcome_reward_coverage ?? 0,
      pass_turn_rate: coverage?.pass_turn_rate ?? 0,
      pass_turn_with_legal_play_rate:
        coverage?.pass_turn_with_legal_play_rate ?? 0,
      call_tichu_rate: coverage?.call_tichu_rate ?? 0,
      decline_grand_tichu_rate: coverage?.decline_grand_tichu_rate ?? 0,
      grand_tichu_call_rate: coverage?.grand_tichu_call_rate ?? 0,
      pass_reduction_count: aggressionCounts?.pass_reduction_count ?? 0,
      tichu_aggression_count: aggressionCounts?.tichu_aggression_count ?? 0,
      grand_tichu_aggression_count:
        aggressionCounts?.grand_tichu_aggression_count ?? 0,
      aggression_context_count: aggressionCounts?.aggression_context_count ?? 0
    },
    rewardStats: {
      min: rewardStats?.min ?? null,
      avg: rewardStats?.avg ?? null,
      max: rewardStats?.max ?? null
    },
    actionDistribution: Object.fromEntries(
      actionRows.map((row) => [row.key ?? "unknown", row.count])
    ),
    phaseDistribution: Object.fromEntries(
      phaseRows.map((row) => [row.key ?? "unknown", row.count])
    ),
    providerDistribution: Object.fromEntries(
      providerRows.map((row) => [row.key ?? "unknown", row.count])
    ),
    averageOutcomeRewardByAction: Object.fromEntries(
      rewardByActionRows.map((row) => [row.key ?? "unknown", row.avg_reward])
    ),
    candidateScoreStatsByAction: Object.fromEntries(
      candidateScoreStatsRows.map((row) => [
        row.key ?? "unknown",
        {
          candidates: row.candidates,
          min: row.min_score,
          avg: row.avg_score,
          max: row.max_score
        }
      ])
    ),
    aggressionComponentCounts: {
      pass_reduction_v1: aggressionCounts?.pass_reduction_count ?? 0,
      tichu_aggression_v1: aggressionCounts?.tichu_aggression_count ?? 0,
      grand_tichu_aggression_v1:
        aggressionCounts?.grand_tichu_aggression_count ?? 0,
      aggression_context_v1: aggressionCounts?.aggression_context_count ?? 0
    },
    warnings
  };
}
