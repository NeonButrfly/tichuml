import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "@tichuml/shared";
import {
  buildTelemetryDecisionPayloads,
  emitTelemetryDecision
} from "@tichuml/telemetry";
import {
  AsyncTelemetryManager,
  replayPersistedTelemetry
} from "../../apps/sim-runner/src/telemetry/async-telemetry";
import { runSelfPlayBatch } from "../../apps/sim-runner/src/self-play-batch";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fsp.rm(root, { recursive: true, force: true })
    )
  );
});

async function createTempDir(): Promise<string> {
  const root = await fsp.mkdtemp(
    path.join(os.tmpdir(), "tichuml-telemetry-runtime-")
  );
  tempRoots.push(root);
  return root;
}

function runReplayCli(
  args: string[],
  timeoutMs: number
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(
          process.cwd(),
          "apps",
          "sim-runner",
          "src",
          "telemetry",
          "replay.ts"
        ),
        ...args
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "0"
        }
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `replay CLI timed out after ${timeoutMs}ms.\nstdout=${stdout}\nstderr=${stderr}`
        )
      );
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function buildDecisionPayloads() {
  const passAction = {
    type: "pass_turn",
    seat: "seat-0"
  } as JsonObject;
  return buildTelemetryDecisionPayloads({
    source: "selfplay",
    mode: "minimal",
    gameId: "game-telemetry",
    handId: "hand-1",
    phase: "play",
    actorSeat: "seat-0",
    decisionIndex: 1,
    stateRaw: {
      phase: "play",
      activeSeat: "seat-0"
    } as JsonObject,
    stateNorm: {
      phase: "play"
    } as JsonObject,
    legalActions: [passAction],
    chosenAction: passAction,
    policyName: "test-policy",
    policySource: "local_heuristic",
    requestedProvider: "local",
    providerUsed: "local_heuristic",
    fallbackUsed: false,
    metadata: {
      test: true
    }
  });
}

