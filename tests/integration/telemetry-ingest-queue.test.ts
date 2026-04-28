import { describe, expect, it } from "vitest";
import type {
  AdminClearResult,
  ReplayPayload,
  StoredTelemetryDecisionRecord,
  StoredTelemetryEventRecord,
  TelemetryDecisionPayload,
  TelemetryEventPayload,
  TelemetryHealthStats
} from "@tichuml/shared";
import { deriveTelemetryDecisionFields } from "@tichuml/shared";
import { TelemetryIngestQueue } from "../../apps/server/src/services/telemetry-ingest-queue";
import type { TelemetryRepository } from "../../apps/server/src/services/telemetry-repository";

class QueueTestRepository implements TelemetryRepository {
  decisions: StoredTelemetryDecisionRecord[] = [];
  failWrites = false;
  thrownValue: unknown = new Error("postgres unavailable");
  private decisionId = 1;

  async ping(): Promise<void> {}

  async insertDecision(payload: TelemetryDecisionPayload): Promise<number> {
    if (this.failWrites) {
      throw this.thrownValue;
    }
    const id = this.decisionId++;
    this.decisions.push({
      ...payload,
      ...deriveTelemetryDecisionFields(payload),
      id,
      match_id: `match-${payload.game_id}`,
      worker_id: null,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async insertEvent(_payload: TelemetryEventPayload): Promise<number> {
    if (this.failWrites) {
      throw this.thrownValue;
    }
    return 1;
  }

  async listDecisions(_gameId: string): Promise<StoredTelemetryDecisionRecord[]> {
    return this.decisions;
  }

  async listEvents(_gameId: string): Promise<StoredTelemetryEventRecord[]> {
    return [];
  }

  async getReplay(gameId: string): Promise<ReplayPayload> {
    return { game_id: gameId, decisions: [], events: [], timeline: [] };
  }

  async getHealthStats(): Promise<TelemetryHealthStats> {
    return {
      decisions: this.decisions.length,
      events: 0,
      matches: new Set(this.decisions.map((decision) => decision.match_id)).size,
      unique_state_hashes: 0,
      duplicate_state_hashes: 0,
      unique_legal_actions_hashes: 0,
      duplicate_legal_actions_hashes: 0,
      decisions_with_explanation: 0,
      decisions_with_candidate_scores: 0,
      decisions_with_state_features: 0,
      decisions_with_legal_chosen_action: 0,
      decisions_with_wish: 0,
      decisions_can_pass: 0,
      latest_decision_ts: null,
      latest_event_ts: null,
      latest_match_ts: this.decisions.at(-1)?.ts ?? null,
      decisions_by_provider: {},
      decisions_by_phase: {},
      decisions_by_seat: {},
      events_by_type: {},
      events_by_phase: {}
    };
  }

  async clearTelemetry(): Promise<AdminClearResult> {
    return this.clearDatabase();
  }

  async clearDatabase(): Promise<AdminClearResult> {
    this.decisions = [];
    return {
      accepted: true,
      action: "database.clear",
      tables_cleared: [],
      row_counts: {},
      warnings: []
    };
  }

  async resetDatabase(): Promise<AdminClearResult> {
    return this.clearDatabase();
  }
}

function decisionPayload(index: number): TelemetryDecisionPayload {
  return {
    ts: "2026-04-17T12:00:00.000Z",
    game_id: `game-${index}`,
    hand_id: `hand-${index}`,
    phase: "trick_play",
    actor_seat: "seat-0",
    decision_index: index,
    schema_version: 2,
    engine_version: "test",
    sim_version: "test",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    policy_name: "test",
    policy_source: "local_heuristic",
    state_raw: {},
    state_norm: null,
    legal_actions: [{ type: "pass_turn", seat: "seat-0" }],
    chosen_action: { type: "pass_turn", seat: "seat-0" },
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
    metadata: { source: "selfplay" },
    antipattern_tags: []
  };
}

describe("telemetry ingest queue", () => {
  it("persists accepted telemetry without blocking endpoint callers on ids", async () => {
    const repository = new QueueTestRepository();
    const queue = new TelemetryIngestQueue(repository, {
      maxDepth: 10,
      batchSize: 2,
      concurrency: 1
    });

    const result = queue.enqueueDecision(decisionPayload(1));
    await queue.drain();

    expect(result).toMatchObject({ accepted: true, queued: true, dropped: false });
    expect(repository.decisions).toHaveLength(1);
    expect(queue.stats()).toMatchObject({ accepted: 1, persisted: 1 });
  });

  it("drops under queue pressure and records persistence failures as diagnostics", async () => {
    const repository = new QueueTestRepository();
    repository.failWrites = true;
    const queue = new TelemetryIngestQueue(repository, {
      maxDepth: 0,
      batchSize: 1,
      concurrency: 1
    });

    const pressureResult = queue.enqueueDecision(decisionPayload(1));
    expect(pressureResult).toMatchObject({
      accepted: true,
      dropped: true,
      drop_reason: "queue_pressure"
    });

    const failingQueue = new TelemetryIngestQueue(repository, {
      maxDepth: 10,
      batchSize: 1,
      concurrency: 1
    });
    failingQueue.enqueueDecision(decisionPayload(2));
    await failingQueue.drain();

    expect(failingQueue.stats().persistence_failures).toBe(1);
    expect(failingQueue.stats().last_failure_message).toContain(
      "postgres unavailable"
    );
    expect(failingQueue.stats().persisted).toBe(0);
  });

  it("preserves empty-message AggregateError details in failure health", async () => {
    const repository = new QueueTestRepository();
    repository.failWrites = true;
    repository.thrownValue = new AggregateError(
      [
        Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
          code: "ECONNREFUSED"
        })
      ],
      ""
    );
    const queue = new TelemetryIngestQueue(repository, {
      maxDepth: 10,
      batchSize: 1,
      concurrency: 1
    });

    queue.enqueueDecision(decisionPayload(3));
    await queue.drain();

    expect(queue.stats().last_failure_message).toContain("ECONNREFUSED");
    expect(queue.stats().last_failure_message).not.toBe("");
    expect(queue.stats().last_failure_detail?.causes[0]?.message).toContain(
      "connect ECONNREFUSED"
    );
  });

  it("serializes thrown strings and objects without blank messages", async () => {
    for (const thrownValue of [
      "plain string failure",
      { code: "23502", detail: "null value violates not-null constraint" }
    ]) {
      const repository = new QueueTestRepository();
      repository.failWrites = true;
      repository.thrownValue = thrownValue;
      const queue = new TelemetryIngestQueue(repository, {
        maxDepth: 10,
        batchSize: 1,
        concurrency: 1
      });

      queue.enqueueDecision(decisionPayload(4));
      await queue.drain();

      expect(queue.stats().last_failure_message).toBeTruthy();
      expect(queue.stats().last_failure_message).not.toBe("");
    }
  });
});
