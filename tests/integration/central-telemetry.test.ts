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

const SELECT_PASS_TEMPLATE = {
  type: "select_pass",
  seat: "seat-0",
  availableCardIds: ["star-2", "jade-3", "sword-4", "pagoda-5"],
  requiredTargets: ["left", "partner", "right"]
} as JsonObject;

const SELECT_PASS_ACTION = {
  type: "select_pass",
  seat: "seat-0",
  left: "star-2",
  partner: "jade-3",
  right: "sword-4"
} as JsonObject;

const COMPACT_PLAY_ACTION = {
  type: "play_cards",
  seat: "seat-0",
  cardIds: ["red-5", "jade-5"],
  combination: {
    kind: "pair",
    primaryRank: 5,
    cardCount: 2,
    isBomb: false
  }
} as JsonObject;

const RAW_PLAY_ACTION = {
  type: "play_cards",
  seat: "seat-0",
  cardIds: ["jade-5", "red-5"],
  combination: {
    kind: "pair",
    primaryRank: 5,
    cardCount: 2,
    isBomb: false,
    actualRanks: [5, 5],
    cards: ["jade-5", "red-5"]
  }
} as unknown as EngineAction;

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

function buildSelectPassPayload(
  chosenAction: JsonObject = SELECT_PASS_ACTION
): TelemetryDecisionPayload {
  return {
    ts: new Date().toISOString(),
    game_id: "game-select-pass",
    hand_id: "hand-select-pass",
    phase: "pass_select",
    actor_seat: "seat-0",
    decision_index: 1,
    schema_version: 2,
    engine_version: "test-engine",
    sim_version: "test-sim",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    policy_name: "test-policy",
    policy_source: "local_heuristic",
    state_raw: {
      phase: "pass_select",
      activeSeat: "seat-0"
    },
    state_norm: {
      phase: "pass_select"
    },
    legal_actions: {
      "seat-0": [SELECT_PASS_TEMPLATE]
    },
    chosen_action: chosenAction,
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
    metadata: {
      source: "selfplay",
      telemetry_mode: "minimal"
    },
    antipattern_tags: []
  };
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

  it("selects chosen_action from the same actor legal_actions snapshot", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "gameplay",
      mode: "full",
      gameId: "game-canonical-action",
      handId: "hand-canonical-action",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 2,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [COMPACT_PLAY_ACTION]
      },
      chosenAction: RAW_PLAY_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false
    });
    const fullLegalActions = (payloads.full.legal_actions as JsonObject)[
      "seat-0"
    ] as JsonObject[];
    const minimalLegalActions = payloads.minimal.legal_actions as JsonObject[];

    expect(payloads.full.chosen_action).toEqual(COMPACT_PLAY_ACTION);
    expect(payloads.full.chosen_action).toEqual(fullLegalActions[0]);
    expect(payloads.minimal.chosen_action).toEqual(minimalLegalActions[0]);
    expect(validateTelemetryDecisionPayload(payloads.full)).toMatchObject({
      ok: true
    });
    expect(validateTelemetryDecisionPayload(payloads.minimal)).toMatchObject({
      ok: true
    });
  });

  it("accepts valid select_pass chosen_action against template legal actions", () => {
    const result = validateTelemetryDecisionPayload(buildSelectPassPayload());

    expect(result).toMatchObject({ ok: true });
  });

  it("rejects select_pass choices that use cards outside the template constraints", () => {
    const invalid = validateTelemetryDecisionPayload(
      buildSelectPassPayload({
        ...SELECT_PASS_ACTION,
        right: "phoenix"
      })
    );

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(JSON.stringify(invalid.issues)).toContain(
        "chosen_action must match one of actor_seat's legal_actions"
      );
    }
  });

  it("rejects select_pass choices with duplicate cards or missing required targets", () => {
    const duplicate = validateTelemetryDecisionPayload(
      buildSelectPassPayload({
        ...SELECT_PASS_ACTION,
        partner: "star-2"
      })
    );
    const missingTarget = validateTelemetryDecisionPayload(
      buildSelectPassPayload({
        type: "select_pass",
        seat: "seat-0",
        left: "star-2",
        partner: "jade-3"
      })
    );

    expect(duplicate.ok).toBe(false);
    expect(missingTarget.ok).toBe(false);
    if (!duplicate.ok) {
      expect(JSON.stringify(duplicate.issues)).toContain(
        "chosen_action must match one of actor_seat's legal_actions"
      );
    }
    if (!missingTarget.ok) {
      expect(JSON.stringify(missingTarget.issues)).toContain(
        "chosen_action must match one of actor_seat's legal_actions"
      );
    }
  });

  it("keeps fallback chosen_action schema identical to legal_actions", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "minimal",
      gameId: "game-fallback-canonical-action",
      handId: "hand-fallback-canonical-action",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 3,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [COMPACT_PLAY_ACTION]
      },
      chosenAction: RAW_PLAY_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "server_heuristic",
      providerUsed: "local_heuristic",
      fallbackUsed: true
    });

    expect(payloads.minimal.fallback_used).toBe(true);
    expect(payloads.minimal.chosen_action).toEqual(
      (payloads.minimal.legal_actions as JsonObject[])[0]
    );
    expect(validateTelemetryDecisionPayload(payloads.minimal)).toMatchObject({
      ok: true
    });
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

  it("logs full chosen_action mismatch diagnostics before posting", async () => {
    const payloads = buildDecisionPayloads();
    const invalidPayloads = {
      full: {
        ...payloads.full,
        chosen_action: {
          type: "pass_turn",
          seat: "seat-1"
        }
      } as TelemetryDecisionPayload,
      minimal: {
        ...payloads.minimal,
        chosen_action: {
          type: "pass_turn",
          seat: "seat-1"
        }
      } as TelemetryDecisionPayload
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      async text() {
        return JSON.stringify({ accepted: true, telemetry_id: 9 });
      }
    })) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let diagnostic: JsonObject | null = null;

    try {
      await expect(
        emitTelemetryDecision({
          telemetry: {
            enabled: true,
            strictTelemetry: false,
            backendBaseUrl: "http://localhost:4310",
            source: "gameplay",
            mode: "minimal"
          },
          payloads: invalidPayloads,
          fetchImpl
        })
      ).resolves.toMatchObject({
        ok: false,
        failure_kind: "client_validation"
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      diagnostic = JSON.parse(
        String(errorSpy.mock.calls[0]?.[0])
      ) as JsonObject;
    } finally {
      errorSpy.mockRestore();
    }

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(diagnostic).toMatchObject({
      event: "telemetry_chosen_action_mismatch",
      request_kind: "telemetry_decision",
      failure_kind: "client_validation",
      state_identifiers: {
        game_id: "game-central",
        hand_id: "hand-central",
        actor_seat: "seat-0",
        decision_index: 1
      },
      chosen_action: {
        type: "pass_turn",
        seat: "seat-1"
      }
    });
    expect(diagnostic.legal_actions).toEqual(payloads.minimal.legal_actions);
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

  it("normalizes gameplay and selfplay play-card actions through the shared path", () => {
    const gameplay = buildGameplayDecisionTelemetry({
      action: RAW_PLAY_ACTION,
      phase: "play",
      gameId: "game-play-shape",
      handId: "hand-play-shape",
      decisionIndex: 1,
      stateRaw: STATE_RAW as unknown as EngineResult["nextState"],
      stateNorm: STATE_NORM as unknown as EngineResult["derivedView"],
      legalActions: {
        "seat-0": [RAW_PLAY_ACTION]
      } as unknown as EngineResult["legalActions"],
      policyName: "test-policy",
      policySource: "human_ui",
      decisionMode: "server_heuristic"
    });
    const selfplay = buildSelfPlayDecisionTelemetry({
      mode: "minimal",
      gameId: "game-play-shape",
      handId: "hand-play-shape",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 1,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [RAW_PLAY_ACTION]
      } as unknown as LegalActionMap,
      chosenAction: RAW_PLAY_ACTION,
      policyName: "test-policy",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false,
      latencyMs: 1
    });

    const gameplayActions = (gameplay.full.legal_actions as JsonObject)[
      "seat-0"
    ] as JsonObject[];

    expect(gameplay.full.chosen_action).toEqual(gameplayActions[0]);
    expect(selfplay.minimal.chosen_action).toEqual(
      (selfplay.minimal.legal_actions as JsonObject[])[0]
    );
    expect(gameplay.full.chosen_action).toEqual(selfplay.minimal.chosen_action);
    expect(validateTelemetryDecisionPayload(gameplay.full)).toMatchObject({
      ok: true
    });
    expect(validateTelemetryDecisionPayload(selfplay.minimal)).toMatchObject({
      ok: true
    });
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

  it("runs a bounded local telemetry-enabled sim without select_pass mismatch spam", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: url.endsWith("/health") ? 200 : 201,
        async text() {
          return JSON.stringify(
            url.endsWith("/health")
              ? { ok: true }
              : { accepted: true, telemetry_id: 1 }
          );
        }
      };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      const summary = await runSelfPlayBatch({
        games: 1,
        baseSeed: "select-pass-telemetry-ok",
        defaultProvider: "local",
        telemetryEnabled: true,
        strictTelemetry: false,
        telemetryMode: "minimal",
        backendBaseUrl: "http://127.0.0.1:4310",
        quiet: true,
        progress: false,
        maxDecisionsPerGame: 5
      });

      expect(summary.errors).toBe(1);
      expect(summary.telemetryFailuresTotal).toBe(0);
      expect(
        errorSpy.mock.calls.some((call) =>
          String(call[0]).includes("telemetry_chosen_action_mismatch")
        )
      ).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not let async telemetry failures stall local selfplay throughput", async () => {
    const fetchMock = vi.fn(
      async () =>
        await new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("slow telemetry failure")), 300)
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const startedAt = Date.now();
    const summary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "async-telemetry-failure",
      defaultProvider: "local",
      telemetryEnabled: true,
      strictTelemetry: false,
      telemetryMode: "minimal",
      backendBaseUrl: "http://127.0.0.1:4310",
      telemetryRetryAttempts: 0,
      quiet: true,
      progress: false,
      maxDecisionsPerGame: 3
    });
    const elapsedMs = Date.now() - startedAt;

    expect(summary.errors).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
    expect(elapsedMs).toBeLessThan(1_500);
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
