import { describe, expect, it } from "vitest";
import type { LegalAction } from "@tichuml/engine";
import { createScenarioState } from "@tichuml/engine";
import {
  buildRolloutSeed,
  extractRolloutSampleMetrics,
  findMatchingLegalAction,
  summarizeRolloutSamples,
  teamForSeat
} from "../../apps/sim-runner/src/ml-rollout-utils";

describe("ml rollout helpers", () => {
  it("maps seats to stable teams", () => {
    expect(teamForSeat("seat-0")).toBe("team-0");
    expect(teamForSeat("seat-2")).toBe("team-0");
    expect(teamForSeat("seat-1")).toBe("team-1");
    expect(teamForSeat("seat-3")).toBe("team-1");
  });

  it("matches forced candidate actions against legal actions by semantics", () => {
    const legalActions: LegalAction[] = [
      {
        type: "play_cards",
        seat: "seat-0",
        cardIds: ["jade-5", "red-5"],
        combination: {
          kind: "pair",
          primaryRank: 5,
          cardCount: 2,
          isBomb: false,
          actualRanks: [5, 5]
        }
      }
    ];

    const candidateAction = {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["red-5", "jade-5"],
      combination: {
        kind: "pair",
        primaryRank: 5,
        cardCount: 2,
        isBomb: false
      }
    };

    const matched = findMatchingLegalAction(legalActions, candidateAction);
    expect(matched).toEqual(legalActions[0]);
  });

  it("summarizes rollout samples into aggregate labels", () => {
    const summary = summarizeRolloutSamples([
      {
        actorTeamDelta: 100,
        handWin: true,
        matchWin: true,
        tichuSuccess: true,
        grandTichuSuccess: null,
        actorFinishRank: 1,
        partnerFinishRank: 2
      },
      {
        actorTeamDelta: -40,
        handWin: false,
        matchWin: false,
        tichuSuccess: false,
        grandTichuSuccess: null,
        actorFinishRank: 3,
        partnerFinishRank: 4
      }
    ]);

    expect(summary.rollout_mean_actor_team_delta).toBe(30);
    expect(summary.rollout_median_actor_team_delta).toBe(30);
    expect(summary.rollout_hand_win_rate).toBe(0.5);
    expect(summary.rollout_win_rate).toBe(0.5);
    expect(summary.rollout_tichu_success_rate).toBe(0.5);
    expect(summary.rollout_mean_finish_rank_actor).toBe(2);
    expect(summary.rollout_mean_finish_rank_partner).toBe(3);
  });

  it("extracts actor-relative outcome metrics from the finished state", () => {
    const state = createScenarioState({
      phase: "finished",
      roundSummary: {
        teamScores: {
          "team-0": 200,
          "team-1": 0
        },
        finishOrder: ["seat-0", "seat-2", "seat-1", "seat-3"],
        doubleVictory: "team-0",
        tichuBonuses: [
          {
            seat: "seat-0",
            team: "team-0",
            label: "small",
            amount: 100
          }
        ]
      },
      matchScore: {
        "team-0": 200,
        "team-1": 0
      },
      matchComplete: true,
      matchWinner: "team-0"
    });

    const metrics = extractRolloutSampleMetrics(state, "seat-0");
    expect(metrics.actorTeamDelta).toBe(200);
    expect(metrics.handWin).toBe(true);
    expect(metrics.matchWin).toBe(true);
    expect(metrics.tichuSuccess).toBe(true);
    expect(metrics.grandTichuSuccess).toBeNull();
    expect(metrics.actorFinishRank).toBe(1);
    expect(metrics.partnerFinishRank).toBe(2);
  });

  it("builds deterministic rollout seeds", () => {
    expect(buildRolloutSeed("base", 42, "candidate", 0)).toBe(
      "base:42:candidate:0"
    );
  });
});
