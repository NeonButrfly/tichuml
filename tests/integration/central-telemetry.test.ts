import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildGameplayDecisionTelemetry,
  buildSelfPlayDecisionTelemetry,
  buildSelfPlayEventTelemetry,
  buildTelemetryDecisionPayloads,
  emitTelemetryDecision,
  TelemetryError
} from "@tichuml/telemetry";
import {
  inferTelemetryFallbackUsed,
  validateTelemetryDecisionPayload,
  type JsonObject,
  type TelemetryDecisionPayload
} from "@tichuml/shared";
import {
  resolveDecision,
  runSelfPlayBatch
} from "../../apps/sim-runner/src/self-play-batch";
import {
  emitDecisionTelemetry,
  emitEventTelemetry
} from "../../apps/web/src/backend/telemetry";
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

const WISH_PLAY_ACTION = {
  type: "play_cards",
  seat: "seat-0",
  cardIds: ["jade-8"],
  combination: {
    kind: "single",
    primaryRank: 8,
    cardCount: 1,
    isBomb: false,
    actualRanks: [8],
    containsMahjong: false
  }
} as JsonObject;

function compactPlayTemplate(config: {
  cardIds: string[];
  primaryRank: number;
  kind?: string;
  phoenixAsRank?: number;
  actualRanks?: number[];
}): JsonObject {
  return {
    type: "play_cards",
    seat: "seat-0",
    cardIds: config.cardIds,
    ...(config.phoenixAsRank !== undefined
      ? { phoenixAsRank: config.phoenixAsRank }
      : {}),
    combination: {
      kind: config.kind ?? "straight",
      primaryRank: config.primaryRank,
      cardCount: config.cardIds.length,
      isBomb: false,
      ...(config.phoenixAsRank !== undefined
        ? { phoenixAsRank: config.phoenixAsRank }
        : {}),
      ...(config.actualRanks ? { actualRanks: config.actualRanks } : {})
    }
  };
}

function buildWishDecision(config: {
  wishedRank: number;
  legalAction: JsonObject;
  chosenAction?: JsonObject;
}) {
  return buildTelemetryDecisionPayloads({
    source: "selfplay",
    mode: "full",
    gameId: "game-wish-combo",
    handId: "hand-wish-combo",
    phase: "trick_play",
    actorSeat: "seat-0",
    decisionIndex: 10,
    stateRaw: {
      ...STATE_RAW,
      phase: "trick_play",
      currentWish: config.wishedRank,
      hands: {
        "seat-0": []
      }
    },
    stateNorm: STATE_NORM,
    legalActions: {
      "seat-0": [config.legalAction]
    },
    chosenAction: config.chosenAction ?? {
      type: "play_cards",
      seat: "seat-0",
      cardIds: config.legalAction.cardIds,
      ...(config.legalAction.phoenixAsRank !== undefined
        ? { phoenixAsRank: config.legalAction.phoenixAsRank }
        : {})
    },
    policyName: "test-policy",
    policySource: "local_heuristic",
    requestedProvider: "local",
    providerUsed: "local_heuristic",
    fallbackUsed: false
  });
}

