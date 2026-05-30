import { describe, expect, it, vi } from "vitest";
import type { TelemetryEventPayload } from "@tichuml/shared";

const applyOutcomeAttributionForDecisionEvent = vi.fn(async () => ({
  decisionUpdateCount: 0,
  outcomeAttributionUpdateCount: 0,
  unchangedUpdateCount: 0,
  skippedEventCount: 0
}));

const applyOutcomeAttributionForDecisionEventOnce = vi.fn(async () => ({
  decisionUpdateCount: 0,
  outcomeAttributionUpdateCount: 0,
  unchangedUpdateCount: 0,
  skippedEventCount: 0
}));

vi.mock("../../apps/server/src/services/telemetry-outcome-finalizer", () => ({
  applyOutcomeAttributionForDecisionEvent,
  applyOutcomeAttributionForDecisionEventOnce,
  deriveDecisionOutcomeContext: vi.fn(() => ({
    actorTeam: "NS",
    trickId: null,
    trickIndex: null,
    handIndex: null,
    gameIndex: null
  }))
}));

type SqlCall = {
  text: string;
  values: unknown[];
};

function createMockSql() {
  const calls: SqlCall[] = [];
  const matchRow = {
    id: "match-1",
    game_id: "game-batch",
    last_hand_id: "game-batch-hand-1",
    provider: "local_heuristic",
    requested_provider: "local",
    telemetry_mode: "full",
    strict_telemetry: false,
    sim_version: "test-sim",
    engine_version: "test-engine",
    started_at: "2026-05-30T00:00:00.000Z",
    completed_at: null,
    status: "running",
    final_team_0_score: null,
    final_team_1_score: null,
    winner_team: null,
    hands_played: null,
    failure_reason: null
  };

  const sql = (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const text = strings.join("__VALUE__");
    calls.push({ text, values });
    if (text.includes("INSERT INTO matches")) {
      return [matchRow];
    }
    if (text.includes("UPDATE matches")) {
      return [matchRow];
    }
    if (text.includes("INSERT INTO events")) {
      return [{ id: 1 }];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    json: <T>(value: T) => T;
    unsafe: (...args: unknown[]) => Promise<unknown[]>;
    begin: <T>(
      callback: (transaction: typeof sql) => Promise<T>
    ) => Promise<T>;
  };

  sql.json = <T>(value: T) => value;
  sql.unsafe = async () => [];
  sql.begin = async <T>(callback: (transaction: typeof sql) => Promise<T>) =>
    callback(sql);
  return { sql, calls };
}

function buildEventPayload(): TelemetryEventPayload {
  return {
    ts: "2026-05-30T00:01:00.000Z",
    game_id: "game-batch",
    hand_id: "game-batch-hand-1",
    phase: "trick_play",
    event_type: "cards_played",
    actor_seat: "seat-1",
    event_index: 1,
    schema_version: 2,
    engine_version: "test-engine",
    sim_version: "test-sim",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    state_norm: null,
    payload: {
      event_type: "cards_played"
    },
    metadata: {
      source: "selfplay",
      telemetry_mode: "full",
      strict_telemetry: false
    }
  };
}

describe("telemetry repository batch outcome finalization", async () => {
  it("uses single-shot outcome attribution inside batch persistence", async () => {
    const { PostgresTelemetryRepository } = await import(
      "../../apps/server/src/services/telemetry-repository"
    );
    const { sql } = createMockSql();
    const repository = new PostgresTelemetryRepository(sql as never);

    applyOutcomeAttributionForDecisionEvent.mockClear();
    applyOutcomeAttributionForDecisionEventOnce.mockClear();

    await repository.persistBatch?.([
      {
        kind: "event",
        payload: buildEventPayload(),
        acceptedAt: "2026-05-30T00:01:00.000Z"
      }
    ]);

    expect(applyOutcomeAttributionForDecisionEventOnce).toHaveBeenCalledTimes(1);
    expect(applyOutcomeAttributionForDecisionEvent).not.toHaveBeenCalled();
  });
});
