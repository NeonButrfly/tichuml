import type {
  ReplayPayload,
  ReplayRecord,
  StoredTelemetryDecisionRecord,
  StoredTelemetryEventRecord,
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";
import type { DatabaseClient } from "../db/postgres.js";

export interface TelemetryRepository {
  ping(): Promise<void>;
  insertDecision(payload: TelemetryDecisionPayload): Promise<number>;
  insertEvent(payload: TelemetryEventPayload): Promise<number>;
  listDecisions(gameId: string): Promise<StoredTelemetryDecisionRecord[]>;
  listEvents(gameId: string): Promise<StoredTelemetryEventRecord[]>;
  getReplay(gameId: string): Promise<ReplayPayload>;
}

type DecisionRow = StoredTelemetryDecisionRecord;
type EventRow = StoredTelemetryEventRecord;

export class PostgresTelemetryRepository implements TelemetryRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async ping(): Promise<void> {
    await this.sql`SELECT 1 AS ok`;
  }

  async insertDecision(payload: TelemetryDecisionPayload): Promise<number> {
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
        policy_name,
        policy_source,
        state_raw,
        state_norm,
        legal_actions,
        chosen_action,
        metadata,
        antipattern_tags
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
        ${payload.policy_name},
        ${payload.policy_source},
        ${this.sql.json(payload.state_raw)},
        ${payload.state_norm === null ? null : this.sql.json(payload.state_norm)},
        ${this.sql.json(payload.legal_actions)},
        ${this.sql.json(payload.chosen_action)},
        ${this.sql.json(payload.metadata)},
        ${this.sql.json(payload.antipattern_tags)}
      )
      RETURNING id
    `;

    return row?.id ?? 0;
  }

  async insertEvent(payload: TelemetryEventPayload): Promise<number> {
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO events (
        ts,
        game_id,
        hand_id,
        phase,
        event_type,
        actor_seat,
        schema_version,
        engine_version,
        sim_version,
        payload,
        metadata
      )
      VALUES (
        ${payload.ts},
        ${payload.game_id},
        ${payload.hand_id},
        ${payload.phase},
        ${payload.event_type},
        ${payload.actor_seat},
        ${payload.schema_version},
        ${payload.engine_version},
        ${payload.sim_version},
        ${this.sql.json(payload.payload)},
        ${this.sql.json(payload.metadata)}
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
        policy_name,
        policy_source,
        state_raw,
        state_norm,
        legal_actions,
        chosen_action,
        metadata,
        antipattern_tags,
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
        schema_version,
        engine_version,
        sim_version,
        payload,
        metadata,
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
}