const MAHJONG_WISH_TEMPLATE = {
  type: "play_cards",
  seat: "seat-0",
  cardIds: ["mahjong"],
  availableWishRanks: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  combination: {
    kind: "single",
    primaryRank: 1,
    cardCount: 1,
    isBomb: false,
    containsMahjong: true
  }
} as JsonObject;

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
    expect(payloads.minimal.chosen_action).toEqual(payloads.full.chosen_action);
    expect(minimalLegalActions[0]).toEqual(payloads.full.chosen_action);
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

  it("preserves Mahjong wishRank and records selected wish strategy metadata", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "full",
      gameId: "game-mahjong-wish",
      handId: "hand-mahjong-wish",
      phase: "trick_play",
      actorSeat: "seat-0",
      decisionIndex: 3,
      stateRaw: {
        ...STATE_RAW,
        phase: "trick_play",
        activeSeat: "seat-0",
        hands: {
          "seat-0": [{ id: "mahjong", kind: "special", special: "mahjong" }]
        }
      },
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [MAHJONG_WISH_TEMPLATE]
      },
      chosenAction: {
        type: "play_cards",
        seat: "seat-0",
        cardIds: ["mahjong"],
        wishRank: 9
      },
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false,
      explanation: {
        selectedMahjongWish: {
          mahjong_played: true,
          mahjong_wish_available: true,
          mahjong_wish_selected: true,
          mahjong_wish_skipped_reason: null,
          wish_reason: "passed_to_left",
          wish_target_seat: "seat-1",
          wish_target_team: "team-b",
          wish_rank_source_card_id: "jade-9",
          wish_rank_source_target: "left",
          wish_considered_tichu_pressure: true,
          wish_considered_grand_tichu_pressure: false
        }
      }
    });

    expect(payloads.full.chosen_action).toMatchObject({
      type: "play_cards",
      cardIds: ["mahjong"],
      wishRank: 9,
      availableWishRanks: MAHJONG_WISH_TEMPLATE.availableWishRanks
    });
    expect(payloads.full.metadata).toMatchObject({
      mahjong_played: true,
      mahjong_wish_available: true,
      mahjong_wish_selected: true,
      mahjong_wish_skipped_reason: null,
      wish_reason: "passed_to_left",
      wish_target_seat: "seat-1",
      wish_rank_source_card_id: "jade-9",
      wish_rank_source_target: "left",
      wish_considered_tichu_pressure: true
    });
  });

  it("records Mahjong available-but-skipped telemetry when no wishRank is chosen", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "full",
      gameId: "game-mahjong-skip",
      handId: "hand-mahjong-skip",
      phase: "trick_play",
      actorSeat: "seat-0",
      decisionIndex: 4,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [MAHJONG_WISH_TEMPLATE]
      },
      chosenAction: {
        type: "play_cards",
        seat: "seat-0",
        cardIds: ["mahjong"]
      },
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false,
      explanation: {
        selectedMahjongWish: {
          mahjong_played: true,
          mahjong_wish_available: true,
          mahjong_wish_selected: false,
          mahjong_wish_skipped_reason: "rules_variant_allows_no_wish",
          wish_reason: "skipped"
        }
      }
    });

    expect(payloads.full.metadata).toMatchObject({
      mahjong_played: true,
      mahjong_wish_available: true,
      mahjong_wish_selected: false,
      mahjong_wish_skipped_reason: "rules_variant_allows_no_wish",
      wish_reason: "skipped"
    });
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

  it("treats local and local_heuristic as provider aliases, not fallback", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "minimal",
      gameId: "game-provider-alias",
      handId: "hand-provider-alias",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 4,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [PASS_ACTION]
      },
      chosenAction: PASS_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false
    });

    expect(payloads.minimal.fallback_used).toBe(false);
    expect(payloads.minimal.metadata).toMatchObject({
      requested_provider_canonical: "local_heuristic",
      provider_used_canonical: "local_heuristic",
      fallback_used: false
    });
    expect(
      inferTelemetryFallbackUsed({
        requestedProvider: "local",
        providerUsed: "local_heuristic"
      })
    ).toBe(false);
  });

  it("still marks an actual backend provider fallback as fallback", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "minimal",
      gameId: "game-real-fallback",
      handId: "hand-real-fallback",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 5,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [PASS_ACTION]
      },
      chosenAction: PASS_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "server_heuristic",
      providerUsed: "local_heuristic",
      fallbackUsed: true
    });

    expect(payloads.minimal.fallback_used).toBe(true);
    expect(payloads.minimal.metadata).toMatchObject({
      requested_provider_canonical: "server_heuristic",
      provider_used_canonical: "local_heuristic",
      fallback_used: true
    });
  });

  it("captures active wish telemetry when the actor can fulfill it", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "full",
      gameId: "game-wish-can-fulfill",
      handId: "hand-wish-can-fulfill",
      phase: "trick_play",
      actorSeat: "seat-0",
      decisionIndex: 6,
      stateRaw: {
        phase: "trick_play",
        activeSeat: "seat-0",
        currentWish: 8,
        hands: {
          "seat-0": [{ id: "jade-8", kind: "standard", rank: 8 }],
          "seat-1": [],
          "seat-2": [],
          "seat-3": []
        },
        currentTrick: {
          entries: [
            {
              type: "play",
              seat: "seat-2",
              combination: { containsMahjong: true }
            }
          ]
        }
      } as JsonObject,
      stateNorm: { phase: "trick_play", currentWish: 8 },
      legalActions: {
        "seat-0": [WISH_PLAY_ACTION]
      },
      chosenAction: WISH_PLAY_ACTION,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false
    });

    expect(payloads.full.metadata).toMatchObject({
      wish_active: true,
      current_wish: 8,
      wish_rank: 8,
      wish_owner: "seat-2",
      actor_holds_fulfilling_wish_card: true,
      legal_fulfilling_wish_moves_exist: true,
      chosen_action_fulfilled_wish: true,
      chosen_action_failed_required_wish: false
    });
    expect(payloads.full.stateFeatures).toMatchObject({
      current_wish: 8,
      legal_fulfilling_wish_move_count: 1
    });
  });

  it("counts a wished rank inside a straight as fulfilled even when compact chosen action omits combination ranks", () => {
    const payloads = buildWishDecision({
      wishedRank: 8,
      legalAction: compactPlayTemplate({
        cardIds: ["star-6", "jade-7", "sword-8", "pagoda-9", "star-10"],
        primaryRank: 10
      })
    });

    expect(payloads.full.metadata).toMatchObject({
      wish_fulfillment_required: true,
      chosen_action_fulfilled_wish: true,
      chosen_action_failed_required_wish: false
    });
  });

  it("counts a wished rank inside a pair sequence as fulfilled", () => {
    const payloads = buildWishDecision({
      wishedRank: 6,
      legalAction: compactPlayTemplate({
        kind: "pair-sequence",
        cardIds: ["star-5", "jade-5", "sword-6", "pagoda-6", "star-7", "jade-7"],
        primaryRank: 7
      })
    });

    expect(payloads.full.metadata.chosen_action_fulfilled_wish).toBe(true);
    expect(payloads.full.metadata.chosen_action_failed_required_wish).toBe(false);
  });

  it("counts a wished rank inside a full house as fulfilled", () => {
    const payloads = buildWishDecision({
      wishedRank: 10,
      legalAction: compactPlayTemplate({
        kind: "full-house",
        cardIds: ["star-13", "jade-13", "sword-13", "pagoda-10", "star-10"],
        primaryRank: 13
      })
    });

    expect(payloads.full.metadata.chosen_action_fulfilled_wish).toBe(true);
    expect(payloads.full.metadata.chosen_action_failed_required_wish).toBe(false);
  });

  it("counts Phoenix as fulfilling only when phoenixAsRank matches the active wish", () => {
    const matching = buildWishDecision({
      wishedRank: 8,
      legalAction: compactPlayTemplate({
        cardIds: ["phoenix", "star-7"],
        primaryRank: 8,
        phoenixAsRank: 8
      })
    });
    const absent = buildWishDecision({
      wishedRank: 9,
      legalAction: compactPlayTemplate({
        cardIds: ["phoenix", "star-7"],
        primaryRank: 8,
        phoenixAsRank: 8
      })
    });

    expect(matching.full.metadata.chosen_action_fulfilled_wish).toBe(true);
    expect(matching.full.metadata.chosen_action_failed_required_wish).toBe(false);
    expect(absent.full.metadata.chosen_action_fulfilled_wish).toBe(false);
    expect(absent.full.metadata.chosen_action_failed_required_wish).toBe(false);
  });

  it("does not count a special-only play as fulfilling a numeric wish without rank context", () => {
    const payloads = buildWishDecision({
      wishedRank: 8,
      legalAction: compactPlayTemplate({
        kind: "single",
        cardIds: ["dragon"],
        primaryRank: 15
      })
    });

    expect(payloads.full.metadata.chosen_action_fulfilled_wish).toBe(false);
    expect(payloads.full.metadata.chosen_action_failed_required_wish).toBe(false);
  });

  it("does not mark an optional Tichu call as a failed required wish before the play decision", () => {
    const fulfillingPlay = compactPlayTemplate({
      kind: "single",
      cardIds: ["jade-8"],
      primaryRank: 8
    });
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "full",
      gameId: "game-wish-call-tichu",
      handId: "hand-wish-call-tichu",
      phase: "trick_play",
      actorSeat: "seat-0",
      decisionIndex: 12,
      stateRaw: {
        ...STATE_RAW,
        phase: "trick_play",
        currentWish: 8,
        hands: {
          "seat-0": [{ id: "jade-8", kind: "standard", suit: "jade", rank: 8 }]
        }
      },
      stateNorm: { phase: "trick_play", currentWish: 8 },
      legalActions: {
        "seat-0": [{ type: "call_tichu", seat: "seat-0" }, fulfillingPlay]
      },
      chosenAction: { type: "call_tichu", seat: "seat-0" },
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false
    });

    expect(payloads.full.metadata).toMatchObject({
      wish_fulfillment_required: true,
      chosen_action_fulfilled_wish: false,
      chosen_action_failed_required_wish: false
    });
  });

  it("regresses observed high-straight wish fulfillment patterns", () => {
    const wishEight = buildWishDecision({
      wishedRank: 8,
      legalAction: compactPlayTemplate({
        cardIds: ["star-6", "jade-7", "sword-8", "pagoda-9", "star-10"],
        primaryRank: 10
      })
    });
    const wishKing = buildWishDecision({
      wishedRank: 13,
      legalAction: compactPlayTemplate({
        cardIds: ["star-10", "jade-11", "sword-12", "pagoda-13", "star-14"],
        primaryRank: 14
      })
    });

    expect(wishEight.full.metadata.chosen_action_fulfilled_wish).toBe(true);
    expect(wishEight.full.metadata.chosen_action_failed_required_wish).toBe(false);
    expect(wishKing.full.metadata.chosen_action_fulfilled_wish).toBe(true);
    expect(wishKing.full.metadata.chosen_action_failed_required_wish).toBe(false);
  });

  it("captures active wish telemetry when the actor cannot fulfill it", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "minimal",
      gameId: "game-wish-cannot-fulfill",
      handId: "hand-wish-cannot-fulfill",
      phase: "trick_play",
      actorSeat: "seat-0",
      decisionIndex: 7,
      stateRaw: {
        phase: "trick_play",
        activeSeat: "seat-0",
        currentWish: 8,
        hands: {
          "seat-0": [{ id: "jade-9", kind: "standard", rank: 9 }],
          "seat-1": [],
          "seat-2": [],
          "seat-3": []
        }
      } as JsonObject,
      stateNorm: { phase: "trick_play", currentWish: 8 },
      legalActions: {
        "seat-0": [PASS_ACTION]
      },
      chosenAction: PASS_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false
    });

    expect(payloads.minimal.metadata).toMatchObject({
      wish_active: true,
      current_wish: 8,
      actor_holds_fulfilling_wish_card: false,
      legal_fulfilling_wish_moves_exist: false,
      active_wish_no_legal_fulfilling_move: true,
      chosen_action_fulfilled_wish: false
    });
  });

  it("adds wish and alias-safe fallback metadata to event telemetry", () => {
    const eventPayloads = buildSelfPlayEventTelemetry({
      mode: "minimal",
      gameId: "game-event-wish",
      handId: "hand-event-wish",
      event: { type: "turn_passed", seat: "seat-0" } as unknown as EngineEvent,
      stateNorm: {
        phase: "trick_play",
        currentWish: 8
      },
      actorSeat: "seat-0",
      eventIndex: 3,
      requestedProvider: "local",
      providerUsed: "local_heuristic"
    });

    expect(eventPayloads.minimal.fallback_used).toBe(false);
    expect(eventPayloads.minimal.metadata).toMatchObject({
      wish_active: true,
      current_wish: 8,
      requested_provider_canonical: "local_heuristic",
      provider_used_canonical: "local_heuristic",
      fallback_used: false
    });
  });

  it("declares candidate score representation and chosen-action coverage", () => {
    const payloads = buildTelemetryDecisionPayloads({
      source: "selfplay",
      mode: "full",
      gameId: "game-candidate-coverage",
      handId: "hand-candidate-coverage",
      phase: "play",
      actorSeat: "seat-0",
      decisionIndex: 8,
      stateRaw: STATE_RAW,
      stateNorm: STATE_NORM,
      legalActions: {
        "seat-0": [PASS_ACTION]
      },
      chosenAction: PASS_ACTION as unknown as JsonObject,
      policyName: "test-policy",
      policySource: "local_heuristic",
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      fallbackUsed: false,
      candidateScores: [
        {
          action: PASS_ACTION,
          score: 1,
          reasons: ["covered"],
          tags: []
        }
      ]
    });

    expect(payloads.full.metadata).toMatchObject({
      candidate_scores_representation: "expanded_candidate_actions",
      compact_legal_action_count: 1,
      scored_candidate_count: 1,
      chosen_action_has_scored_candidate: true,
      chosen_action_unscored_reason: null
    });
  });

  it("keeps replay and training database reads deterministically ordered", () => {
    const root = process.cwd();
    const repository = fs.readFileSync(
      path.join(
        root,
        "apps",
        "server",
        "src",
        "services",
        "telemetry-repository.ts"
      ),
      "utf8"
    );
    const trainingExport = fs.readFileSync(
      path.join(root, "ml", "export_training_rows.py"),
      "utf8"
    );

    expect(repository).toContain(
      "ORDER BY game_id ASC, hand_id ASC, event_index ASC, ts ASC, id ASC"
    );
    expect(repository).toContain(
      "ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC"
    );
    expect(trainingExport).toContain(
      "ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC"
    );
  });

  it("posts live gameplay decision and event payloads through the shared endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify({
          accepted: true,
          telemetry_id: url.endsWith("/api/telemetry/decision") ? 10 : 11
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const decisionResult = await emitDecisionTelemetry({
      settings: {
        ...WEB_SETTINGS,
        backendBaseUrl: "http://localhost:43210"
      },
      action: PASS_ACTION,
      phase: "play",
      gameId: "game-live",
      handId: "hand-live",
      decisionIndex: 1,
      stateRaw: STATE_RAW as unknown as EngineResult["nextState"],
      stateNorm: STATE_NORM as unknown as EngineResult["derivedView"],
      legalActions: {
        "seat-0": [PASS_ACTION]
      } as unknown as EngineResult["legalActions"],
      policyName: "test-policy",
      policySource: "human_ui"
    });
    const eventResult = await emitEventTelemetry({
      settings: {
        ...WEB_SETTINGS,
        backendBaseUrl: "http://localhost:43210"
      },
      events: [
        { type: "turn_passed", seat: "seat-0" } as unknown as EngineEvent
      ],
      phase: "play",
      actorSeat: "seat-0",
      gameId: "game-live",
      handId: "hand-live"
    });

    expect(decisionResult?.telemetryId).toBe(10);
    expect(eventResult?.telemetryIds).toEqual([11]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/telemetry/decision"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/telemetry/event"
    );
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

  it("posts full selfplay decision snapshots only when full telemetry is requested", async () => {
    const postedDecisions: JsonObject[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/telemetry/decision")) {
          postedDecisions.push(
            JSON.parse(String(init?.body ?? "{}")) as JsonObject
          );
        }
        return new Response(
          JSON.stringify(
            url.endsWith("/health")
              ? { ok: true }
              : { accepted: true, telemetry_id: postedDecisions.length + 1 }
          ),
          {
            status: url.endsWith("/health") ? 200 : 202,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const fullSummary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "full-selfplay-state-snapshot",
      defaultProvider: "local",
      telemetryEnabled: true,
      strictTelemetry: true,
      telemetryMode: "full",
      fullStateDecisionRequests: true,
      backendBaseUrl: "http://127.0.0.1:4310",
      quiet: true,
      progress: false,
      maxDecisionsPerGame: 1
    });

    expect(fullSummary.errors).toBe(1);
    expect(fullSummary.telemetryFailuresTotal).toBe(0);
    expect(postedDecisions.length).toBeGreaterThan(0);
    const fullDecision = postedDecisions[0] as TelemetryDecisionPayload;
    expect(fullDecision.metadata.telemetry_mode).toBe("full");
    expect(Object.keys(fullDecision.state_raw).length).toBeGreaterThan(0);
    expect(fullDecision.state_norm).not.toBeNull();
    expect(
      Object.keys(fullDecision.state_norm as JsonObject).length
    ).toBeGreaterThan(0);
    expect(fullDecision.legal_actions).toBeDefined();
    expect(fullDecision.candidateScores).not.toBeNull();
    expect(fullDecision.stateFeatures).not.toBeNull();

    postedDecisions.length = 0;
    const minimalSummary = await runSelfPlayBatch({
      games: 1,
      baseSeed: "minimal-selfplay-state-snapshot",
      defaultProvider: "local",
      telemetryEnabled: true,
      strictTelemetry: true,
      telemetryMode: "minimal",
      fullStateDecisionRequests: true,
      backendBaseUrl: "http://127.0.0.1:4310",
      quiet: true,
      progress: false,
      maxDecisionsPerGame: 1
    });

    expect(minimalSummary.errors).toBe(1);
    expect(minimalSummary.telemetryFailuresTotal).toBe(0);
    expect(postedDecisions.length).toBeGreaterThan(0);
    const minimalDecision = postedDecisions[0] as TelemetryDecisionPayload;
    expect(minimalDecision.metadata.telemetry_mode).toBe("minimal");
    expect(minimalDecision.state_raw).toEqual({});
    expect(minimalDecision.state_norm).toBeNull();
    expect(minimalDecision.legal_actions).toBeDefined();
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
    expect(elapsedMs).toBeLessThan(2_000);
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
