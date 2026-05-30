import { describe, expect, it } from "vitest";
import type { LegalAction } from "@tichuml/engine";
import {
  applyEngineAction,
  createScenarioState,
  getLegalActions
} from "@tichuml/engine";
import {
  buildRolloutSeed,
  extractRolloutSampleMetrics,
  findMatchingLegalAction,
  summarizeRolloutSamples,
  teamForSeat
} from "../../apps/sim-runner/src/ml-rollout-utils";
import {
  resolveForcedActionFromCandidate as resolveForcedActionForRollout,
  shouldUseFullStateRolloutContinuation
} from "../../apps/sim-runner/src/ml-rollouts";

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

  it("keeps full-state backend continuation enabled for server-backed rollouts", () => {
    expect(shouldUseFullStateRolloutContinuation("local")).toBe(false);
    expect(shouldUseFullStateRolloutContinuation("server_heuristic")).toBe(true);
    expect(shouldUseFullStateRolloutContinuation("lightgbm_model")).toBe(true);
  });

  it("treats malformed candidate actions as row-level rollout failures", () => {
    const state = createScenarioState({
      phase: "finished"
    });

    const resolution = resolveForcedActionForRollout(
      state,
      "seat-0",
      "{not-json"
    );

    expect(resolution.forcedAction).toBeNull();
    expect(resolution.failureReason).toBeTruthy();
  });

  it("accepts persisted rollout states that omit empty grand Tichu queues", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": [
          { id: "jade-8", kind: "standard", rank: 8, suit: "jade" },
          { id: "sword-9", kind: "standard", rank: 9, suit: "sword" },
          { id: "pagoda-12", kind: "standard", rank: 12, suit: "pagoda" },
          { id: "dragon", kind: "special", special: "dragon" }
        ],
        "seat-1": [
          { id: "jade-3", kind: "standard", rank: 3, suit: "jade" },
          { id: "sword-4", kind: "standard", rank: 4, suit: "sword" },
          { id: "pagoda-5", kind: "standard", rank: 5, suit: "pagoda" }
        ],
        "seat-2": [
          { id: "jade-6", kind: "standard", rank: 6, suit: "jade" },
          { id: "sword-6", kind: "standard", rank: 6, suit: "sword" },
          { id: "pagoda-6", kind: "standard", rank: 6, suit: "pagoda" },
          { id: "star-6", kind: "standard", rank: 6, suit: "star" }
        ],
        "seat-3": [
          { id: "jade-10", kind: "standard", rank: 10, suit: "jade" },
          { id: "sword-10", kind: "standard", rank: 10, suit: "sword" },
          { id: "pagoda-10", kind: "standard", rank: 10, suit: "pagoda" }
        ]
      }
    });
    const legalAction = (getLegalActions(state)["seat-0"] ?? []).find(
      (action) => action.type === "play_cards"
    );

    expect(legalAction).toBeTruthy();

    const persistedState = {
      ...state
    } as typeof state & Record<string, unknown>;
    delete persistedState.grandTichuQueue;

    const next = applyEngineAction(persistedState, legalAction!);
    expect(next.nextState.grandTichuQueue).toEqual([]);
  });
});
