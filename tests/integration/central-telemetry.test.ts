import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildGameplayDecisionTelemetry,
  buildSelfPlayDecisionTelemetry,
  buildTelemetryDecisionPayloads,
  emitTelemetryDecision,
  TelemetryError
} from "@tichuml/telemetry";
import {
  validateTelemetryDecisionPayload,
  type JsonObject,
  type TelemetryDecisionPayload
} from "@tichuml/shared";
import {
  resolveDecision,
  runSelfPlayBatch
} from "../../apps/sim-runner/src/self-play-batch";
import { emitDecisionTelemetry } from "../../apps/web/src/backend/telemetry";
import type { BackendRuntimeSettings } from "@tichuml/shared";
import type {
  EngineAction,
  EngineResult,
  LegalActionMap
} from "@tichuml/engine";
import { createInitialGameState } from "@tichuml/engine";

const PASS_ACTION = {
  type: "pass_turn",
  seat: "seat-0"
} as EngineAction;

const STATE_RAW = {
  phase: "play",
  activeSeat: "seat-0",
  currentWish: null,
  currentTrick: null,
  seed: "central-telemetry-test"
} as JsonObject;

const STATE_NORM = {
  phase: "play"
} as JsonObject;

const LEGAL_ACTIONS = [PASS_ACTION as unknown as JsonObject];

const WEB_SETTINGS: BackendRuntimeSettings = {
  decisionMode: "server_heuristic",
  backendBaseUrl: "http://localhost:4310",
  serverFallbackEnabled: true,
  telemetryEnabled: true
};

function buildDecisionPayloads() {
  return buildTelemetryDecisionPayloads({
    source: "gameplay",
    mode: "full",
    gameId: "game-central",
    handId: "hand-central",
    phase: "play",
    actorSeat: "seat-0",
    decisionIndex: 1,
    stateRaw: STATE_RAW,
    stateNorm: STATE_NORM,
    legalActions: LEGAL_ACTIONS,
    chosenAction: PASS_ACTION as unknown as JsonObject,
    policyName: "test-policy",
    policySource: "local_heuristic",
    requestedProvider: "local",
    providerUsed: "local_heuristic",
    fallbackUsed: false,
    explanation: {
      candidateScores: [],
      stateFeatures: {
        hand_size: 3
      }
    },
    metadata: {
      test: true
    }
  });
}

