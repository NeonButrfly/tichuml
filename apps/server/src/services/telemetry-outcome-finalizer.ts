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
  neutralAttribution: number;
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

export type OutcomeAttributionUpdateStats = {
  decisionUpdateCount: number;
  outcomeAttributionUpdateCount: number;
  unchangedUpdateCount: number;
  skippedEventCount: number;
};

const RETRYABLE_POSTGRES_CODES = new Set(["40P01", "40001"]);
const MAX_FINALIZER_RETRIES = 3;
const TRICK_OUTCOME_EVENT_TYPES = new Set([
  "trick_resolved",
  "dragon_trick_assigned",
  "phase_changed"
]);
const HAND_OUTCOME_EVENT_TYPES = new Set([
  "hand_completed",
  "match_completed"
]);
const GAME_OUTCOME_EVENT_TYPES = new Set([
  "game_completed",
  "match_completed"
]);

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
  return value === "exact" || value === "range" || value === "neutral"
    ? value
    : "unknown";
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
): Promise<number> {
  const rows = await sql.unsafe<Array<{ id: number }>>(
    `
      UPDATE decisions
      SET
        outcome_reward = computed.reward,
        outcome_components = computed.components,
        outcome_version = CASE
          WHEN computed.version IS NULL THEN outcome_version
          ELSE computed.version
        END
      FROM (
        SELECT
          id,
          reward_payload.reward,
          reward_payload.components,
          reward_payload.version
        FROM (
          SELECT
            id,
            phase,
            chosen_action_type,
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
          ORDER BY id ASC
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
              WHEN
                decision_rows.actor_team IS NULL AND
                decision_rows.chosen_action_type = 'advance_phase' AND
                decision_rows.phase IN ('pass_reveal', 'exchange_complete', 'round_scoring')
              THEN 0
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
              WHEN
                decision_rows.actor_team IS NULL AND
                decision_rows.chosen_action_type = 'advance_phase' AND
                decision_rows.phase IN ('pass_reveal', 'exchange_complete', 'round_scoring')
              THEN jsonb_build_object(
                'version', 'outcome_reward_system_transition_v1',
                'actor_scope', 'system',
                'phase', decision_rows.phase,
                'chosen_action_type', decision_rows.chosen_action_type,
                'attribution_quality', 'neutral',
                'reason', 'system_owned_control_transition'
              )
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
            END AS components,
            CASE
              WHEN
                decision_rows.actor_team IS NULL AND
                decision_rows.chosen_action_type = 'advance_phase' AND
                decision_rows.phase IN ('pass_reveal', 'exchange_complete', 'round_scoring')
              THEN 'outcome_reward_system_transition_v1'
              WHEN hand_components.hand_score_delta IS NULL THEN NULL
              ELSE 'outcome_reward_v1'
            END AS version
        ) reward_payload
      ) AS computed
      WHERE decisions.id = computed.id
        AND (
          decisions.outcome_reward IS DISTINCT FROM computed.reward
          OR decisions.outcome_components IS DISTINCT FROM computed.components
          OR decisions.outcome_version IS DISTINCT FROM CASE
            WHEN computed.version IS NULL THEN decisions.outcome_version
            ELSE computed.version
          END
        )
      RETURNING decisions.id
    `,
    params
  );
  return rows.length;
}

