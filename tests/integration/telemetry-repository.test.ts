import { describe, expect, it } from "vitest";
import type {
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";
import {
  PostgresTelemetryRepository
} from "../../apps/server/src/services/telemetry-repository";

type SqlCall = {
  text: string;
  values: unknown[];
};

function createMockSql() {
  const calls: SqlCall[] = [];
  let decisionId = 1;
  let eventId = 1;
  const decisionIds = new Map<string, number>();
  const eventIds = new Map<string, number>();
  const matchRow = {
    id: "match-1",
    game_id: "game-cache",
    last_hand_id: "game-cache-hand-1",
    provider: "local_heuristic",
    requested_provider: "local",
    telemetry_mode: "full",
    strict_telemetry: false,
    sim_version: "test-sim",
    engine_version: "test-engine",
    started_at: "2026-05-05T00:00:01.000Z",
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
    if (text.includes("INSERT INTO decisions")) {
      const key = `${String(values[2])}|${String(values[6])}`;
      const existing = decisionIds.get(key);
      if (existing !== undefined && text.includes("ON CONFLICT (game_id, decision_index)")) {
        return [{ id: existing }];
      }
      const id = decisionId++;
      decisionIds.set(key, id);
      return [{ id }];
    }
    if (text.includes("INSERT INTO events")) {
      const key = `${String(values[2])}|${String(values[7])}`;
      const existing = eventIds.get(key);
      if (existing !== undefined && text.includes("ON CONFLICT (game_id, event_index)")) {
        return [{ id: existing }];
      }
      const id = eventId++;
      eventIds.set(key, id);
      return [{ id }];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    json: <T>(value: T) => T;
    unsafe: (...args: unknown[]) => Promise<unknown[]>;
  };

  sql.json = <T>(value: T) => value;
  sql.unsafe = async () => [];
  return { sql, calls };
}

function buildDecisionPayload(index: number): TelemetryDecisionPayload {
  return {
    ts: `2026-05-05T00:00:${String(index).padStart(2, "0")}.000Z`,
    game_id: "game-cache",
    hand_id: "game-cache-hand-1",
    phase: "trick_play",
    actor_seat: "seat-0",
    decision_index: index,
    schema_version: 2,
    engine_version: "test-engine",
    sim_version: "test-sim",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    policy_name: "test-policy",
    policy_source: "local_heuristic",
    state_raw: {
      phase: "trick_play",
      activeSeat: "seat-0",
      matchHistory: []
    },
    state_norm: {
      phase: "trick_play"
    },
    legal_actions: [{ type: "pass_turn", seat: "seat-0" }],
    chosen_action: { type: "pass_turn", seat: "seat-0" },
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
    metadata: {
      source: "selfplay",
      telemetry_mode: "full",
      strict_telemetry: false
    },
    antipattern_tags: []
  };
}

function buildEventPayload(): TelemetryEventPayload {
  return {
    ts: "2026-05-05T00:01:00.000Z",
    game_id: "game-cache",
    hand_id: "game-cache-hand-1",
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

describe("telemetry repository match lifecycle persistence", () => {
  it("reuses the same match row for repeated decisions in one game", async () => {
    const { sql, calls } = createMockSql();
    const repository = new PostgresTelemetryRepository(sql as never);

    await repository.insertDecision(buildDecisionPayload(1));
    await repository.insertDecision(buildDecisionPayload(2));

    expect(
      calls.filter((call) => call.text.includes("INSERT INTO matches"))
    ).toHaveLength(1);
  });

  it("reuses the same match row across decision and event writes for one game", async () => {
    const { sql, calls } = createMockSql();
    const repository = new PostgresTelemetryRepository(sql as never);

    await repository.insertDecision(buildDecisionPayload(1));
    await repository.insertEvent(buildEventPayload());

    expect(
      calls.filter((call) => call.text.includes("INSERT INTO matches"))
    ).toHaveLength(1);
  });

  it("treats duplicate decision indexes for one game as idempotent", async () => {
    const { sql, calls } = createMockSql();
    const repository = new PostgresTelemetryRepository(sql as never);

    const firstId = await repository.insertDecision(buildDecisionPayload(17));
    const secondId = await repository.insertDecision(buildDecisionPayload(17));

    expect(firstId).toBe(secondId);
    expect(
      calls.some((call) =>
        call.text.includes("ON CONFLICT (game_id, decision_index)")
      )
    ).toBe(true);
  });

  it("treats duplicate event indexes for one game as idempotent", async () => {
    const { sql, calls } = createMockSql();
    const repository = new PostgresTelemetryRepository(sql as never);

    const firstId = await repository.insertEvent(buildEventPayload());
    const secondId = await repository.insertEvent(buildEventPayload());

    expect(firstId).toBe(secondId);
    expect(
      calls.some((call) =>
        call.text.includes("ON CONFLICT (game_id, event_index)")
      )
    ).toBe(true);
  });
});
