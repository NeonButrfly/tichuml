import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  SimControllerRequestPayload,
  SimControllerResponse,
  SimControllerRuntimeState,
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
import type {
  RuntimeActionResult,
  RuntimeAdminService,
  RuntimeAdminStatus,
  RuntimeConfigPayload,
  RuntimeConfigSaveResult
} from "../../apps/server/src/services/runtime-admin-service";
import {
  FileSimControllerService,
  type SimControllerService
} from "../../apps/server/src/services/sim-controller-service";
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

function createSimState(
  status: SimControllerRuntimeState["status"]
): SimControllerRuntimeState {
  const now = new Date().toISOString();
  return {
    status,
    pid: null,
    controller_id: "test-controller",
    started_at: status === "stopped" ? null : now,
    updated_at: now,
    last_heartbeat: status === "stopped" ? null : now,
    heartbeat_stale: false,
    heartbeat_stale_after_seconds: 30,
    requested_action: null,
    current_batch_started_at: null,
    last_batch_started_at: null,
    last_batch_finished_at: null,
    last_batch_size: 1,
    last_batch_status: null,
    total_batches_completed: 0,
    total_games_completed: 0,
    total_errors: 0,
    last_error: null,
    worker_count: 1,
    running_worker_count: status === "running" ? 1 : 0,
    paused_worker_count: status === "paused" ? 1 : 0,
    stopped_worker_count: status === "stopped" ? 1 : 0,
    errored_worker_count: status === "error" ? 1 : 0,
    config: {
      provider: "local",
      games_per_batch: 1,
      telemetry_enabled: false,
      backend_url: "http://127.0.0.1",
      seed_prefix: "test",
      sleep_seconds: 1,
      worker_count: 1,
      quiet: true,
      progress: false,
      seat_providers: {}
    },
    workers: [],
    log_path: "test.log",
    runtime_path: "state.json",
    lock_path: "controller.lock",
    pause_path: "pause",
    stop_path: "stop",
    warnings: [],
    recent_logs: []
  };
}

class InMemorySimController implements SimControllerService {
  state = createSimState("stopped");

  private respond(
    accepted: boolean,
    action: string,
    prior: SimControllerRuntimeState,
    message: string,
    warnings: string[] = []
  ): SimControllerResponse {
    return {
      accepted,
      action,
      prior_status: prior.status,
      current_status: this.state.status,
      message,
      runtime_state: this.state,
      warnings
    };
  }

  async start(payload: SimControllerRequestPayload): Promise<SimControllerResponse> {
    const prior = this.state;
    if (this.state.status === "running") {
      return this.respond(false, "sim.start", prior, "Already running.");
    }
    this.state = createSimState("running");
    this.state.worker_count = Number(payload.worker_count ?? 1);
    this.state.running_worker_count = this.state.worker_count;
    this.state.config.worker_count = this.state.worker_count;
    this.state.workers = Array.from({ length: this.state.worker_count }, (_, index) => ({
      worker_id: `worker-${index + 1}`,
      status: "running",
      pid: 1234 + index,
      current_batch_started_at: this.state.started_at,
      total_batches_completed: 0,
      total_games_completed: 0,
      last_heartbeat: this.state.last_heartbeat,
      last_error: null
    }));
    return this.respond(true, "sim.start", prior, "Started.");
  }

  async pause(): Promise<SimControllerResponse> {
    const prior = this.state;
    if (this.state.status === "paused") {
      return this.respond(true, "sim.pause", prior, "Already paused.");
    }
    this.state = { ...this.state, status: "paused", paused_worker_count: this.state.worker_count, running_worker_count: 0 };
    return this.respond(true, "sim.pause", prior, "Paused.");
  }

  async continue(): Promise<SimControllerResponse> {
    const prior = this.state;
    const accepted = prior.status === "paused";
    this.state = { ...this.state, status: "running", running_worker_count: this.state.worker_count, paused_worker_count: 0 };
    return this.respond(accepted, "sim.continue", prior, accepted ? "Continued." : "Not paused.", accepted ? [] : ["Continue requested while not paused."]);
  }