describe("central telemetry subsystem", () => {
  it("builds validator-compatible minimal and full decision payloads centrally", () => {
    const payloads = buildDecisionPayloads();

    expect(validateTelemetryDecisionPayload(payloads.full)).toMatchObject({
      ok: true
    });
    expect(validateTelemetryDecisionPayload(payloads.minimal)).toMatchObject({
      ok: true
    });
    expect(payloads.full.state_raw.phase).toBe("play");
    expect(payloads.minimal.state_raw).toEqual({});
    expect(payloads.full.metadata.source).toBe("gameplay");
    expect(payloads.minimal.metadata.source).toBe("gameplay");
  });

  it("suppresses transport failures by default and surfaces them in strict mode", async () => {
    const payloads = buildDecisionPayloads();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      emitTelemetryDecision({
        telemetry: {
          enabled: true,
          strictTelemetry: false,
          backendBaseUrl: "http://127.0.0.1:43198",
          source: "gameplay",
          mode: "minimal"
        },
        payloads,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      failure_kind: "network_failure"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    await expect(
      emitTelemetryDecision({
        telemetry: {
          enabled: true,
          strictTelemetry: true,
          backendBaseUrl: "http://127.0.0.1:43198",
          source: "gameplay",
          mode: "minimal"
        },
        payloads,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(TelemetryError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("backs off repeated telemetry transport failures without another POST attempt", async () => {
    const payloads = buildDecisionPayloads();
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect timeout");
    });
    const telemetry = {
      enabled: true,
      strictTelemetry: false,
      backendBaseUrl: "http://127.0.0.1:43199",
      source: "selfplay" as const,
      mode: "minimal" as const,
      retryAttempts: 1,
      retryDelayMs: 1,
      backoffMs: 30_000
    };

    const first = await emitTelemetryDecision({
      telemetry,
      payloads,
      fetchImpl
    });
    const second = await emitTelemetryDecision({
      telemetry,
      payloads,
      fetchImpl
    });

    expect(first).toMatchObject({
      ok: false,
      failure_kind: "network_failure"
    });
    expect(second).toMatchObject({
      ok: false,
      failure_kind: "backoff_suppressed",
      cause: "transport_backoff"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("downgrades oversized full payloads and skips centrally when minimal is also too large", async () => {
    const payloads = buildDecisionPayloads();
    const hugePayloads = {
      full: {
        ...payloads.full,
        metadata: {
          ...payloads.full.metadata,
          huge: "x".repeat(20_000)
        }
      } as TelemetryDecisionPayload,
      minimal: payloads.minimal
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      async text() {
        return JSON.stringify({ accepted: true, telemetry_id: 7 });
      }
    })) as unknown as typeof fetch;

    const downgraded = await emitTelemetryDecision({
      telemetry: {
        enabled: true,
        strictTelemetry: false,
        backendBaseUrl: "http://localhost:4310",
        source: "gameplay",
        mode: "full",
        maxBytes: 10_000
      },
      payloads: hugePayloads,
      fetchImpl
    });
    expect(downgraded).toMatchObject({ ok: true, outcome: "downgraded" });
    const postedBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(postedBody.state_raw).toEqual({});

    const skipped = await emitTelemetryDecision({
      telemetry: {
        enabled: true,
        strictTelemetry: false,
        backendBaseUrl: "http://localhost:4310",
        source: "gameplay",
        mode: "minimal",
        maxBytes: 1
      },
      payloads,
      fetchImpl
    });
    expect(skipped).toMatchObject({
      ok: false,
      failure_kind: "oversize_skipped",
      cause: "local_oversize_guard"
    });
  });

  it("applies distinct source tags for gameplay and selfplay adapters", () => {
    const gameplay = buildGameplayDecisionTelemetry({
      action: PASS_ACTION,
      phase: "play",
      gameId: "game-source",
      handId: "hand-source",
      decisionIndex: 1,
      stateRaw: STATE_RAW as unknown as EngineResult["nextState"],
      stateNorm: STATE_NORM as unknown as EngineResult["derivedView"],
      legalActions: {
        "seat-0": [PASS_ACTION]
      } as unknown as EngineResult["legalActions"],
      policyName: "test-policy",
      policySource: "human_ui",
      decisionMode: "server_heuristic"
    });
    const selfplay = buildSelfPlayDecisionTelemetry({
      mode: "minimal",
      gameId: "game-source",
      handId: "hand-source",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 1,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [PASS_ACTION]
      } as unknown as LegalActionMap,
      chosenAction: PASS_ACTION,
      policyName: "test-policy",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false,
      latencyMs: 1
    });

    expect(gameplay.full.metadata.source).toBe("gameplay");
    expect(selfplay.minimal.metadata.source).toBe("selfplay");
  });

  it("does not let gameplay telemetry failure reject the UI decision flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );

    await expect(
      emitDecisionTelemetry({
        settings: WEB_SETTINGS,
        action: PASS_ACTION,
        phase: "play",
        gameId: "game-web",
        handId: "hand-web",
        decisionIndex: 1,
        stateRaw: STATE_RAW as unknown as EngineResult["nextState"],
        stateNorm: STATE_NORM as unknown as EngineResult["derivedView"],
        legalActions: {
          "seat-0": [PASS_ACTION]
        } as unknown as EngineResult["legalActions"],
        policyName: "test-policy",
        policySource: "human_ui"
      })
    ).resolves.toMatchObject({
      kind: "decision",
      telemetryId: null
    });
  });

  it("keeps selfplay decisions and controller batches moving when telemetry cannot post", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("backend unavailable");
      })
    );

    const initial = createInitialGameState("central-telemetry-decision");
    const decision = await resolveDecision({
      backendBaseUrl: "http://127.0.0.1:1",
      telemetryEnabled: true,
      strictTelemetry: false,
      telemetryMode: "minimal",
      telemetryMaxBytes: 1,
      quiet: true,
      controllerMode: true,
      workerId: "worker-test",
      gameId: "game-selfplay",
      handId: "hand-selfplay",
      actor: "seat-0",
      decisionIndex: 1,
      stateRaw: initial.nextState as unknown as JsonObject,
      stateNorm: initial.derivedView as unknown as JsonObject,
      legalActions: initial.legalActions,
      phase: initial.nextState.phase,
      defaultProvider: "local"
    });

    expect(typeof decision.chosenAction.type).toBe("string");
    expect(
      decision.telemetryFailureStats.telemetryFailuresTotal
    ).toBeGreaterThan(0);

    const summary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "central-telemetry-failure",
      defaultProvider: "local",
      telemetryEnabled: true,
      strictTelemetry: false,
      telemetryMode: "minimal",
      telemetryMaxBytes: 1,
      backendBaseUrl: "http://127.0.0.1:1",
      quiet: true,
      progress: false,
      controllerMode: true,
      workerId: "worker-test",
      maxDecisionsPerGame: 1
    });

    expect(summary.errors).toBe(1);
  });

  it("keeps old producer modules thin instead of owning duplicate builders", () => {
    const root = process.cwd();
    const webTelemetry = fs.readFileSync(
      path.join(root, "apps", "web", "src", "backend", "telemetry.ts"),
      "utf8"
    );
    const selfPlay = fs.readFileSync(
      path.join(root, "apps", "sim-runner", "src", "self-play-batch.ts"),
      "utf8"
    );

    expect(webTelemetry).not.toContain("function buildDecisionPayload");
    expect(webTelemetry).not.toContain("function buildEventPayload");
    expect(selfPlay).not.toContain("function buildLocalDecisionTelemetry");
    expect(selfPlay).toContain("buildSelfPlayDecisionTelemetry");
    expect(selfPlay).toContain("emitTelemetryDecision");
  });
});
