import { describe, expect, it, vi } from "vitest";
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
  runSelfPlayBatch,
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
    return {
      decisions: this.decisions.length,
      events: this.events.length,
      decisions_with_explanation: this.decisions.filter(
        (decision) => decision.has_explanation
      ).length,
      decisions_with_candidate_scores: this.decisions.filter(
        (decision) => decision.has_candidate_scores
      ).length,
      decisions_with_state_features: this.decisions.filter(
        (decision) => decision.has_state_features
      ).length,
      duplicate_state_hashes: 0
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
  callback: (config: { baseUrl: string; repository: InMemoryTelemetryRepository }) => Promise<T>
): Promise<T> {
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
});