  async stop(): Promise<SimControllerResponse> {
    const prior = this.state;
    if (this.state.status === "stopped") {
      return this.respond(true, "sim.stop", prior, "Already stopped.");
    }
    this.state = createSimState("stopped");
    return this.respond(true, "sim.stop", prior, "Stopped.");
  }

  async status(): Promise<SimControllerResponse> {
    const prior = this.state;
    return this.respond(true, "sim.status", prior, "Status loaded.");
  }

  async runOnce(payload: SimControllerRequestPayload): Promise<SimControllerResponse> {
    const prior = this.state;
    this.state = createSimState("completed");
    this.state.total_batches_completed = 1;
    this.state.total_games_completed = Number(payload.games ?? payload.games_per_batch ?? 1);
    return this.respond(true, "sim.run_once", prior, "Run once completed.");
  }
}

class InMemoryRuntimeAdmin implements RuntimeAdminService {
  constructor(private readonly locked = false) {}

  config: RuntimeConfigPayload = {
    env_file: "C:/tichu/tichuml/.env",
    effective: { PORT: "4310" },
    detected: {
      detectedEthernet: "192.168.50.32",
      detectedWireless: null,
      detectedDefault: "192.168.50.32",
      primary_ip: "192.168.50.32",
      system_ips: ["192.168.50.32"]
    },
    entries: [
      {
        key: "PORT",
        label: "Port",
        category: "Network",
        type: "number",
        editable: true,
        requiresRestart: true,
        description: "Backend HTTP port.",
        savedValue: "4310",
        effectiveValue: "4310",
        detectedValue: undefined,
        overrideEnabled: true,
        overrideValue: "",
        value: "4310",
        effective_value: "4310",
        detected_value: undefined,
        overridden: true,
        restart_required: true,
        input: "number"
      }
    ],
    pending_restart: false,
    runtime_differs_from_disk_config: false
  };

  async status(): Promise<RuntimeAdminStatus> {
    return {
      checked_at: new Date().toISOString(),
      admin_safety: {
        locked: this.locked,
        blocked_actions: this.locked ? ["restart_backend"] : []
      },
      backend: {
        running: true,
        pid: 1234,
        uptime_seconds: 12,
        port_listeners: [1234],
        pid_file: "backend.pid",
        log_file: "backend.log",
        runtime_dir: ".runtime"
      },
      endpoints: {
        health: { ok: true, label: "HTTP 200", detail: "ok" }
      },
      postgres: {
        container_running: true,
        ready: true,
        detail: "accepting connections"
      },
      git: {
        branch: "main",
        local_commit: "abc",
        remote_commit: "abc",
        ahead: 0,
        behind: 0,
        dirty: false
      },
      tools: {
        node: { ok: true, label: "v20", detail: "node" }
      },
      runtime: {
        repo_root: "C:/tichu/tichuml",
        backend_public_url: "http://localhost:4310",
        backend_local_url: "http://127.0.0.1:4310",
        backend_base_url: "http://localhost:4310",
        detected_ethernet: "192.168.50.32",
        detected_wireless: null,
        detected_default: "192.168.50.32",
        detected_primary_ip: "192.168.50.32",
        detected_system_ips: ["192.168.50.32"],
        backend_host_ip_override: null,
        sim_controller_runtime_dir: ".runtime/sim-controller",
        update_status_file: ".runtime/backend-update-status.env",
        update_status_json_file: ".runtime/backend-update-status.json",
        action_log_file: ".runtime/actions.ndjson",
        web_dist_exists: true,
        node_modules_exists: true,
        python_venv_exists: true,
        ml_requirements_installed: true,
        lightgbm_model_exists: false,
        config_pending_restart: false,
        runtime_differs_from_disk_config: false
      },
      recent_logs: {
        backend: [],
        actions: []
      }
    };
  }

  async readConfig(): Promise<RuntimeConfigPayload> {
    return this.config;
  }

