import {
  deriveTelemetryDecisionFields,
  deriveTelemetryEventFields,
  type AdminClearResult,
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

export class PostgresTelemetryRepository implements TelemetryRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async ping(): Promise<void> {
    await this.sql`SELECT 1 AS ok`;
  }

  async insertDecision(payload: TelemetryDecisionPayload): Promise<number> {
    const derived = deriveTelemetryDecisionFields(payload);
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO decisions (
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
        has_explanation,
        has_candidate_scores,
        has_state_features,
        has_wish,
        wish_rank,
        can_pass,
        state_hash,
        legal_actions_hash,
        chosen_action_hash
      )
      VALUES (
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
        ${derived.has_explanation},
        ${derived.has_candidate_scores},
        ${derived.has_state_features},
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
    const derived = deriveTelemetryEventFields(payload);
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO events (
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
        fallback_used,
        state_norm,
        payload,
        metadata,
        state_hash,
        event_hash
      )
      VALUES (
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
        has_explanation,
        has_candidate_scores,
        has_state_features,
        has_wish,
        wish_rank,
        can_pass,
        state_hash,
        legal_actions_hash,
        chosen_action_hash,
        created_at
      FROM decisions
      WHERE game_id = ${gameId}
      ORDER BY ts ASC, id ASC
    `;
  }

  async listEvents(gameId: string): Promise<EventRow[]> {
    return this.sql<EventRow[]>`
      SELECT
        id,
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
        fallback_used,
        state_norm,
        payload,
        metadata,
        state_hash,
        event_hash,
        created_at
      FROM events
      WHERE game_id = ${gameId}
      ORDER BY ts ASC, id ASC
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
    const [decisionStats] = await this.sql<Array<{
      decisions: number;
      decisions_with_explanation: number;
      decisions_with_candidate_scores: number;
      decisions_with_state_features: number;
    }>>`
      SELECT
        COUNT(*)::INTEGER AS decisions,
        COUNT(*) FILTER (WHERE has_explanation)::INTEGER AS decisions_with_explanation,
        COUNT(*) FILTER (WHERE has_candidate_scores)::INTEGER AS decisions_with_candidate_scores,
        COUNT(*) FILTER (WHERE has_state_features)::INTEGER AS decisions_with_state_features
      FROM decisions
    `;
    const [eventStats] = await this.sql<Array<{ events: number }>>`
      SELECT COUNT(*)::INTEGER AS events
      FROM events
    `;
    const [duplicateStats] = await this.sql<Array<{ duplicate_state_hashes: number }>>`
      SELECT COUNT(*)::INTEGER AS duplicate_state_hashes
      FROM (
        SELECT state_hash
        FROM decisions
        WHERE state_hash IS NOT NULL
        GROUP BY state_hash
        HAVING COUNT(*) > 1
      ) duplicate_states
    `;

    return {
      decisions: decisionStats?.decisions ?? 0,
      events: eventStats?.events ?? 0,
      decisions_with_explanation:
        decisionStats?.decisions_with_explanation ?? 0,
      decisions_with_candidate_scores:
        decisionStats?.decisions_with_candidate_scores ?? 0,
      decisions_with_state_features:
        decisionStats?.decisions_with_state_features ?? 0,
      duplicate_state_hashes: duplicateStats?.duplicate_state_hashes ?? 0
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
    const rowCounts = await this.countTables(["decisions", "events", "matches"]);
    await this.sql`TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE`;
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
}
