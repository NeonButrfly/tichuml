import { afterEach, describe, expect, it } from "vitest";
import {
  applyEngineAction,
  createInitialGameState,
  getLegalActions,
  SYSTEM_ACTOR,
  type EngineAction
} from "@tichuml/engine";
import type {
  ReplayPayload,
  StoredTelemetryDecisionRecord,
  StoredTelemetryEventRecord,
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";
import { createAppServer } from "../../apps/server/src/app";
import type { ServerConfig } from "../../apps/server/src/config/env";
import type { TelemetryRepository } from "../../apps/server/src/services/telemetry-repository";

class InMemoryTelemetryRepository implements TelemetryRepository {
  decisions: StoredTelemetryDecisionRecord[] = [];
  events: StoredTelemetryEventRecord[] = [];
  private decisionId = 1;
  private eventId = 1;

  async ping(): Promise<void> {}

  async insertDecision(payload: TelemetryDecisionPayload): Promise<number> {
    const id = this.decisionId++;
    this.decisions.push({
      ...payload,
      id,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async insertEvent(payload: TelemetryEventPayload): Promise<number> {
    const id = this.eventId++;
    this.events.push({
      ...payload,
      id,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async listDecisions(gameId: string): Promise<StoredTelemetryDecisionRecord[]> {
    return this.decisions
      .filter((decision) => decision.game_id === gameId)
      .sort((left, right) =>
        left.ts === right.ts ? left.id - right.id : left.ts.localeCompare(right.ts)
      );
  }

  async listEvents(gameId: string): Promise<StoredTelemetryEventRecord[]> {
    return this.events
      .filter((event) => event.game_id === gameId)
      .sort((left, right) =>
        left.ts === right.ts ? left.id - right.id : left.ts.localeCompare(right.ts)
      );
  }

  async getReplay(gameId: string): Promise<ReplayPayload> {
    const decisions = await this.listDecisions(gameId);
    const events = await this.listEvents(gameId);
    return {
      game_id: gameId,
      decisions,
      events,
      timeline: [
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
      ].sort((left, right) =>
        left.ts === right.ts ? left.id - right.id : left.ts.localeCompare(right.ts)
      )
    };
  }
}

const TEST_SERVER_CONFIG: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  databaseUrl: "postgres://test",
  pgBootstrapUrl: "postgres://bootstrap",
  allowedOrigin: "*",
  autoBootstrapDatabase: false,
  autoMigrate: false,
  backendBaseUrl: "http://127.0.0.1"
};

async function withServer<T>(
  callback: (config: { baseUrl: string; repository: InMemoryTelemetryRepository }) => Promise<T>
) {
  const repository = new InMemoryTelemetryRepository();
  const server = createAppServer({
    serverConfig: TEST_SERVER_CONFIG,
    repository
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve the test server address.");
  }

  try {
    return await callback({
      baseUrl: `http://127.0.0.1:${address.port}`,
      repository
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function createDecisionPayload(): TelemetryDecisionPayload {
  return {
    ts: "2026-04-17T12:00:00.000Z",
    game_id: "game-1",
    hand_id: "hand-1",
    phase: "trick_play",
    actor_seat: "seat-1",
    decision_index: 3,
    schema_version: 2,
    engine_version: "milestone-1",
    sim_version: "milestone-2",
    policy_name: "heuristics-v1",
    policy_source: "local_heuristic",
    state_raw: { phase: "trick_play" },
    state_norm: { activeSeat: "seat-1" },
    legal_actions: [{ type: "play_cards" }],
    chosen_action: { type: "play_cards", seat: "seat-1", cardIds: ["star-2"] },
    metadata: { test: true },
    antipattern_tags: []
  };
}

function createEventPayload(ts: string, eventType: string): TelemetryEventPayload {
  return {
    ts,
    game_id: "game-1",
    hand_id: "hand-1",
    phase: "trick_play",
    event_type: eventType,
    actor_seat: "seat-1",
    schema_version: 2,
    engine_version: "milestone-1",
    sim_version: "milestone-2",
    payload: { type: eventType },
    metadata: {}
  };
}

function createDecisionRequestBody() {
  let result = createInitialGameState({ seed: "backend-route-test" });
  while (result.nextState.phase !== "grand_tichu_window") {
    result = applyEngineAction(result.nextState, {
      type: "advance_phase",
      actor: SYSTEM_ACTOR
    });
  }

  const actorSeat = result.nextState.activeSeat;
  if (!actorSeat) {
    throw new Error("Expected an active seat in the grand Tichu window.");
  }

  return {
    game_id: "game-1",
    hand_id: "hand-1",
    phase: result.nextState.phase,
    actor_seat: actorSeat,
    schema_version: 2,
    engine_version: "milestone-1",
    sim_version: "milestone-2",
    state_raw: result.nextState as unknown as Record<string, unknown>,
    state_norm: result.derivedView as unknown as Record<string, unknown>,
    legal_actions: getLegalActions(result.nextState) as unknown as Record<
      string,
      unknown
    >,
    requested_provider: "server_heuristic" as const,
    metadata: {
      decision_index: 1
    }
  };
}

afterEach(() => {
  // reserved for future test-specific cleanup
});

describe("backend foundation server routes", () => {
  it("rejects invalid telemetry decision payloads", async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: "missing-required-fields" })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(payload.validation_errors.some((issue) => issue.path === "phase")).toBe(
        true
      );
    });
  });

  it("stores valid telemetry payloads", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDecisionPayload())
      });

      expect(response.status).toBe(201);
      expect(repository.decisions).toHaveLength(1);
      expect(repository.decisions[0]?.policy_name).toBe("heuristics-v1");
    });
  });

  it("returns a heuristic action from the decision route", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const response = await fetch(`${baseUrl}/api/decision/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDecisionRequestBody())
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        accepted: boolean;
        chosen_action: EngineAction;
        provider_used: string;
        telemetry_id?: number;
      };
      expect(payload.accepted).toBe(true);
      expect(payload.provider_used).toBe("server_heuristic");
      expect(payload.chosen_action.type).toBeDefined();
      expect(payload.telemetry_id).toBeGreaterThan(0);
      expect(repository.decisions).toHaveLength(1);
      expect(repository.decisions[0]?.policy_source).toBe("server_heuristic");
    });
  });

  it("orders replay data by timestamp and id", async () => {
    await withServer(async ({ baseUrl }) => {
      await fetch(`${baseUrl}/api/telemetry/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createEventPayload("2026-04-17T12:00:01.000Z", "played"))
      });
      await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createDecisionPayload(),
          ts: "2026-04-17T12:00:00.500Z"
        })
      });
      await fetch(`${baseUrl}/api/telemetry/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createEventPayload("2026-04-17T12:00:02.000Z", "hand_end"))
      });

      const response = await fetch(`${baseUrl}/api/games/game-1/replay`);
      expect(response.status).toBe(200);
      const replay = (await response.json()) as ReplayPayload;

      expect(replay.timeline.map((entry) => entry.kind)).toEqual([
        "decision",
        "event",
        "event"
      ]);
      expect(replay.timeline[0]?.payload.game_id).toBe("game-1");
      expect(replay.timeline.at(-1)?.payload.event_type).toBe("hand_end");
    });
  });
});
