import {
  deriveTelemetryDecisionFields,
  deriveTelemetryEventFields,
  inferTelemetryFallbackUsed,
  type AdminClearResult,
  type JsonObject,
  type ReplayPayload,
  type ReplayRecord,
  type StoredTelemetryDecisionRecord,
  type StoredTelemetryEventRecord,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload,
  type TelemetryHealthStats
} from "@tichuml/shared";
import type { DatabaseClient } from "../db/postgres.js";

export interface TelemetryRepository {
  ping(): Promise<void>;
  insertDecision(payload: TelemetryDecisionPayload): Promise<number>;
  insertEvent(payload: TelemetryEventPayload): Promise<number>;
  listDecisions(gameId: string): Promise<StoredTelemetryDecisionRecord[]>;
  listEvents(gameId: string): Promise<StoredTelemetryEventRecord[]>;
  getReplay(gameId: string): Promise<ReplayPayload>;
  getHealthStats(): Promise<TelemetryHealthStats>;
  clearTelemetry(): Promise<AdminClearResult>;
  clearDatabase(): Promise<AdminClearResult>;
  resetDatabase(): Promise<AdminClearResult>;
}

type DecisionRow = StoredTelemetryDecisionRecord;
type EventRow = StoredTelemetryEventRecord;
type TelemetryPayload = TelemetryDecisionPayload | TelemetryEventPayload;

type MatchLifecycleFields = {
  gameId: string;
  handId: string;
  provider: string | null;
  requestedProvider: string | null;
  telemetryMode: string | null;
  strictTelemetry: boolean | null;
  simVersion: string;
  engineVersion: string;
  observedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  finalTeam0Score: number | null;
  finalTeam1Score: number | null;
  winnerTeam: string | null;
  handsPlayed: number | null;
  failureReason: string | null;
};