  async saveConfig(
    updates: Record<string, unknown>
  ): Promise<RuntimeConfigSaveResult> {
    this.config = {
      ...this.config,
      pending_restart: true,
      entries: this.config.entries.map((entry) =>
        entry.key in updates && typeof updates[entry.key] === "string"
          ? { ...entry, value: updates[entry.key] }
          : entry
      )
    };
    return {
      accepted: true,
      message: "Config saved.",
      changed_keys: Object.keys(updates),
      restart_required: true,
      config: this.config
    };
  }

  async setAdminSafetyLocked(locked: boolean) {
    return {
      accepted: true,
      locked,
      message: locked ? "Admin safety lock enabled." : "Admin safety lock disabled.",
      config: this.config
    };
  }

  async isAdminSafetyLocked(): Promise<boolean> {
    return this.locked;
  }

  async runAction(action: string): Promise<RuntimeActionResult> {
    return {
      accepted: true,
      action,
      message: `Runtime action '${action}' started.`,
      log_file: ".runtime/actions.ndjson",
      started_at: new Date().toISOString()
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
  telemetryPostTimeoutMs: 10000,
  telemetryIngestQueueMaxDepth: 5000,
  telemetryPersistenceBatchSize: 100,
  telemetryPersistenceConcurrency: 2,
  simDefaultProvider: "local",
  simDefaultBackendUrl: "http://127.0.0.1",
  simDefaultWorkerCount: 1,
  simDefaultGamesPerBatch: 1,
  simControllerRuntimeDir: "C:/tichu/tichuml/.runtime/test-sim-controller",
  repoRoot: "C:/tichu/tichuml",
  pythonExecutable: "python",
  lightgbmInferScript: "ml/infer.py",
  lightgbmModelPath: "ml/model_registry/lightgbm_action_model.txt",
  lightgbmModelMetaPath: "ml/model_registry/lightgbm_action_model.meta.json"
};

let nextSafeTestPort = 43110;

async function withServer<T>(
  callback: (config: { baseUrl: string; repository: InMemoryTelemetryRepository }) => Promise<T>,
  options: {
    lightgbmScorer?: LightgbmScorer;
    serverConfig?: Partial<ServerConfig>;
    simController?: SimControllerService;
    runtimeAdmin?: RuntimeAdminService;
  } = {}
) {
  const repository = new InMemoryTelemetryRepository();
  const server = createAppServer({
    serverConfig: { ...TEST_SERVER_CONFIG, ...(options.serverConfig ?? {}) },
    repository,
    lightgbmScorer: options.lightgbmScorer,
    simController: options.simController,
    runtimeAdmin: options.runtimeAdmin ?? new InMemoryRuntimeAdmin()
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

function createMinimalDecisionPayload(): TelemetryDecisionPayload {
  const chosenAction = { type: "play_cards", seat: "seat-1", cardIds: ["star-2"] };
  return {
    ...createDecisionPayload(),
    state_raw: {},
    state_norm: null,
    legal_actions: [chosenAction],
    chosen_action: chosenAction,
    explanation: null,
    candidateScores: null,
    stateFeatures: {
      telemetry_mode: "minimal",
      legal_action_count: 1
    },
    metadata: {
      telemetry_mode: "minimal",
      legal_action_count: 1
    },
    antipattern_tags: []
  };
}

function createFullDecisionPayload(): TelemetryDecisionPayload {
  return {
    ...createDecisionPayload(),
    state_raw: {
      phase: "trick_play",
      activeSeat: "seat-1",
      training_context: "x".repeat(700_000)
    },
    state_norm: {
      activeSeat: "seat-1",
      training_features: "y".repeat(700_000)
    },
    explanation: {
      reason: "full telemetry training payload",
      candidateScores: [{ action: "play", score: 1 }],
      stateFeatures: { feature_count: 1 }
    },
    candidateScores: [{ action: "play", score: 1 }],
    stateFeatures: {
      telemetry_mode: "full",
      feature_count: 1
    },
    metadata: {
      telemetry_mode: "full",
      training: true
    }
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
  it("advertises simulator dashboard routes in the server manifest", async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/manifest`);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        simDashboardEndpoints?: string[];
      };
      expect(payload.simDashboardEndpoints).toEqual(["/admin/sim", "/sim/control"]);
    });
  });

  it("serves the runtime control panel and read-only runtime status", async () => {
    await withServer(async ({ baseUrl }) => {
      const panel = await fetch(`${baseUrl}/admin/control`);
      expect(panel.status).toBe(200);
      expect(await panel.text()).toContain("Runtime Control");

      const status = await fetch(`${baseUrl}/api/admin/runtime/status`);
      expect(status.status).toBe(200);
      const payload = (await status.json()) as RuntimeAdminStatus;
      expect(payload.backend.running).toBe(true);
      expect(payload.postgres.ready).toBe(true);
    });
  });

  it("guards runtime mutating actions behind runtime admin safeguards", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/runtime/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart_backend" })
        });

        expect(response.status).toBe(400);
        const payload = (await response.json()) as {
          validation_errors: Array<{ path: string }>;
        };
        expect(payload.validation_errors.map((issue) => issue.path)).toContain(
          "admin_safety"
        );
      },
      { runtimeAdmin: new InMemoryRuntimeAdmin(true) }
    );
  });

  it("runs runtime actions when safeguards are satisfied", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/runtime/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart_backend" })
        });

        expect(response.status).toBe(202);
        const payload = (await response.json()) as RuntimeActionResult;
        expect(payload.accepted).toBe(true);
        expect(payload.action).toBe("restart_backend");
      },
      { serverConfig: { runtimeAdminControlEnabled: true } }
    );
  });

  it("runs named runtime action endpoints when safeguards are satisfied", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(
          `${baseUrl}/api/admin/runtime/actions/update-repo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          }
        );

        expect(response.status).toBe(202);
        const payload = (await response.json()) as RuntimeActionResult;
        expect(payload.accepted).toBe(true);
        expect(payload.action).toBe("update_repo");
      },
      { serverConfig: { runtimeAdminControlEnabled: true } }
    );
  });

  it("requires explicit confirmation for clear database action", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(
          `${baseUrl}/api/admin/runtime/actions/clear-db`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          }
        );

        expect(response.status).toBe(400);
        const payload = (await response.json()) as {
          validation_errors: Array<{ path: string }>;
        };
        expect(payload.validation_errors.map((issue) => issue.path)).toContain(
          "confirmed"
        );
      },
      { serverConfig: { runtimeAdminControlEnabled: true } }
    );
  });

  it("saves runtime config while admin safety is locked", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/runtime/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: { PORT: "4311" } })
        });

        expect(response.status).toBe(200);
        const payload = (await response.json()) as RuntimeConfigSaveResult;
        expect(payload.accepted).toBe(true);
      },
      { runtimeAdmin: new InMemoryRuntimeAdmin(true) }
    );
  });

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

      expect(response.status).toBe(202);
      expect(repository.decisions).toHaveLength(1);
      expect(repository.decisions[0]?.policy_name).toBe("heuristics-v1");
      expect(repository.decisions[0]?.chosen_action_is_legal).toBe(true);
    });
  });

  it("accepts minimal simulator decision telemetry through the backend validator", async () => {
    await withServer(async ({ baseUrl, repository }) => {
      const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createMinimalDecisionPayload())
      });

      expect(response.status).toBe(202);
      expect(repository.decisions).toHaveLength(1);
      expect(repository.decisions[0]?.state_raw).toEqual({});
      expect(repository.decisions[0]?.state_norm).toBeNull();
      expect(repository.decisions[0]?.legal_action_count).toBe(1);
      expect(repository.decisions[0]?.chosen_action_is_legal).toBe(true);
    });
  });

  it("accepts full simulator decision telemetry below the configured request limit", async () => {
    await withServer(
      async ({ baseUrl, repository }) => {
        const payload = createFullDecisionPayload();
        expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeGreaterThan(
          512 * 1024
        );
        const response = await fetch(`${baseUrl}/api/telemetry/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        expect(response.status).toBe(202);
        expect(repository.decisions).toHaveLength(1);
        expect(repository.decisions[0]?.has_explanation).toBe(true);
        expect(repository.decisions[0]?.has_candidate_scores).toBe(true);
        expect(repository.decisions[0]?.has_state_features).toBe(true);
      },
      {
        serverConfig: {
          requestBodyLimitBytes: 2 * 1024 * 1024,
          requestBodyLimitLabel: "2mb"
        }
      }
    );
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

  it("rejects simulator control endpoints unless the sim admin guard is enabled", async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/sim/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-confirm": "CLEAR_TICHU_DB"
        },
        body: JSON.stringify({ worker_count: 1 })
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        accepted: boolean;
        validation_errors: Array<{ path: string }>;
      };
      expect(payload.accepted).toBe(false);
      expect(payload.validation_errors.map((issue) => issue.path)).toContain(
        "ENABLE_ADMIN_SIM_CONTROL"
      );
    });
  });

  it("requires confirmation for simulator mutating actions", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/sim/pause`, {
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
        expect(payload.validation_errors.map((issue) => issue.path)).toContain(
          "x-admin-confirm"
        );
      },
      {
        serverConfig: { adminSimControlEnabled: true },
        simController: new InMemorySimController()
      }
    );
  });

  it("exposes simulator status when sim admin control is enabled", async () => {
    await withServer(
      async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/admin/sim/status`);

        expect(response.status).toBe(200);
        const payload = (await response.json()) as SimControllerResponse;
        expect(payload.accepted).toBe(true);
        expect(payload.current_status).toBe("stopped");
        expect(payload.runtime_state.heartbeat_stale).toBe(false);
      },
      {
        serverConfig: { adminSimControlEnabled: true },
        simController: new InMemorySimController()
      }
    );
  });

  it("serves simulator dashboard SPA routes and assets from the backend host", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-web-dist-"));
    const webDist = path.join(repoRoot, "apps", "web", "dist");
    const assetDir = path.join(webDist, "assets");
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(
      path.join(webDist, "index.html"),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/dashboard.js"></script></body></html>',
      "utf8"
    );
    fs.writeFileSync(path.join(assetDir, "dashboard.js"), "console.log('sim');", "utf8");

    try {
      await withServer(
        async ({ baseUrl }) => {
          for (const route of ["/admin/sim", "/sim/control"]) {
            const response = await fetch(`${baseUrl}${route}`);
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("text/html");
            expect(await response.text()).toContain('<div id="root"></div>');
          }

          const asset = await fetch(`${baseUrl}/assets/dashboard.js`);
          expect(asset.status).toBe(200);
          expect(asset.headers.get("content-type")).toContain("text/javascript");
          expect(await asset.text()).toContain("console.log('sim');");
        },
        { serverConfig: { repoRoot } }
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("supports simulator start, duplicate start rejection, pause, continue, stop, and run-once", async () => {
    const simController = new InMemorySimController();
    await withServer(
      async ({ baseUrl }) => {
        const headers = {
          "Content-Type": "application/json",
          "x-admin-confirm": "CLEAR_TICHU_DB"
        };
        const start = await fetch(`${baseUrl}/api/admin/sim/start`, {
          method: "POST",
          headers,
          body: JSON.stringify({ worker_count: 2, games_per_batch: 3 })
        });
        expect(start.status).toBe(200);
        const startPayload = (await start.json()) as SimControllerResponse;
        expect(startPayload.current_status).toBe("running");
        expect(startPayload.runtime_state.worker_count).toBe(2);
        expect(startPayload.runtime_state.workers).toHaveLength(2);

        const duplicate = await fetch(`${baseUrl}/api/admin/sim/start`, {
          method: "POST",
          headers,
          body: JSON.stringify({ worker_count: 1 })
        });
        expect(duplicate.status).toBe(409);

        const pause = await fetch(`${baseUrl}/api/admin/sim/pause`, {
          method: "POST",
          headers,
          body: JSON.stringify({})
        });
        expect(pause.status).toBe(200);
        expect(((await pause.json()) as SimControllerResponse).current_status).toBe(
          "paused"
        );

        const resume = await fetch(`${baseUrl}/api/admin/sim/continue`, {
          method: "POST",
          headers,
          body: JSON.stringify({})
        });
        expect(resume.status).toBe(200);
        expect(((await resume.json()) as SimControllerResponse).current_status).toBe(
          "running"
        );

        const stop = await fetch(`${baseUrl}/api/admin/sim/stop`, {
          method: "POST",
          headers,
          body: JSON.stringify({})
        });
        expect(stop.status).toBe(200);
        expect(((await stop.json()) as SimControllerResponse).current_status).toBe(
          "stopped"
        );

        const runOnce = await fetch(`${baseUrl}/api/admin/sim/run-once`, {
          method: "POST",
          headers,
          body: JSON.stringify({ games: 1 })
        });
        expect(runOnce.status).toBe(200);
        const runOncePayload = (await runOnce.json()) as SimControllerResponse;
        expect(runOncePayload.current_status).toBe("completed");
        expect(runOncePayload.runtime_state.total_games_completed).toBe(1);
      },
      {
        serverConfig: { adminSimControlEnabled: true },
        simController
      }
    );
  });

  it("recovers a stale simulator singleton lock during status checks", async () => {
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-sim-"));
    const staleState = createSimState("running");
    staleState.last_heartbeat = "2020-01-01T00:00:00.000Z";
    staleState.runtime_path = path.join(runtimeDir, "state.json");
    staleState.lock_path = path.join(runtimeDir, "controller.lock");
    staleState.pause_path = path.join(runtimeDir, "pause");
    staleState.stop_path = path.join(runtimeDir, "stop");
    staleState.log_path = path.join(runtimeDir, "controller.ndjson");
    fs.writeFileSync(staleState.runtime_path, JSON.stringify(staleState), "utf8");
    fs.writeFileSync(staleState.lock_path, "stale", "utf8");

    const service = new FileSimControllerService({
      ...TEST_SERVER_CONFIG,
      adminSimControlEnabled: true,
      simControllerRuntimeDir: runtimeDir
    });
    const response = await service.status();

    expect(response.accepted).toBe(true);
    expect(response.runtime_state.heartbeat_stale).toBe(true);
    expect(response.warnings).toContain(
      "Recovered stale simulator lock after heartbeat timeout."
    );
    expect(fs.existsSync(staleState.lock_path)).toBe(false);
  });

  it("normalizes duplicate worker rows and clears workers on stop", async () => {
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-sim-"));
    try {
      const runningState = createSimState("running");
      runningState.runtime_path = path.join(runtimeDir, "state.json");
      runningState.lock_path = path.join(runtimeDir, "controller.lock");
      runningState.pause_path = path.join(runtimeDir, "pause");
      runningState.stop_path = path.join(runtimeDir, "stop");
      runningState.log_path = path.join(runtimeDir, "controller.ndjson");
      runningState.workers = [
        {
          worker_id: "worker-01",
          status: "running",
          pid: null,
          current_batch_started_at: runningState.started_at,
          total_batches_completed: 1,
          total_games_completed: 2,
          last_heartbeat: runningState.last_heartbeat,
          last_error: null
        },
        {
          worker_id: "worker-01",
          status: "running",
          pid: null,
          current_batch_started_at: runningState.started_at,
          total_batches_completed: 1,
          total_games_completed: 2,
          last_heartbeat: runningState.last_heartbeat,
          last_error: null
        }
      ];
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(
        runningState.runtime_path,
        JSON.stringify(runningState),
        "utf8"
      );

      const service = new FileSimControllerService({
        ...TEST_SERVER_CONFIG,
        adminSimControlEnabled: true,
        simControllerRuntimeDir: runtimeDir
      });
      const status = await service.status();
      expect(status.runtime_state.workers).toHaveLength(1);

      const stopped = await service.stop();
      expect(stopped.current_status).toBe("stopped");
      expect(stopped.runtime_state.workers).toHaveLength(0);
      expect(stopped.runtime_state.worker_count).toBe(0);
    } finally {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
  });
});