describe("async telemetry pipeline resilience", () => {
  it("classifies aborted telemetry requests as timeouts and respects timeoutMs", async () => {
    const payloads = buildDecisionPayloads();
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(
                init.signal?.reason ??
                  new DOMException("This operation was aborted", "AbortError")
              );
            },
            { once: true }
          );
        })
    );

    const startedAt = Date.now();
    const result = await emitTelemetryDecision({
      telemetry: {
        enabled: true,
        strictTelemetry: false,
        backendBaseUrl: "http://127.0.0.1:44101",
        source: "selfplay",
        mode: "minimal",
        timeoutMs: 50,
        retryAttempts: 1,
        retryDelayMs: 1,
        backoffMs: 10
      },
      payloads,
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: false,
      failure_kind: "timeout"
    });
    expect(Date.now() - startedAt).toBeLessThan(300);
  });

  it("classifies backend 500 responses as backend_error", async () => {
    const payloads = buildDecisionPayloads();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accepted: false,
          error: "telemetry insert failed",
          code: "telemetry_insert_failed"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const result = await emitTelemetryDecision({
      telemetry: {
        enabled: true,
        strictTelemetry: false,
        backendBaseUrl: "http://127.0.0.1:44102",
        source: "selfplay",
        mode: "minimal"
      },
      payloads,
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: false,
      failure_kind: "backend_error",
      status: 500
    });
  });

  it("persists failed and backoff-suppressed telemetry locally, then replays it", async () => {
    const root = await createTempDir();
    const pendingDir = path.join(root, "pending");
    const replayedDir = path.join(root, "replayed");
    const payloads = buildDecisionPayloads();
    const backendBaseUrl = "http://127.0.0.1:44103";

    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const manager = new AsyncTelemetryManager({
      enabled: true,
      storageRoot: root,
      quiet: true,
      maxConcurrency: 1
    });
    const telemetry = {
      enabled: true,
      strictTelemetry: false,
      backendBaseUrl,
      source: "selfplay" as const,
      mode: "minimal" as const,
      timeoutMs: 50,
      retryAttempts: 1,
      retryDelayMs: 1,
      backoffMs: 100
    };

    await manager.enqueueDecision({
      telemetry,
      payloads,
      context: { phase: "play" },
      strictTelemetry: false
    });
    await manager.enqueueDecision({
      telemetry,
      payloads,
      context: { phase: "play", replay: true },
      strictTelemetry: false
    });
    await manager.flush(500);

    const snapshot = manager.snapshot();
    const pendingFiles = (await fsp.readdir(pendingDir)).filter((entry) =>
      entry.endsWith(".ndjson")
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.runtimeState.status).toBe("backoff");
    expect(snapshot.runtimeState.pending_count).toBe(2);
    expect(snapshot.runtimeState.failed_count).toBe(2);
    expect(pendingFiles).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const replayFetch = vi.fn(async () =>
      new Response(JSON.stringify({ accepted: true, event_id: "replayed-1" }), {
        status: 202,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", replayFetch);

    const replay = await replayPersistedTelemetry({
      storageRoot: root,
      quiet: true
    });

    const pendingAfterReplay = (await fsp.readdir(pendingDir)).filter((entry) =>
      entry.endsWith(".ndjson")
    );
    const replayedFiles = (await fsp.readdir(replayedDir)).filter((entry) =>
      entry.endsWith(".ndjson")
    );

    expect(replay).toMatchObject({
      scanned_files: 2,
      replayed_files: 2,
      failed_files: 0
    });
    expect(replayFetch).toHaveBeenCalledTimes(2);
    expect(pendingAfterReplay).toHaveLength(0);
    expect(replayedFiles).toHaveLength(2);
  });

  it("quarantines provably non-replayable loopback port-one telemetry", async () => {
    const root = await createTempDir();
    const pendingDir = path.join(root, "pending");
    const quarantinedDir = path.join(root, "quarantined");
    const payloads = buildDecisionPayloads();
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const manager = new AsyncTelemetryManager({
      enabled: true,
      storageRoot: root,
      quiet: true,
      maxConcurrency: 1
    });
    await manager.enqueueDecision({
      telemetry: {
        enabled: true,
        strictTelemetry: false,
        backendBaseUrl: "http://127.0.0.1:1",
        source: "selfplay",
        mode: "minimal"
      },
      payloads,
      context: { phase: "play" },
      strictTelemetry: false
    });
    await manager.flush(500);

    expect(
      (await fsp.readdir(pendingDir)).filter((entry) => entry.endsWith(".ndjson"))
    ).toHaveLength(1);

    fetchMock.mockClear();
    const replay = await replayPersistedTelemetry({
      storageRoot: root,
      quiet: true
    });

    expect(replay).toMatchObject({
      scanned_files: 1,
      replayed_files: 0,
      failed_files: 0,
      quarantined_files: 1,
      quarantined_records: 1
    });
    expect(replay.quarantine_reasons.loopback_port_one).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (await fsp.readdir(pendingDir)).filter((entry) => entry.endsWith(".ndjson"))
    ).toHaveLength(0);
    expect(
      (await fsp.readdir(quarantinedDir)).filter((entry) => entry.endsWith(".ndjson"))
    ).toHaveLength(1);
  });

  it("quarantines records with invalid persisted endpoints", async () => {
    const root = await createTempDir();
    const pendingDir = path.join(root, "pending");
    const quarantinedDir = path.join(root, "quarantined");
    await fsp.mkdir(pendingDir, { recursive: true });
    await fsp.writeFile(
      path.join(pendingDir, "invalid-endpoint.ndjson"),
      `${JSON.stringify({
        schema_version: 1,
        saved_at: new Date().toISOString(),
        item_id: "invalid-endpoint-1",
        request_kind: "telemetry_event",
        endpoint: "-TimeoutSeconds/api/telemetry/event",
        failure_kind: "network_failure",
        failure_message: "bad endpoint",
        strict_telemetry: false,
        telemetry: {
          enabled: true,
          strictTelemetry: false,
          backendBaseUrl: "-TimeoutSeconds",
          source: "selfplay",
          mode: "minimal"
        },
        payloads: {
          full: {
            ts: new Date().toISOString(),
            game_id: "invalid-endpoint-game",
            hand_id: "hand-1",
            phase: "play",
            event_type: "hand_started",
            actor_seat: null,
            event_index: 0,
            schema_version: 2,
            engine_version: "milestone-1",
            sim_version: "milestone-2",
            requested_provider: "system_local",
            provider_used: "system_local",
            fallback_used: false,
            metadata: {},
            state_norm: null,
            payload: { event_type: "hand_started" }
          },
          minimal: {
            ts: new Date().toISOString(),
            game_id: "invalid-endpoint-game",
            hand_id: "hand-1",
            phase: "play",
            event_type: "hand_started",
            actor_seat: null,
            event_index: 0,
            schema_version: 2,
            engine_version: "milestone-1",
            sim_version: "milestone-2",
            requested_provider: "system_local",
            provider_used: "system_local",
            fallback_used: false,
            metadata: {},
            state_norm: null,
            payload: { event_type: "hand_started" }
          }
        },
        context: { game_id: "invalid-endpoint-game", hand_id: "hand-1" }
      })}\n`,
      "utf8"
    );

    const replay = await replayPersistedTelemetry({
      storageRoot: root,
      quiet: true
    });

    expect(replay).toMatchObject({
      scanned_files: 1,
      replayed_files: 0,
      failed_files: 0,
      quarantined_files: 1,
      quarantined_records: 1
    });
    expect(replay.quarantine_reasons.invalid_backend_base_url).toBe(1);
    expect(
      (await fsp.readdir(pendingDir)).filter((entry) => entry.endsWith(".ndjson"))
    ).toHaveLength(0);
    expect(
      (await fsp.readdir(quarantinedDir)).filter((entry) => entry.endsWith(".ndjson"))
    ).toHaveLength(1);
  });

  it("keeps self-play running and spools telemetry locally when the backend is down", async () => {
    const root = await createTempDir();
    const pendingDir = path.join(root, "pending");
    const fetchMock = vi.fn(async () => {
      throw new Error("backend offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    let runtimeState = null as Awaited<
      ReturnType<AsyncTelemetryManager["snapshot"]>
    >["runtimeState"] | null;

    const summary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "telemetry-offline-selfplay",
      defaultProvider: "local",
      telemetryEnabled: true,
      strictTelemetry: false,
      telemetryMode: "minimal",
      backendBaseUrl: "http://127.0.0.1:44104",
      telemetryStorageRoot: root,
      quiet: true,
      progress: false,
      maxDecisionsPerGame: 3,
      onTelemetryRuntimeState: (state) => {
        runtimeState = state;
      }
    });

    const pendingFiles = fs.existsSync(pendingDir)
      ? (await fsp.readdir(pendingDir)).filter((entry) =>
          entry.endsWith(".ndjson")
        )
      : [];

    expect(runtimeState).not.toBeNull();
    expect(runtimeState?.pending_count ?? 0).toBeGreaterThan(0);
    expect(pendingFiles.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
    expect(summary.errors).toBeGreaterThanOrEqual(0);
  });

  it("reports live pending separately from persisted backlog files", async () => {
    const root = await createTempDir();
    const pendingDir = path.join(root, "pending");
    await fsp.mkdir(pendingDir, { recursive: true });
    await fsp.writeFile(
      path.join(pendingDir, "persisted-backlog.ndjson"),
      "{\"saved\":true}\n",
      "utf8"
    );

    const manager = new AsyncTelemetryManager({
      enabled: true,
      storageRoot: root,
      quiet: true,
      maxConcurrency: 1
    });

    const snapshot = manager.snapshot();

    expect(snapshot.runtimeState.pending_count).toBe(0);
    expect(snapshot.runtimeState.persisted_pending_file_count).toBe(1);
  });

  it(
    "runs the replay CLI through tsx and prints a replay summary",
    async () => {
      const replaySource = fs.readFileSync(
        path.join(
          process.cwd(),
          "apps",
          "sim-runner",
          "src",
          "telemetry",
          "replay.ts"
        ),
        "utf8"
      );
      expect(replaySource).toContain("main().catch");
      expect(replaySource).not.toContain("import.meta.main");

      const root = await createTempDir();
      const pendingDir = path.join(root, "pending");
      const replayedDir = path.join(root, "replayed");
      const server = http.createServer((request, response) => {
        if (request.method === "POST") {
          response.writeHead(202, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ accepted: true, telemetry_id: 1 }));
          return;
        }
        response.writeHead(404);
        response.end();
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        throw new Error("Unable to resolve replay test server address.");
      }

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        })
      );

      const manager = new AsyncTelemetryManager({
        enabled: true,
        storageRoot: root,
        quiet: true,
        maxConcurrency: 1
      });
      await manager.enqueueDecision({
        telemetry: {
          enabled: true,
          strictTelemetry: false,
          backendBaseUrl: `http://127.0.0.1:${address.port}`,
          source: "selfplay",
          mode: "minimal"
        },
        payloads: buildDecisionPayloads(),
        context: { phase: "play" },
        strictTelemetry: false
      });
      await manager.flush(500);
      vi.unstubAllGlobals();

      const result = await runReplayCli(["--dir", root], 30_000);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        scanned_files: 1,
        replayed_files: 1,
        failed_files: 0
      });
      expect(
        (await fsp.readdir(pendingDir)).filter((entry) => entry.endsWith(".ndjson"))
      ).toHaveLength(0);
      expect(
        (await fsp.readdir(replayedDir)).filter((entry) => entry.endsWith(".ndjson"))
      ).toHaveLength(1);
    },
    30_000
  );
});