function readMetadataString(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readMetadataNumber(metadata: JsonObject, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMetadataBoolean(
  metadata: JsonObject,
  key: string
): boolean | null {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

function isCompletionEvent(payload: TelemetryPayload): boolean {
  if (!("event_type" in payload)) {
    return payload.phase === "finished";
  }

  return (
    payload.event_type === "game_completed" ||
    payload.event_type === "match_completed" ||
    payload.event_type === "hand_completed" ||
    payload.phase === "finished"
  );
}

function readNestedScore(
  value: unknown,
  key: "team-0" | "team-1"
): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

function readPayloadScore(
  payload: TelemetryPayload,
  key: "team-0" | "team-1"
): number | null {
  if ("state_norm" in payload) {
    const stateNormScore = readNestedScore(payload.state_norm?.matchScore, key);
    if (stateNormScore !== null) {
      return stateNormScore;
    }
  }

  if ("payload" in payload) {
    const payloadObject =
      typeof payload.payload === "object" &&
      payload.payload !== null &&
      !Array.isArray(payload.payload)
        ? (payload.payload as Record<string, unknown>)
        : null;
    const direct = payloadObject?.[
      key === "team-0" ? "final_team_0_score" : "final_team_1_score"
    ];
    if (typeof direct === "number" && Number.isFinite(direct)) {
      return direct;
    }
  }

  return null;
}

function readHandsPlayed(payload: TelemetryPayload): number | null {
  if ("state_norm" in payload) {
    const stateNorm =
      payload.state_norm &&
      typeof payload.state_norm === "object" &&
      !Array.isArray(payload.state_norm)
        ? (payload.state_norm as Record<string, unknown>)
        : null;
    const roundSummary = stateNorm?.roundSummary;
    if (stateNorm?.matchComplete === true && typeof stateNorm?.matchWinner === "string") {
      const numericHands = readMetadataNumber(payload.metadata, "hands_played");
      if (numericHands !== null) {
        return numericHands;
      }
      const metadataHands = readMetadataString(payload.metadata, "hands_played");
      if (metadataHands) {
        const parsed = Number.parseInt(metadataHands, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    if (roundSummary) {
      const numericHandNumber = readMetadataNumber(payload.metadata, "hand_number");
      if (numericHandNumber !== null) {
        return numericHandNumber;
      }
      const handNumber = readMetadataString(payload.metadata, "hand_number");
      if (handNumber) {
        const parsed = Number.parseInt(handNumber, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }
  return null;
}

function matchLifecycleFields(payload: TelemetryPayload): MatchLifecycleFields {
  const requestedProvider =
    payload.requested_provider ??
    readMetadataString(payload.metadata, "requested_provider");
  const provider =
    payload.provider_used ??
    readMetadataString(payload.metadata, "provider_used");
  const completedAt = isCompletionEvent(payload) ? payload.ts : null;
  const winnerTeam =
    "state_norm" in payload && typeof payload.state_norm?.matchWinner === "string"
      ? payload.state_norm.matchWinner
      : readMetadataString(payload.metadata, "winner_team");
  return {
    gameId: payload.game_id,
    handId: payload.hand_id,
    provider,
    requestedProvider,
    telemetryMode: readMetadataString(payload.metadata, "telemetry_mode"),
    strictTelemetry: readMetadataBoolean(payload.metadata, "strict_telemetry"),
    simVersion: payload.sim_version,
    engineVersion: payload.engine_version,
    observedAt: payload.ts,
    completedAt,
    status: completedAt ? "completed" : "running",
    finalTeam0Score: readPayloadScore(payload, "team-0"),
    finalTeam1Score: readPayloadScore(payload, "team-1"),
    winnerTeam,
    handsPlayed: readHandsPlayed(payload),
    failureReason: readMetadataString(payload.metadata, "failure_reason"),
  };
}

export class PostgresTelemetryRepository implements TelemetryRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async ping(): Promise<void> {
    await this.sql`SELECT 1 AS ok`;
  }

  async insertDecision(payload: TelemetryDecisionPayload): Promise<number> {
    const fallbackUsed = inferTelemetryFallbackUsed({
      requestedProvider: payload.requested_provider,
      providerUsed: payload.provider_used,
      explicitFallbackUsed: payload.fallback_used,
      fallbackReason: payload.metadata.fallback_reason
    });
    payload = {
      ...payload,
      fallback_used: fallbackUsed,
      metadata: {
        ...payload.metadata,
        fallback_used: fallbackUsed
      }
    };
    const derived = deriveTelemetryDecisionFields(payload);
    const matchId = await this.ensureMatchForTelemetry(payload);
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO decisions (
        match_id,
        ts,
        game_id,
        hand_id,
        phase,
        actor_seat,
        decision_index,
        schema_version,
        engine_version,
        sim_version,
        requested_provider,
        provider_used,
        fallback_used,
        policy_name,
        policy_source,
        worker_id,
        state_raw,
        state_norm,
        legal_actions,
        chosen_action,
        explanation,
        candidate_scores,
        state_features,
        metadata,
        antipattern_tags,
        chosen_action_type,
        legal_action_count,
        chosen_action_is_legal,
        has_explanation,
        has_candidate_scores,
        has_state_features,
        explanation_quality_level,
        has_wish,
        wish_rank,
        can_pass,
        state_hash,
        legal_actions_hash,
        chosen_action_hash
      )
      VALUES (
        ${matchId},
        ${payload.ts},
        ${payload.game_id},
        ${payload.hand_id},
        ${payload.phase},
        ${payload.actor_seat},
        ${payload.decision_index},
        ${payload.schema_version},
        ${payload.engine_version},
        ${payload.sim_version},
        ${payload.requested_provider},
        ${payload.provider_used},
        ${payload.fallback_used},
        ${payload.policy_name},
        ${payload.policy_source},
        ${typeof payload.metadata.worker_id === "string" ? payload.metadata.worker_id : null},
        ${this.sql.json(payload.state_raw)},
        ${payload.state_norm === null ? null : this.sql.json(payload.state_norm)},
        ${this.sql.json(payload.legal_actions)},
        ${this.sql.json(payload.chosen_action)},
        ${payload.explanation === null ? null : this.sql.json(payload.explanation)},
        ${payload.candidateScores === null ? null : this.sql.json(payload.candidateScores)},
        ${payload.stateFeatures === null ? null : this.sql.json(payload.stateFeatures)},
        ${this.sql.json(payload.metadata)},
        ${this.sql.json(payload.antipattern_tags)},
        ${derived.chosen_action_type},
        ${derived.legal_action_count},
        ${derived.chosen_action_is_legal},
        ${derived.has_explanation},
        ${derived.has_candidate_scores},
        ${derived.has_state_features},
        ${derived.explanation_quality_level},
        ${derived.has_wish},
        ${derived.wish_rank},
        ${derived.can_pass},
        ${derived.state_hash},
        ${derived.legal_actions_hash},
        ${derived.chosen_action_hash}
      )
      RETURNING id
    `;

    return row?.id ?? 0;
  }

  async insertEvent(payload: TelemetryEventPayload): Promise<number> {
    const fallbackUsed = inferTelemetryFallbackUsed({
      requestedProvider: payload.requested_provider,
      providerUsed: payload.provider_used,
      explicitFallbackUsed: payload.fallback_used,
      fallbackReason: payload.metadata.fallback_reason
    });
    payload = {
      ...payload,
      fallback_used: fallbackUsed,
      metadata: {
        ...payload.metadata,
        fallback_used: fallbackUsed
      }
    };
    const derived = deriveTelemetryEventFields(payload);
    const matchId = await this.ensureMatchForTelemetry(payload);
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO events (
        match_id,
        ts,
        game_id,
        hand_id,
        phase,
        event_type,
        actor_seat,
        event_index,
        schema_version,
        engine_version,
        sim_version,
        requested_provider,
        provider_used,
        worker_id,
        fallback_used,
        state_norm,
        payload,
        metadata,
        state_hash,
        event_hash
      )
      VALUES (
        ${matchId},
        ${payload.ts},
        ${payload.game_id},
        ${payload.hand_id},
        ${payload.phase},
        ${payload.event_type},
        ${payload.actor_seat},
        ${payload.event_index},
        ${payload.schema_version},
        ${payload.engine_version},
        ${payload.sim_version},
        ${payload.requested_provider},
        ${payload.provider_used},
        ${typeof payload.metadata.worker_id === "string" ? payload.metadata.worker_id : null},
        ${payload.fallback_used},
        ${payload.state_norm === null ? null : this.sql.json(payload.state_norm)},
        ${this.sql.json(payload.payload)},
        ${this.sql.json(payload.metadata)},
        ${derived.state_hash},
        ${derived.event_hash}
      )
      RETURNING id
    `;

    return row?.id ?? 0;
  }

  async listDecisions(gameId: string): Promise<DecisionRow[]> {
    return this.sql<DecisionRow[]>`
      SELECT
        id,
        match_id,
        ts,
        game_id,
        hand_id,
        phase,
        actor_seat,
        decision_index,
        schema_version,
        engine_version,
        sim_version,
        requested_provider,
        provider_used,
        fallback_used,
        policy_name,
        policy_source,
        worker_id,
        state_raw,
        state_norm,
        legal_actions,
        chosen_action,
        explanation,
        candidate_scores AS "candidateScores",
        state_features AS "stateFeatures",
        metadata,
        antipattern_tags,
        chosen_action_type,
        legal_action_count,
        chosen_action_is_legal,
        has_explanation,
        has_candidate_scores,
        has_state_features,
        explanation_quality_level,
        has_wish,
        wish_rank,
        can_pass,
        state_hash,
        legal_actions_hash,
        chosen_action_hash,
        created_at
      FROM decisions
      WHERE game_id = ${gameId}
      ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC
    `;
  }

  async listEvents(gameId: string): Promise<EventRow[]> {
    return this.sql<EventRow[]>`
      SELECT
        id,
        match_id,
        ts,
        game_id,
        hand_id,
        phase,
        event_type,
        actor_seat,
        event_index,
        schema_version,
        engine_version,
        sim_version,
        requested_provider,
        provider_used,
        worker_id,
        fallback_used,
        state_norm,
        payload,
        metadata,
        state_hash,
        event_hash,
        created_at
      FROM events
      WHERE game_id = ${gameId}
      ORDER BY game_id ASC, hand_id ASC, event_index ASC, ts ASC, id ASC
    `;
  }

  async getReplay(gameId: string): Promise<ReplayPayload> {
    const [decisions, events] = await Promise.all([
      this.listDecisions(gameId),
      this.listEvents(gameId)
    ]);
    const timeline: ReplayRecord[] = [
      ...decisions.map((payload) => ({
        kind: "decision" as const,
        ts: payload.ts,
        id: payload.id,
        phase: payload.phase,
        actor_seat: payload.actor_seat,
        payload
      })),
      ...events.map((payload) => ({
        kind: "event" as const,
        ts: payload.ts,
        id: payload.id,
        phase: payload.phase,
        actor_seat: payload.actor_seat,
        payload
      }))
    ].sort((left, right) => {
      const gameDiff = left.payload.game_id.localeCompare(
        right.payload.game_id
      );
      if (gameDiff !== 0) {
        return gameDiff;
      }
      const handDiff = left.payload.hand_id.localeCompare(
        right.payload.hand_id
      );
      if (handDiff !== 0) {
        return handDiff;
      }
      const leftIndex =
        left.kind === "decision"
          ? left.payload.decision_index
          : left.payload.event_index;
      const rightIndex =
        right.kind === "decision"
          ? right.payload.decision_index
          : right.payload.event_index;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      const timestampDiff =
        new Date(left.ts).getTime() - new Date(right.ts).getTime();
      return timestampDiff !== 0 ? timestampDiff : left.id - right.id;
    });

    return {
      game_id: gameId,
      decisions,
      events,
      timeline
    };
  }

  async getHealthStats(): Promise<TelemetryHealthStats> {
    const [decisionStats] = await this.sql<
      Array<{
        decisions: number;
        unique_state_hashes: number;
        unique_legal_actions_hashes: number;
        decisions_with_explanation: number;
        decisions_with_candidate_scores: number;
        decisions_with_state_features: number;
        decisions_with_legal_chosen_action: number;
        decisions_with_wish: number;
        decisions_can_pass: number;
        latest_decision_ts: string | null;
      }>
    >`
      SELECT
        COUNT(*)::INTEGER AS decisions,
        COUNT(DISTINCT state_hash)::INTEGER AS unique_state_hashes,
        COUNT(DISTINCT legal_actions_hash)::INTEGER AS unique_legal_actions_hashes,
        COUNT(*) FILTER (WHERE has_explanation)::INTEGER AS decisions_with_explanation,
        COUNT(*) FILTER (WHERE has_candidate_scores)::INTEGER AS decisions_with_candidate_scores,
        COUNT(*) FILTER (WHERE has_state_features)::INTEGER AS decisions_with_state_features,
        COUNT(*) FILTER (WHERE chosen_action_is_legal)::INTEGER AS decisions_with_legal_chosen_action,
        COUNT(*) FILTER (WHERE has_wish)::INTEGER AS decisions_with_wish,
        COUNT(*) FILTER (WHERE can_pass)::INTEGER AS decisions_can_pass,
        MAX(ts)::TEXT AS latest_decision_ts
      FROM decisions
    `;
    const [eventStats] = await this.sql<
      Array<{
        events: number;
        latest_event_ts: string | null;
      }>
    >`
      SELECT
        COUNT(*)::INTEGER AS events,
        MAX(ts)::TEXT AS latest_event_ts
      FROM events
    `;
    const [matchStats] = await this.sql<
      Array<{
        matches: number;
        latest_match_ts: string | null;
      }>
    >`
      SELECT
        COUNT(*)::INTEGER AS matches,
        MAX(COALESCE(completed_at, updated_at, started_at, created_at))::TEXT AS latest_match_ts
      FROM matches
    `;
    const [duplicateStats] = await this.sql<
      Array<{ duplicate_state_hashes: number }>
    >`
      SELECT COUNT(*)::INTEGER AS duplicate_state_hashes
      FROM (
        SELECT state_hash
        FROM decisions
        WHERE state_hash IS NOT NULL
        GROUP BY state_hash
        HAVING COUNT(*) > 1
      ) duplicate_states
    `;
    const [duplicateLegalActionStats] = await this.sql<
      Array<{ duplicate_legal_actions_hashes: number }>
    >`
      SELECT COUNT(*)::INTEGER AS duplicate_legal_actions_hashes
      FROM (
        SELECT legal_actions_hash
        FROM decisions
        WHERE legal_actions_hash IS NOT NULL
        GROUP BY legal_actions_hash
        HAVING COUNT(*) > 1
      ) duplicate_legal_actions
    `;
    const decisionsByProvider = await this.countGrouped(
      "decisions",
      "provider_used"
    );
    const decisionsByPhase = await this.countGrouped("decisions", "phase");
    const decisionsBySeat = await this.countGrouped("decisions", "actor_seat");
    const eventsByType = await this.countGrouped("events", "event_type");
    const eventsByPhase = await this.countGrouped("events", "phase");

    return {
      decisions: decisionStats?.decisions ?? 0,
      events: eventStats?.events ?? 0,
      matches: matchStats?.matches ?? 0,
      unique_state_hashes: decisionStats?.unique_state_hashes ?? 0,
      duplicate_state_hashes: duplicateStats?.duplicate_state_hashes ?? 0,
      unique_legal_actions_hashes:
        decisionStats?.unique_legal_actions_hashes ?? 0,
      duplicate_legal_actions_hashes:
        duplicateLegalActionStats?.duplicate_legal_actions_hashes ?? 0,
      decisions_with_explanation:
        decisionStats?.decisions_with_explanation ?? 0,
      decisions_with_candidate_scores:
        decisionStats?.decisions_with_candidate_scores ?? 0,
      decisions_with_state_features:
        decisionStats?.decisions_with_state_features ?? 0,
      decisions_with_legal_chosen_action:
        decisionStats?.decisions_with_legal_chosen_action ?? 0,
      decisions_with_wish: decisionStats?.decisions_with_wish ?? 0,
      decisions_can_pass: decisionStats?.decisions_can_pass ?? 0,
      latest_decision_ts: decisionStats?.latest_decision_ts ?? null,
      latest_event_ts: eventStats?.latest_event_ts ?? null,
      latest_match_ts: matchStats?.latest_match_ts ?? null,
      decisions_by_provider: decisionsByProvider,
      decisions_by_phase: decisionsByPhase,
      decisions_by_seat: decisionsBySeat,
      events_by_type: eventsByType,
      events_by_phase: eventsByPhase
    };
  }

  async clearTelemetry(): Promise<AdminClearResult> {
    const rowCounts = await this.countTables(["decisions", "events"]);
    await this.sql`TRUNCATE TABLE decisions, events RESTART IDENTITY`;
    console.warn("[admin] cleared telemetry tables", rowCounts);
    return {
      accepted: true,
      action: "telemetry.clear",
      tables_cleared: ["decisions", "events"],
      row_counts: rowCounts,
      warnings: ["Development/admin destructive endpoint used."]
    };
  }

  async clearDatabase(): Promise<AdminClearResult> {
    const rowCounts = await this.countTables([
      "decisions",
      "events",
      "matches"
    ]);
    await this
      .sql`TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE`;
    console.warn("[admin] cleared app-owned database tables", rowCounts);
    return {
      accepted: true,
      action: "database.clear",
      tables_cleared: ["decisions", "events", "matches"],
      row_counts: rowCounts,
      warnings: [
        "Development/admin destructive endpoint used.",
        "Schema and schema_migrations were retained."
      ]
    };
  }

  async resetDatabase(): Promise<AdminClearResult> {
    const result = await this.clearDatabase();
    return {
      ...result,
      action: "database.reset",
      warnings: [
        ...result.warnings,
        "Runtime migrations are applied by server startup; reset retained current schema."
      ]
    };
  }

  private async countTables(tables: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const [row] = await this.sql.unsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::INTEGER AS count FROM ${table}`
      );
      counts[table] = row?.count ?? 0;
    }
    return counts;
  }

  private async ensureMatchForTelemetry(
    payload: TelemetryPayload
  ): Promise<string> {
    const fields = matchLifecycleFields(payload);
    const [row] = await this.sql<Array<{ id: string }>>`
      INSERT INTO matches (
        game_id,
        last_hand_id,
        provider,
        requested_provider,
        telemetry_mode,
        strict_telemetry,
        sim_version,
        engine_version,
        final_team_0_score,
        final_team_1_score,
        winner_team,
        hands_played,
        failure_reason,
        started_at,
        completed_at,
        status,
        updated_at
      )
      VALUES (
        ${fields.gameId},
        ${fields.handId},
        ${fields.provider},
        ${fields.requestedProvider},
        ${fields.telemetryMode},
        ${fields.strictTelemetry},
        ${fields.simVersion},
        ${fields.engineVersion},
        ${fields.finalTeam0Score},
        ${fields.finalTeam1Score},
        ${fields.winnerTeam},
        ${fields.handsPlayed},
        ${fields.failureReason},
        ${fields.observedAt},
        ${fields.completedAt},
        ${fields.status},
        NOW()
      )
      ON CONFLICT (game_id) WHERE game_id IS NOT NULL DO UPDATE SET
        last_hand_id = EXCLUDED.last_hand_id,
        provider = COALESCE(matches.provider, EXCLUDED.provider),
        requested_provider = COALESCE(matches.requested_provider, EXCLUDED.requested_provider),
        telemetry_mode = COALESCE(matches.telemetry_mode, EXCLUDED.telemetry_mode),
        strict_telemetry = COALESCE(matches.strict_telemetry, EXCLUDED.strict_telemetry),
        sim_version = COALESCE(matches.sim_version, EXCLUDED.sim_version),
        engine_version = COALESCE(matches.engine_version, EXCLUDED.engine_version),
        final_team_0_score = COALESCE(matches.final_team_0_score, EXCLUDED.final_team_0_score),
        final_team_1_score = COALESCE(matches.final_team_1_score, EXCLUDED.final_team_1_score),
        winner_team = COALESCE(matches.winner_team, EXCLUDED.winner_team),
        hands_played = COALESCE(matches.hands_played, EXCLUDED.hands_played),
        failure_reason = COALESCE(matches.failure_reason, EXCLUDED.failure_reason),
        started_at = LEAST(
          COALESCE(matches.started_at, EXCLUDED.started_at),
          EXCLUDED.started_at
        ),
        completed_at = COALESCE(matches.completed_at, EXCLUDED.completed_at),
        status = CASE
          WHEN EXCLUDED.completed_at IS NOT NULL THEN EXCLUDED.status
          WHEN matches.status = 'created' THEN 'running'
          ELSE matches.status
        END,
        updated_at = NOW()
      RETURNING id
    `;

    if (!row?.id) {
      throw new Error(
        `Unable to upsert match lifecycle row for game_id=${fields.gameId}`
      );
    }
    return row.id;
  }

  private async countGrouped(
    table: "decisions" | "events",
    column: string
  ): Promise<Record<string, number>> {
    const allowedColumns = new Set([
      "provider_used",
      "phase",
      "actor_seat",
      "event_type"
    ]);
    if (!allowedColumns.has(column)) {
      throw new Error(`Unsupported telemetry aggregate column: ${column}`);
    }

    const rows = await this.sql.unsafe<
      Array<{ key: string | null; count: number }>
    >(
      `SELECT ${column}::TEXT AS key, COUNT(*)::INTEGER AS count FROM ${table} GROUP BY ${column}`
    );

    return Object.fromEntries(
      rows.map((row) => [row.key ?? "null", row.count])
    );
  }
}
