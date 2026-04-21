import { afterEach, describe, expect, it } from "vitest";
import {
  applyEngineAction,
  createInitialGameState,
  getLegalActions,
  SYSTEM_ACTOR,
  type EngineAction
} from "@tichuml/engine";
import type {
  AdminClearResult,
  ReplayPayload,
  StoredTelemetryDecisionRecord,
  StoredTelemetryEventRecord,
  TelemetryDecisionPayload,
  TelemetryEventPayload,
  TelemetryHealthStats
} from "@tichuml/shared";
import {
  deriveTelemetryDecisionFields,
  deriveTelemetryEventFields,
  stableTelemetryHash
} from "@tichuml/shared";
import { createAppServer } from "../../apps/server/src/app";
import type { ServerConfig } from "../../apps/server/src/config/env";
import type { LightgbmScorer } from "../../apps/server/src/ml/lightgbm-scorer";
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
      ...deriveTelemetryDecisionFields(payload),
      id,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async insertEvent(payload: TelemetryEventPayload): Promise<number> {
    const id = this.eventId++;
    this.events.push({
      ...payload,
      ...deriveTelemetryEventFields(payload),
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

  async getHealthStats(): Promise<TelemetryHealthStats> {
    const countBy = <T extends { [key: string]: unknown }>(
      rows: T[],
      key: keyof T
    ): Record<string, number> =>
      rows.reduce<Record<string, number>>((counts, row) => {
        const value = String(row[key] ?? "null");
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
      }, {});

    return {
      decisions: this.decisions.length,
      events: this.events.length,
      unique_state_hashes: new Set(this.decisions.map((decision) => decision.state_hash)).size,
      duplicate_state_hashes: 0,
      unique_legal_actions_hashes: new Set(
        this.decisions.map((decision) => decision.legal_actions_hash)
      ).size,
      duplicate_legal_actions_hashes: 0,
      decisions_with_explanation: this.decisions.filter(
        (decision) => decision.has_explanation
      ).length,
      decisions_with_candidate_scores: this.decisions.filter(
        (decision) => decision.has_candidate_scores
      ).length,
      decisions_with_state_features: this.decisions.filter(
        (decision) => decision.has_state_features
      ).length,
      decisions_with_legal_chosen_action: this.decisions.filter(
        (decision) => decision.chosen_action_is_legal
      ).length,
      decisions_with_wish: this.decisions.filter((decision) => decision.has_wish)
        .length,
      decisions_can_pass: this.decisions.filter((decision) => decision.can_pass)
        .length,
      latest_decision_ts: this.decisions.at(-1)?.ts ?? null,
      latest_event_ts: this.events.at(-1)?.ts ?? null,
      decisions_by_provider: countBy(this.decisions, "provider_used"),
      decisions_by_phase: countBy(this.decisions, "phase"),
      decisions_by_seat: countBy(this.decisions, "actor_seat"),
      events_by_type: countBy(this.events, "event_type"),
      events_by_phase: countBy(this.events, "phase")
    };
  }

  async clearTelemetry(): Promise<AdminClearResult> {
    const row_counts = {
      decisions: this.decisions.length,
      events: this.events.length
    };
    this.decisions = [];
    this.events = [];
    return {
      accepted: true,
      action: "telemetry.clear",
      tables_cleared: ["decisions", "events"],
      row_counts,
      warnings: ["Development/admin destructive endpoint used."]
    };
  }

  async clearDatabase(): Promise<AdminClearResult> {
    const result = await this.clearTelemetry();
    return {
      ...result,
      action: "database.clear",
      tables_cleared: ["decisions", "events", "matches"],
      row_counts: { ...result.row_counts, matches: 0 }
    };
  }

  async resetDatabase(): Promise<AdminClearResult> {
    const result = await this.clearDatabase();
    return {
      ...result,
      action: "database.reset"
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
  backendBaseUrl: "http://127.0.0.1",
  destructiveAdminEndpointsEnabled: false,
  repoRoot: "C:/tichu/tichuml",
  pythonExecutable: "python",
  lightgbmInferScript: "ml/infer.py",
  lightgbmModelPath: "ml/model_registry/lightgbm_action_model.txt",
  lightgbmModelMetaPath: "ml/model_registry/lightgbm_action_model.meta.json"
};

async function withServer<T>(
  callback: (config: { baseUrl: string; repository: InMemoryTelemetryRepository }) => Promise<T>,
  options: {
    lightgbmScorer?: LightgbmScorer;
    serverConfig?: Partial<ServerConfig>;
  } = {}
) {
  const repository = new InMemoryTelemetryRepository();
  const server = createAppServer({
    serverConfig: { ...TEST_SERVER_CONFIG, ...(options.serverConfig ?? {}) },
    repository,
    lightgbmScorer: options.lightgbmScorer
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
    requested_provider: "server_heuristic",
    provider_used: "server_heuristic",
    fallback_used: false,
    policy_name: "heuristics-v1",
    policy_source: "local_heuristic",
    state_raw: { phase: "trick_play", activeSeat: "seat-1" },
    state_norm: { activeSeat: "seat-1" },
    legal_actions: [{ type: "play_cards", seat: "seat-1", cardIds: ["star-2"] }],
    chosen_action: { type: "play_cards", seat: "seat-1", cardIds: ["star-2"] },
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
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
    event_index: 1,
    schema_version: 2,
    engine_version: "milestone-1",
    sim_version: "milestone-2",
    requested_provider: "server_heuristic",
    provider_used: "server_heuristic",
    fallback_used: false,
    state_norm: { phase: "trick_play" },
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

  it("rejects invalid telemetry event payloads", async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: "game-1", event_type: "played" })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(payload.validation_errors.some((issue) => issue.path === "event_index")).toBe(
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
      expect(repository.decisions[0]?.chosen_action_is_legal).toBe(true);
    });
  });

  it("rejects decision telemetry when chosen_action is not legal for actor_seat", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createDecisionPayload(),
          chosen_action: { type: "play_cards", seat: "seat-1", cardIds: ["jade-9"] }
        })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(
        payload.validation_errors.some((issue) => issue.path === "chosen_action")
      ).toBe(true);
      expect(repository.decisions).toHaveLength(0);
    });
  });

  it("rejects decision telemetry when phase and actor_seat contradict state_raw", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createDecisionPayload(),
          phase: "pass_select",
          actor_seat: "seat-2"
        })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(payload.validation_errors.map((issue) => issue.path)).toContain("phase");
      expect(payload.validation_errors.map((issue) => issue.path)).toContain("actor_seat");
      expect(repository.decisions).toHaveLength(0);
    });
  });

  it("hashes canonical JSON deterministically regardless of object key order", () => {
    expect(stableTelemetryHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableTelemetryHash({ a: { c: 3, d: 4 }, b: 2 })
    );
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

  it("returns LightGBM provider metadata when the model scorer is available", async () => {
    const scorer: LightgbmScorer = {
      async score(request) {
        return {
          scores: request.legalActions.map((_, index) => (index === 0 ? 0.9 : 0.1)),
          modelMetadata: {
            model_type: "lightgbm_action_model",
            feature_names: ["phase_trick_play"]
          }
        };
      },
      async close() {}
    };

    await withServer(
      async ({ baseUrl, repository }) => {
        const response = await fetch(`${baseUrl}/api/decision/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...createDecisionRequestBody(),
            requested_provider: "lightgbm_model"
          })
        });

        expect(response.status).toBe(200);
        const payload = (await response.json()) as {
          accepted: boolean;
          provider_used: string;
          metadata?: { scores?: Array<{ score: number }> };
        };
        expect(payload.accepted).toBe(true);
        expect(payload.provider_used).toBe("lightgbm_model");
        expect(payload.metadata?.scores?.[0]?.score).toBe(0.9);
        expect(repository.decisions).toHaveLength(1);
        expect(repository.decisions[0]?.policy_source).toBe("lightgbm_model");
      },
      { lightgbmScorer: scorer }
    );
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

  it("rejects destructive admin endpoints unless safeguards are present", async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/telemetry/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "CLEAR_TICHU_DB" })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(
        payload.validation_errors.some(
          (issue) => issue.path === "ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS"
        )
      ).toBe(true);
    });
  });

  it("clears telemetry when destructive admin safeguards are satisfied", async () => {
    await withServer(
      async ({ baseUrl, repository }) => {
        await fetch(`${baseUrl}/api/telemetry/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createDecisionPayload())
        });
        await fetch(`${baseUrl}/api/telemetry/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createEventPayload("2026-04-17T12:00:01.000Z", "played"))
        });

        const response = await fetch(`${baseUrl}/api/admin/telemetry/clear`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-confirm": "CLEAR_TICHU_DB"
          },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(200);
        const payload = (await response.json()) as {
          accepted: boolean;
          row_counts: Record<string, number>;
        };
        expect(payload.accepted).toBe(true);
        expect(payload.row_counts.decisions).toBe(1);
        expect(payload.row_counts.events).toBe(1);
        expect(repository.decisions).toHaveLength(0);
        expect(repository.events).toHaveLength(0);
      },
      { serverConfig: { destructiveAdminEndpointsEnabled: true } }
    );
  });

  it("requires confirmation for clear database even when destructive admin is enabled", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/database/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(400);
        const payload = (await response.json()) as {
          accepted: boolean;
          validation_errors: Array<{ path: string }>;
        };
        expect(payload.accepted).toBe(false);
        expect(
          payload.validation_errors.some(
            (issue) => issue.path === "x-admin-confirm"
          )
        ).toBe(true);
      },
      { serverConfig: { destructiveAdminEndpointsEnabled: true } }
    );
  });

  it("resets app-owned database tables when reset safeguards are satisfied", async () => {
    await withServer(
      async ({ baseUrl, repository }) => {
        await fetch(`${baseUrl}/api/telemetry/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createDecisionPayload())
        });

        const response = await fetch(`${baseUrl}/api/admin/database/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "CLEAR_TICHU_DB" })
        });

        expect(response.status).toBe(200);
        const payload = (await response.json()) as {
          accepted: boolean;
          action: string;
          row_counts: Record<string, number>;
        };
        expect(payload.accepted).toBe(true);
        expect(payload.action).toBe("database.reset");
        expect(payload.row_counts.decisions).toBe(1);
        expect(repository.decisions).toHaveLength(0);
      },
      { serverConfig: { destructiveAdminEndpointsEnabled: true } }
    );
  });
});