function isRetryablePostgresError(error: unknown): error is { code: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    RETRYABLE_POSTGRES_CODES.has((error as { code: string }).code)
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(config: { attempt: number; payload: TelemetryEventPayload }): number {
  const seed =
    `${config.payload.game_id}|${config.payload.hand_id}|${config.payload.event_index}|${config.attempt}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const jitterMs = (hash >>> 0) % 35;
  return config.attempt * 40 + jitterMs;
}

function eventHasOutcomeMetadata(payload: TelemetryEventPayload): boolean {
  const metadata = payload.metadata as Record<string, unknown>;
  return (
    readMetadataString(metadata, "trick_id") !== null ||
    readMetadataObject(metadata, "hand_result") !== null ||
    readMetadataObject(metadata, "game_result") !== null
  );
}

export async function applyOutcomeAttributionForDecisionEventOnce(
  sql: DatabaseClient,
  payload: TelemetryEventPayload
): Promise<OutcomeAttributionUpdateStats> {
  const stats: OutcomeAttributionUpdateStats = {
    decisionUpdateCount: 0,
    outcomeAttributionUpdateCount: 0,
    unchangedUpdateCount: 0,
    skippedEventCount: 0
  };

  if (
    !eventHasOutcomeMetadata(payload) &&
    !TRICK_OUTCOME_EVENT_TYPES.has(payload.event_type) &&
    !HAND_OUTCOME_EVENT_TYPES.has(payload.event_type) &&
    !GAME_OUTCOME_EVENT_TYPES.has(payload.event_type) &&
    payload.phase !== "finished"
  ) {
    stats.skippedEventCount = 1;
    return stats;
  }

  if (TRICK_OUTCOME_EVENT_TYPES.has(payload.event_type) || payload.phase === "finished") {
    const trickOutcome = parseTrickOutcomeMetadata(payload);
    if (trickOutcome) {
      const creditedTeam =
        trickOutcome.trickPointRecipientTeam ?? trickOutcome.trickWinnerTeam;
      const trickRows = await sql<Array<{ id: number }>>`
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
          AND (
            trick_index IS DISTINCT FROM COALESCE(${trickOutcome.trickIndex}, trick_index)
            OR trick_winner_seat IS DISTINCT FROM ${trickOutcome.trickWinnerSeat}
            OR trick_winner_team IS DISTINCT FROM ${trickOutcome.trickWinnerTeam}
            OR trick_points IS DISTINCT FROM CAST(${trickOutcome.trickPoints} AS INTEGER)
            OR actor_team_won_trick IS DISTINCT FROM CASE
              WHEN actor_team IS NULL THEN NULL
              WHEN CAST(${creditedTeam} AS TEXT) IS NULL THEN NULL
              ELSE actor_team = CAST(${creditedTeam} AS TEXT)
            END
          )
        RETURNING id
      `;
      if (trickRows.length > 0) {
        stats.decisionUpdateCount += trickRows.length;
        stats.outcomeAttributionUpdateCount += trickRows.length;
        stats.decisionUpdateCount += await recomputeRewardForWhere(
          sql,
          "game_id = $1 AND hand_id = $2 AND trick_id = $3",
          [payload.game_id, payload.hand_id, trickOutcome.trickId]
        );
      } else {
        stats.unchangedUpdateCount += 1;
      }
    }
  }

  if (HAND_OUTCOME_EVENT_TYPES.has(payload.event_type) || payload.phase === "finished") {
    const handOutcome = parseHandOutcomeMetadata(payload);
    if (handOutcome) {
      const handRows = await sql<Array<{ id: number }>>`
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
          AND (
            hand_index IS DISTINCT FROM COALESCE(${handOutcome.handIndex}, hand_index)
            OR hand_ns_score_delta IS DISTINCT FROM CAST(${handOutcome.handNsScoreDelta} AS INTEGER)
            OR hand_ew_score_delta IS DISTINCT FROM CAST(${handOutcome.handEwScoreDelta} AS INTEGER)
            OR actor_team_hand_score_delta IS DISTINCT FROM CASE
              WHEN actor_team = 'NS' THEN CAST(${handOutcome.handNsScoreDelta} AS INTEGER)
              WHEN actor_team = 'EW' THEN CAST(${handOutcome.handEwScoreDelta} AS INTEGER)
              ELSE NULL
            END
            OR actor_team_won_hand IS DISTINCT FROM CASE
              WHEN actor_team IS NULL THEN NULL
              WHEN CAST(${handOutcome.finalHandWinnerTeam} AS TEXT) IS NULL THEN NULL
              ELSE actor_team = CAST(${handOutcome.finalHandWinnerTeam} AS TEXT)
            END
            OR final_hand_winner_team IS DISTINCT FROM ${handOutcome.finalHandWinnerTeam}
            OR hand_result IS DISTINCT FROM ${sql.json(handOutcome.handResult as never)}
          )
        RETURNING id
      `;
      if (handRows.length > 0) {
        stats.decisionUpdateCount += handRows.length;
        stats.outcomeAttributionUpdateCount += handRows.length;
        stats.decisionUpdateCount += await recomputeRewardForWhere(
          sql,
          "game_id = $1 AND hand_id = $2",
          [payload.game_id, payload.hand_id]
        );
      } else {
        stats.unchangedUpdateCount += 1;
      }
    }
  }

  if (GAME_OUTCOME_EVENT_TYPES.has(payload.event_type) || payload.phase === "finished") {
    const gameOutcome = parseGameOutcomeMetadata(payload);
    if (gameOutcome) {
      const gameRows = await sql<Array<{ id: number }>>`
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
          AND (
            game_index IS DISTINCT FROM COALESCE(${gameOutcome.gameIndex}, game_index)
            OR game_ns_final_score IS DISTINCT FROM CAST(${gameOutcome.gameNsFinalScore} AS INTEGER)
            OR game_ew_final_score IS DISTINCT FROM CAST(${gameOutcome.gameEwFinalScore} AS INTEGER)
            OR actor_team_won_game IS DISTINCT FROM CASE
              WHEN actor_team IS NULL THEN NULL
              WHEN CAST(${gameOutcome.finalGameWinnerTeam} AS TEXT) IS NULL THEN NULL
              ELSE actor_team = CAST(${gameOutcome.finalGameWinnerTeam} AS TEXT)
            END
            OR final_game_winner_team IS DISTINCT FROM ${gameOutcome.finalGameWinnerTeam}
            OR game_result IS DISTINCT FROM ${sql.json(gameOutcome.gameResult as never)}
          )
        RETURNING id
      `;
      if (gameRows.length > 0) {
        stats.decisionUpdateCount += gameRows.length;
        stats.outcomeAttributionUpdateCount += gameRows.length;
        stats.decisionUpdateCount += await recomputeRewardForWhere(sql, "game_id = $1", [
          payload.game_id
        ]);
      } else {
        stats.unchangedUpdateCount += 1;
      }
    }
  }

  if (stats.decisionUpdateCount === 0 && stats.unchangedUpdateCount === 0) {
    stats.skippedEventCount = 1;
  }

  return stats;
}

export async function applyOutcomeAttributionForDecisionEvent(
  sql: DatabaseClient,
  payload: TelemetryEventPayload
): Promise<OutcomeAttributionUpdateStats> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_FINALIZER_RETRIES; attempt += 1) {
    try {
      const stats = await applyOutcomeAttributionForDecisionEventOnce(sql, payload);
      if (attempt > 1) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "telemetry_outcome_finalizer_retry_succeeded",
            retry_count: attempt - 1,
            postgres_code:
              isRetryablePostgresError(lastError) ? lastError.code : null,
            game_id: payload.game_id,
            hand_id: payload.hand_id,
            event_index: payload.event_index
          })
        );
      }
      return stats;
    } catch (error) {
      lastError = error;
      if (!isRetryablePostgresError(error) || attempt >= MAX_FINALIZER_RETRIES) {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "telemetry_outcome_finalizer_failed",
            postgres_code: isRetryablePostgresError(error) ? error.code : null,
            attempt,
            max_attempts: MAX_FINALIZER_RETRIES,
            game_id: payload.game_id,
            hand_id: payload.hand_id,
            event_index: payload.event_index,
            message: error instanceof Error ? error.message : String(error)
          })
        );
        throw error;
      }
      await sleep(retryDelayMs({ attempt, payload }));
    }
  }
  return {
    decisionUpdateCount: 0,
    outcomeAttributionUpdateCount: 0,
    unchangedUpdateCount: 0,
    skippedEventCount: 0
  };
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
    neutral_attribution: number;
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
      COUNT(*) FILTER (WHERE outcome_components->>'attribution_quality' = 'neutral')::INTEGER AS neutral_attribution,
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
    neutralAttribution: summary?.neutral_attribution ?? 0,
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
