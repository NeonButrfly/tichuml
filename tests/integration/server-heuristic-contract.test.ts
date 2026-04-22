import { describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import {
  applyEngineAction,
  compassToSeatId,
  createInitialGameState,
  getActorScopedLegalActions,
  getCanonicalActiveSeatFromState,
  seatIdFromIndex,
  seatIdToCompass,
  seatIndexFromId,
  validateLegalActionsForCanonicalActor,
  type CompassSeat,
  type EngineResult,
  type SeatId
} from "@tichuml/engine";
import type {
  AdminClearResult,
  DecisionRequestPayload,
  JsonObject,
  TelemetryHealthStats
} from "@tichuml/shared";
import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  TELEMETRY_DECISION_PATH,
  deriveTelemetryDecisionFields,
  deriveTelemetryEventFields
} from "@tichuml/shared";
import type {
  ReplayPayload,
  StoredTelemetryDecisionRecord,
  StoredTelemetryEventRecord,
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";
import { createAppServer } from "../../apps/server/src/app";
import type { ServerConfig } from "../../apps/server/src/config/env";
import {
  buildDecisionRequestPayload,
  resolveDecision,
  runSelfPlayBatch,
  safePostTelemetryEvent,
  validateBackendDecisionRequestInput,
  validateServerHeuristicDecisionRequestContract
} from "../../apps/sim-runner/src/self-play-batch";
import { routeHeuristicDecision as routeBackendHeuristicDecision } from "../../apps/server/src/providers/heuristic-provider";
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
    return this.decisions.filter((decision) => decision.game_id === gameId);
  }

  async listEvents(gameId: string): Promise<StoredTelemetryEventRecord[]> {
    return this.events.filter((event) => event.game_id === gameId);
  }

  async getReplay(gameId: string): Promise<ReplayPayload> {
    return {
      game_id: gameId,
      decisions: await this.listDecisions(gameId),
      events: await this.listEvents(gameId),
      timeline: []
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
  adminSimControlEnabled: false,
  runtimeAdminControlEnabled: false,
  traceDecisionRequests: false,
  requestBodyLimitBytes: 25 * 1024 * 1024,
  requestBodyLimitLabel: "25mb",
  telemetryMode: "minimal",
  telemetryMaxPostBytes: 24 * 1024 * 1024,
  simControllerRuntimeDir: "C:/tichu/tichuml/.runtime/test-sim-controller",
  repoRoot: "C:/tichu/tichuml",
  pythonExecutable: "python",
  lightgbmInferScript: "ml/infer.py",
  lightgbmModelPath: "ml/model_registry/lightgbm_action_model.txt",
  lightgbmModelMetaPath: "ml/model_registry/lightgbm_action_model.meta.json"
};

let nextSafeTestPort = 43210;

async function withServer<T>(
  callback: (config: { baseUrl: string; repository: InMemoryTelemetryRepository }) => Promise<T>
): Promise<T> {
  const repository = new InMemoryTelemetryRepository();
  const server = createAppServer({
    serverConfig: TEST_SERVER_CONFIG,
    repository
  });

  const port = nextSafeTestPort++;
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
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

async function withRejectingDecisionServer<T>(
  callback: (config: { baseUrl: string }) => Promise<T>
): Promise<T> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === BACKEND_HEALTH_PATH && request.method === "GET") {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === DECISION_REQUEST_PATH && request.method === "POST") {
      response.writeHead(400);
      response.end(
        JSON.stringify({
          accepted: false,
          error: "state_raw rejected by test backend",
          validation_errors: ["state_raw.hands is required"]
        })
      );
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: "not found" }));
  });

  const port = nextSafeTestPort++;
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  try {
    return await callback({ baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise<void>((resolve, reject) => {
      (server as Server).close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function withTelemetryDecisionServer<T>(
  config: {
    status?: number;
    body?: JsonObject;
  },
  callback: (server: {
    baseUrl: string;
    capturedPayloads: TelemetryDecisionPayload[];
  }) => Promise<T>
): Promise<T> {
  const capturedPayloads: TelemetryDecisionPayload[] = [];
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === BACKEND_HEALTH_PATH && request.method === "GET") {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === TELEMETRY_DECISION_PATH && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        capturedPayloads.push(JSON.parse(body) as TelemetryDecisionPayload);
        response.writeHead(config.status ?? 201);
        response.end(JSON.stringify(config.body ?? { accepted: true, telemetry_id: 1 }));
      });
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: "not found" }));
  });

  const port = nextSafeTestPort++;
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  try {
    return await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      capturedPayloads
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      (server as Server).close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function advanceToPassSelect(): EngineResult {
  let result = createInitialGameState({ seed: "server-contract-pass-select" });
  while (result.nextState.phase === "grand_tichu_window") {
    const activeSeat = getCanonicalActiveSeatFromState(result.nextState);
    result = applyEngineAction(result.nextState, {
      type: "decline_grand_tichu",
      seat: activeSeat
    });
  }

  expect(result.nextState.phase).toBe("pass_select");
  return result;
}

function createServerHeuristicPayload(result: EngineResult): DecisionRequestPayload {
  const actor = getCanonicalActiveSeatFromState(result.nextState);
  return buildDecisionRequestPayload({
    gameId: "contract-game",
    handId: "contract-hand",
    stateRaw: result.nextState as unknown as JsonObject,
    stateNorm: result.derivedView as unknown as JsonObject,
    legalActions: getActorScopedLegalActions(result.legalActions, actor),
    phase: result.nextState.phase,
    requestedProvider: "server_heuristic",
    decisionIndex: 1
  });
}

function createTelemetryEventPayload(result: EngineResult): TelemetryEventPayload {
  return {
    ts: new Date().toISOString(),
    game_id: "telemetry-event-game",
    hand_id: "telemetry-event-hand",
    phase: result.nextState.phase,
    event_type: "test_event",
    actor_seat: null,
    event_index: 0,
    schema_version: 1,
    engine_version: "test",
    sim_version: "test",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    state_norm: result.derivedView as unknown as JsonObject,
    payload: { test: true },
    metadata: {}
  };
}

describe("server_heuristic actor contract", () => {
  it("derives canonical active actors from the engine state source of truth", () => {
    const result = createInitialGameState({ seed: "canonical-active-seat" });
    expect(getCanonicalActiveSeatFromState(result.nextState)).toBe("seat-0");

    const passSelect = advanceToPassSelect();
    expect(passSelect.nextState.activeSeat).toBeNull();
    expect(getCanonicalActiveSeatFromState(passSelect.nextState)).toBe("seat-0");
  });

  it("builds server requests with actor_seat matching the canonical actor", () => {
    const result = advanceToPassSelect();
    const request = createServerHeuristicPayload(result);

    expect(request.actor_seat).toBe(getCanonicalActiveSeatFromState(request.state_raw));
    expect(
      validateLegalActionsForCanonicalActor({
        legalActions: request.legal_actions as never,
        actor: request.actor_seat as SeatId
      })
    ).toEqual([]);
    expect(() => validateServerHeuristicDecisionRequestContract(request)).not.toThrow();
  });

  it("rejects mismatched simulator requests before sending them", () => {
    const result = advanceToPassSelect();
    const request = {
      ...createServerHeuristicPayload(result),
      actor_seat: "seat-2"
    };

    expect(() => validateServerHeuristicDecisionRequestContract(request)).toThrow(
      /\[server_heuristic\] refusing inconsistent request/
    );
  });

  it("reports incomplete backend payloads before sending them", () => {
    const result = advanceToPassSelect();
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    const validation = validateBackendDecisionRequestInput({
      gameId: "contract-game",
      handId: "contract-hand",
      stateRaw: { phase: result.nextState.phase, activeSeat: result.nextState.activeSeat },
      stateNorm: result.derivedView as unknown as JsonObject,
      legalActions: getActorScopedLegalActions(result.legalActions, actor),
      phase: result.nextState.phase,
      actor,
      requestedProvider: "server_heuristic",
      decisionIndex: 1
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.kind).toBe("payload_validation");
      expect(validation.missingFields).toContain("state_raw.hands");
      expect(validation.context).toMatchObject({
        game_id: "contract-game",
        hand_id: "contract-hand",
        actor_seat: actor,
        provider: "server_heuristic"
      });
    }
  });

  it("keeps backend validation as an actionable safety net", () => {
    const result = advanceToPassSelect();
    const request = createServerHeuristicPayload(result);

    expect(() => routeBackendHeuristicDecision(request)).not.toThrow();
    expect(() =>
      routeBackendHeuristicDecision({
        ...request,
        actor_seat: "seat-2"
      })
    ).toThrow(/Actor mismatch:[\s\S]*request\.actor_seat=seat-2[\s\S]*canonical\.state\.activeSeat=seat-0/);
  });

  it("keeps numeric, string, and compass seat identities stable without rotation", () => {
    for (let index = 0; index < 4; index += 1) {
      const seat = seatIdFromIndex(index);
      expect(seatIndexFromId(seat)).toBe(index);
      expect(compassToSeatId(seatIdToCompass(seat))).toBe(seat);
    }
  });

  it("does not let presentation-relative rotation leak into backend actor identity", () => {
    const absoluteEngineOrder = [0, 1, 2, 3].map(seatIdFromIndex);
    const displayOrderFromSouthPointOfView = (
      ["south", "west", "north", "east"] as CompassSeat[]
    ).map(compassToSeatId);

    expect(displayOrderFromSouthPointOfView).toEqual(absoluteEngineOrder);
  });

  it("runs a server_heuristic self-play regression batch without actor mismatches", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const capturedErrors: string[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation((value) => {
        capturedErrors.push(typeof value === "string" ? value : JSON.stringify(value));
      });
      try {
        await runSelfPlayBatch({
          games: 1,
          baseSeed: "server-heuristic-contract",
          defaultProvider: "server_heuristic",
          telemetryEnabled: false,
          backendBaseUrl: baseUrl,
          quiet: true,
          maxDecisionsPerGame: 1
        });
      } finally {
        debugSpy.mockRestore();
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }

      expect(capturedErrors.join("\n")).not.toMatch(/actor[_ -]?seat|Actor mismatch/i);
      expect(repository.decisions.length).toBeGreaterThan(0);
    });
  }, 15_000);

  it("falls back locally with structured logs when the backend rejects decision requests", async () => {
    await withRejectingDecisionServer(async ({ baseUrl }) => {
      const result = advanceToPassSelect();
      const actor = getCanonicalActiveSeatFromState(result.nextState);
      const capturedErrors: string[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation((value) => {
        capturedErrors.push(typeof value === "string" ? value : JSON.stringify(value));
      });
      try {
        const decision = await resolveDecision({
          backendBaseUrl: baseUrl,
          telemetryEnabled: false,
          gameId: "backend-rejection-game",
          handId: "backend-rejection-hand",
          actor,
          decisionIndex: 0,
          stateRaw: result.nextState as unknown as JsonObject,
          stateNorm: result.derivedView as unknown as JsonObject,
          legalActions: result.legalActions,
          phase: result.nextState.phase,
          defaultProvider: "server_heuristic",
          serverFallbackEnabled: true
        });

        expect(decision.providerUsed).toBe("local_heuristic");
        expect(decision.requestedProvider).toBe("server_heuristic");
        expect(decision.fallbackUsed).toBe(true);
        expect(decision.chosenAction).toBeTruthy();
      } finally {
        errorSpy.mockRestore();
      }

      const joined = capturedErrors.join("\n");
      expect(joined).toMatch(/"event":"decision_backend_validation_failure"/);
      expect(joined).toMatch(/"kind":"backend_rejection"/);
      expect(joined).toMatch(/"event":"decision_fallback"/);
      expect(joined).toMatch(/"provider_used":"local_heuristic"/);
      expect(joined).toMatch(/state_raw rejected by test backend/);
      expect(joined).not.toMatch(/^fetch failed$/m);
    });
  }, 15_000);

  it("keeps local provider decisions alive when telemetry decision POST fails in non-strict mode", async () => {
    const result = advanceToPassSelect();
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    const decision = await resolveDecision({
      backendBaseUrl: "http://127.0.0.1:1",
      telemetryEnabled: true,
      strictTelemetry: false,
      gameId: "local-telemetry-network-game",
      handId: "local-telemetry-network-hand",
      actor,
      decisionIndex: 0,
      stateRaw: result.nextState as unknown as JsonObject,
      stateNorm: result.derivedView as unknown as JsonObject,
      legalActions: result.legalActions,
      phase: result.nextState.phase,
      defaultProvider: "local"
    });

    expect(decision.providerUsed).toBe("local_heuristic");
    expect(decision.telemetryFailureStats.telemetryDecisionFailures).toBe(1);
    expect(decision.telemetryFailureStats.telemetryFailuresTotal).toBe(1);
  });

  it("sends compact local decision telemetry by default", async () => {
    await withTelemetryDecisionServer({}, async ({ baseUrl, capturedPayloads }) => {
      const result = advanceToPassSelect();
      const actor = getCanonicalActiveSeatFromState(result.nextState);
      const decision = await resolveDecision({
        backendBaseUrl: baseUrl,
        telemetryEnabled: true,
        strictTelemetry: false,
        gameId: "minimal-telemetry-game",
        handId: "minimal-telemetry-hand",
        actor,
        decisionIndex: 0,
        stateRaw: result.nextState as unknown as JsonObject,
        stateNorm: result.derivedView as unknown as JsonObject,
        legalActions: result.legalActions,
        phase: result.nextState.phase,
        defaultProvider: "local"
      });

      expect(decision.providerUsed).toBe("local_heuristic");
      expect(capturedPayloads.length).toBe(1);
      const payload = capturedPayloads[0];
      expect(payload.game_id).toBe("minimal-telemetry-game");
      expect(payload.hand_id).toBe("minimal-telemetry-hand");
      expect(payload.phase).toBe(result.nextState.phase);
      expect(payload.actor_seat).toBe(actor);
      expect(payload.decision_index).toBe(0);
      expect(payload.provider_used).toBe("local_heuristic");
      expect(payload.state_raw).toEqual({});
      expect(payload.state_norm).toBeNull();
      expect(payload.legal_actions).toEqual([payload.chosen_action]);
      expect(payload.explanation).toBeNull();
      expect(payload.candidateScores).toBeNull();
      expect(payload.metadata).toMatchObject({
        telemetry_mode: "minimal",
        legal_action_count: result.legalActions[actor]?.length ?? 0
      });
      expect(JSON.stringify(payload).length).toBeLessThan(10_000);
    });
  });

  it("keeps local provider decisions alive when telemetry decision POST returns 500", async () => {
    await withTelemetryDecisionServer(
      {
        status: 500,
        body: {
          error: "Request body exceeded the supported size limit."
        }
      },
      async ({ baseUrl }) => {
        const result = advanceToPassSelect();
        const actor = getCanonicalActiveSeatFromState(result.nextState);
        const decision = await resolveDecision({
          backendBaseUrl: baseUrl,
          telemetryEnabled: true,
          strictTelemetry: false,
          gameId: "telemetry-500-game",
          handId: "telemetry-500-hand",
          actor,
          decisionIndex: 0,
          stateRaw: result.nextState as unknown as JsonObject,
          stateNorm: result.derivedView as unknown as JsonObject,
          legalActions: result.legalActions,
          phase: result.nextState.phase,
          defaultProvider: "local"
        });

        expect(decision.providerUsed).toBe("local_heuristic");
        expect(decision.telemetryFailureStats.telemetryDecisionFailures).toBe(1);
        expect(decision.telemetryFailureStats.telemetryFailuresTotal).toBe(1);
        expect(decision.telemetryFailure).toMatchObject({
          ok: false,
          failure_kind: "backend_rejection",
          status: 500,
          body: {
            error: "Request body exceeded the supported size limit."
          }
        });
      }
    );
  });

  it("fails local provider decisions on telemetry failure only in strict mode", async () => {
    const result = advanceToPassSelect();
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    await expect(
      resolveDecision({
        backendBaseUrl: "http://127.0.0.1:1",
        telemetryEnabled: true,
        strictTelemetry: true,
        gameId: "strict-telemetry-game",
        handId: "strict-telemetry-hand",
        actor,
        decisionIndex: 0,
        stateRaw: result.nextState as unknown as JsonObject,
        stateNorm: result.derivedView as unknown as JsonObject,
        legalActions: result.legalActions,
        phase: result.nextState.phase,
        defaultProvider: "local"
      })
    ).rejects.toThrow(/Strict telemetry decision persistence failed/);
  });

  it("skips oversized telemetry locally instead of posting it in non-strict mode", async () => {
    await withTelemetryDecisionServer({}, async ({ baseUrl, capturedPayloads }) => {
      const result = advanceToPassSelect();
      const actor = getCanonicalActiveSeatFromState(result.nextState);
      const decision = await resolveDecision({
        backendBaseUrl: baseUrl,
        telemetryEnabled: true,
        strictTelemetry: false,
        telemetryMode: "full",
        telemetryMaxBytes: 1,
        gameId: "oversize-guard-game",
        handId: "oversize-guard-hand",
        actor,
        decisionIndex: 0,
        stateRaw: result.nextState as unknown as JsonObject,
        stateNorm: result.derivedView as unknown as JsonObject,
        legalActions: result.legalActions,
        phase: result.nextState.phase,
        defaultProvider: "local"
      });

      expect(decision.providerUsed).toBe("local_heuristic");
      expect(capturedPayloads).toHaveLength(0);
      expect(decision.telemetryFailureStats.telemetryDecisionFailures).toBe(1);
      expect(decision.telemetryFailure).toMatchObject({
        ok: false,
        cause: "local_oversize_guard",
        max_bytes: 1
      });
    });
  });

  it("reports telemetry event POST failures without throwing through the safe wrapper", async () => {
    const result = advanceToPassSelect();
    const telemetryResult = await safePostTelemetryEvent({
      backendBaseUrl: "http://127.0.0.1:1",
      payload: createTelemetryEventPayload(result)
    });

    expect(telemetryResult.ok).toBe(false);
    if (!telemetryResult.ok) {
      expect(telemetryResult.request_kind).toBe("telemetry_event");
      expect(telemetryResult.failure_kind).toBe("network_failure");
      expect(telemetryResult.endpoint).toContain("/api/telemetry/event");
    }
  });

  it("falls back locally when server_heuristic is unreachable and fallback is enabled", async () => {
    const result = advanceToPassSelect();
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    const capturedErrors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((value) => {
      capturedErrors.push(typeof value === "string" ? value : JSON.stringify(value));
    });
    try {
      const decision = await resolveDecision({
        backendBaseUrl: "http://127.0.0.1:1",
        telemetryEnabled: false,
        gameId: "server-network-fallback-game",
        handId: "server-network-fallback-hand",
        actor,
        decisionIndex: 0,
        stateRaw: result.nextState as unknown as JsonObject,
        stateNorm: result.derivedView as unknown as JsonObject,
        legalActions: result.legalActions,
        phase: result.nextState.phase,
        defaultProvider: "server_heuristic",
        serverFallbackEnabled: true
      });

      expect(decision.providerUsed).toBe("local_heuristic");
      expect(decision.fallbackUsed).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }

    const joined = capturedErrors.join("\n");
    expect(joined).toMatch(/"event":"decision_provider_failure"/);
    expect(joined).toMatch(/"kind":"network_failure"/);
    expect(joined).toMatch(/"event":"decision_fallback"/);
  });

  it("returns backend decision success metadata without changing the response contract", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const request = createServerHeuristicPayload(advanceToPassSelect());
      const response = await fetch(`${baseUrl}${DECISION_REQUEST_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      const payload = (await response.json()) as JsonObject;

      expect(response.status).toBe(200);
      expect(payload.provider_used).toBe("server_heuristic");
      expect(payload.telemetry_id).toBe(1);
      expect(repository.decisions.length).toBe(1);
      expect(payload.metadata).toMatchObject({
        canonical_actor_seat: request.actor_seat,
        request_validated: true,
        provider_path: "server_heuristic"
      });
      expect((payload.metadata as JsonObject).legal_action_count).toBeGreaterThan(0);
    });
  });

  it("preserves informative backend actor mismatch rejection bodies", async () => {
    await withServer(async ({ baseUrl }) => {
      const request = {
        ...createServerHeuristicPayload(advanceToPassSelect()),
        actor_seat: "seat-2"
      };
      const response = await fetch(`${baseUrl}${DECISION_REQUEST_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      const payload = (await response.json()) as JsonObject;

      expect(response.status).toBe(400);
      expect(String(payload.error)).toMatch(/Actor mismatch/);
      expect(JSON.stringify(payload.validation_errors)).toMatch(/request\.actor_seat=seat-2/);
    });
  });

  it("keeps additive telemetry failure summary fields present for old consumers", async () => {
    const summary = await runSelfPlayBatch({
      games: 0,
      baseSeed: "summary-shape",
      defaultProvider: "local",
      telemetryEnabled: false,
      quiet: true,
      progress: false
    });

    expect(summary.gamesPlayed).toBe(0);
    expect(summary.telemetryDecisionFailures).toBe(0);
    expect(summary.telemetryEventFailures).toBe(0);
    expect(summary.telemetryFailuresTotal).toBe(0);
    expect(summary.telemetryFailureByEndpoint).toEqual({});
  });

  it("keeps local self-play independent from backend provider fallback handling", async () => {
    const result = advanceToPassSelect();
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    const decision = await resolveDecision({
      backendBaseUrl: "http://127.0.0.1:1",
      telemetryEnabled: false,
      gameId: "local-provider-game",
      handId: "local-provider-hand",
      actor,
      decisionIndex: 0,
      stateRaw: result.nextState as unknown as JsonObject,
      stateNorm: result.derivedView as unknown as JsonObject,
      legalActions: result.legalActions,
      phase: result.nextState.phase,
      defaultProvider: "local"
    });

    expect(decision.providerUsed).toBe("local_heuristic");
    expect(decision.requestedProvider).toBe("local");
    expect(decision.fallbackUsed).toBe(false);
    expect(decision.chosenAction).toBeTruthy();
  });

});
