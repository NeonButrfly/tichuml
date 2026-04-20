import { describe, expect, it } from "vitest";
import type { EngineAction, LegalActionMap } from "@tichuml/engine";
import {
  buildCollectionReadiness,
  buildPhaseTracking,
  buildTelemetryCompleteness,
  summarizeActionDescriptor
} from "../../apps/web/src/master-control-model";

describe("master control model", () => {
  it("marks collection readiness ready only when telemetry coverage is complete", () => {
    const completeness = buildTelemetryCompleteness({
      ts: new Date().toISOString(),
      game_id: "game-1",
      hand_id: "hand-1",
      phase: "trick_play",
      actor_seat: "seat-0",
      decision_index: 3,
      schema_version: 1,
      engine_version: "engine",
      sim_version: "sim",
      policy_name: "heuristic",
      policy_source: "local_heuristic",
      state_raw: { phase: "trick_play" },
      state_norm: { phase: "trick_play" },
      legal_actions: { "seat-0": [{ type: "pass_turn", seat: "seat-0" }] },
      chosen_action: { type: "pass_turn", seat: "seat-0" },
      metadata: { source: "test" },
      antipattern_tags: []
    });

    expect(
      buildCollectionReadiness({
        telemetryEnabled: true,
        telemetryHealthy: true,
        backendReachable: true,
        decisionPayloadValid: true,
        telemetryPayloadValid: true,
        exchangeRecorded: true,
        completeness
      })
    ).toBe("READY");

    expect(
      buildCollectionReadiness({
        telemetryEnabled: true,
        telemetryHealthy: true,
        backendReachable: true,
        decisionPayloadValid: true,
        telemetryPayloadValid: true,
        exchangeRecorded: false,
        completeness
      })
    ).toBe("PARTIAL");

    expect(
      buildCollectionReadiness({
        telemetryEnabled: false,
        telemetryHealthy: false,
        backendReachable: false,
        decisionPayloadValid: false,
        telemetryPayloadValid: false,
        exchangeRecorded: false,
        completeness
      })
    ).toBe("NOT READY");
  });

  it("tracks exchange and pickup coverage separately", () => {
    expect(
      buildPhaseTracking(["pass_select", "pass_reveal", "exchange_complete", "trick_play"])
    ).toEqual({
      deal: false,
      passSelect: true,
      exchange: true,
      pickup: true,
      play: true,
      roundEnd: false
    });
  });

  it("summarizes play actions from matching legal actions", () => {
    const action: EngineAction = {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["star-9", "star-10", "star-11", "star-12", "star-13"]
    };
    const legalActions: LegalActionMap = {
      "seat-0": [
        {
          ...action,
          combination: {
            key: "straight-9",
            kind: "straight",
            cardIds: ["star-9", "star-10", "star-11", "star-12", "star-13"],
            primaryRank: 13,
            cardCount: 5,
            phoenixAsRank: null,
            containsMahjong: false,
            containsDragon: false,
            containsPhoenix: false,
            containsDog: false,
            actualRanks: [9, 10, 11, 12, 13],
            pairCount: null,
            isBomb: false
          }
        }
      ]
    };

    expect(summarizeActionDescriptor(action, legalActions, 10)).toMatchObject({
      summary: "Straight K",
      comboType: "straight",
      rankLabel: "K",
      length: 5,
      satisfiesWish: true
    });
  });
});
