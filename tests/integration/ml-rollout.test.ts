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
  buildRolloutContinuationMetadata,
  hasConcreteRolloutStateHands,
  isResultCompleteForResume,
  isTransientRolloutFailureReason,
  limitDecisionRowsRoundRobinByGame,
  resolveForcedActionFromCandidate as resolveForcedActionForRollout,
  shouldUseFullStateRolloutContinuation,
  withTimeout
} from "../../apps/sim-runner/src/ml-rollouts";
import { buildHeuristicDecisionOptions } from "../../apps/sim-runner/src/self-play-batch";

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

  it("includes rollout sample variants in heuristic selection keys", () => {
    const sampleA = buildHeuristicDecisionOptions({
      run_id: "rollout",
      game_id: "game-1",
      hand_id: "hand-1",
      decision_index: 12,
      exploration_profile: "training_diversity",
      rollout_sample_variant: "seed-a"
    });
    const sampleB = buildHeuristicDecisionOptions({
      run_id: "rollout",
      game_id: "game-1",
      hand_id: "hand-1",
      decision_index: 12,
      exploration_profile: "training_diversity",
      rollout_sample_variant: "seed-b"
    });

    expect(sampleA.exploration.profile).toBe("training_diversity");
    expect(sampleA.selectionKey).not.toBe(sampleB.selectionKey);
    expect(sampleA.selectionKey).toContain("seed-a");
  });

  it("builds configurable local rollout continuation metadata", () => {
    const metadata = buildRolloutContinuationMetadata({
      args: {
        databaseUrl: "postgres://example",
        output: "out.jsonl",
        continuationProvider: "local",
        rolloutsPerAction: 2,
        seed: "rollout",
        concurrency: 1,
        resume: false,
        backendUrl: "http://127.0.0.1:4310",
        continuationExplorationProfile: "conservative",
        continuationExplorationRate: 1,
        continuationExplorationTopN: 2,
        continuationExplorationMaxScoreGap: 8
      },
      job: {
        decisionId: 1,
        gameId: "game-1",
        handId: "hand-1",
        phase: "trick_play",
        actorSeat: "seat-0",
        candidateActionKey: "candidate-a",
        candidateActionCanonicalJson: "{}",
        continuationProvider: "local",
        engineVersion: "milestone-1"
      },
      decisionIndex: 12,
      sampleSeed: "seed-a",
      sampleIndex: 1
    });

    expect(metadata).toMatchObject({
      exploration_profile: "conservative",
      exploration_rate: 1,
      exploration_top_n: 2,
      exploration_max_score_gap: 8,
      rollout_sample_variant: "1:seed-a"
    });
  });

  it("keeps full-state backend continuation enabled for server-backed rollouts", () => {
    expect(shouldUseFullStateRolloutContinuation("local")).toBe(false);
    expect(shouldUseFullStateRolloutContinuation("server_heuristic")).toBe(true);
    expect(shouldUseFullStateRolloutContinuation("lightgbm_model")).toBe(true);
  });

  it("fails a rollout sample when it exceeds the timeout", async () => {
    await expect(
      withTimeout(
        new Promise<void>((resolve) => setTimeout(resolve, 50)),
        10,
        "rollout_sample"
      )
    ).rejects.toThrow("rollout_sample_timeout_10ms");
  });

  it("treats sample timeouts as transient rollout failures", () => {
    expect(isTransientRolloutFailureReason("rollout_sample_timeout_3000ms")).toBe(
      true
    );
    expect(
      isTransientRolloutFailureReason("rollout_decision_limit_reached")
    ).toBe(false);
    expect(isTransientRolloutFailureReason("invalid_forced_action")).toBe(
      false
    );
  });

  it("keeps transient timeout rows replayable on resume", () => {
    expect(
      isResultCompleteForResume(
        {
          decision_id: 126345,
          candidate_action_key: "candidate-a",
          rollout_available: false,
          rollout_samples: 0,
          rollout_failures: 1,
          rollout_mean_actor_team_delta: null,
          rollout_median_actor_team_delta: null,
          rollout_std_actor_team_delta: null,
          rollout_win_rate: null,
          rollout_hand_win_rate: null,
          rollout_tichu_success_rate: null,
          rollout_grand_tichu_success_rate: null,
          rollout_mean_finish_rank_actor: null,
          rollout_mean_finish_rank_partner: null,
          rollout_continuation_provider: "server_heuristic",
          rollout_seed: "seed",
          rollout_engine_version: "milestone-1",
          rollout_failure_reason: "rollout_sample_timeout_3000ms"
        },
        5
      )
    ).toBe(false);
  });

  it("treats permanent rollout failures as complete on resume", () => {
    expect(
      isResultCompleteForResume(
        {
          decision_id: 126345,
          candidate_action_key: "candidate-a",
          rollout_available: false,
          rollout_samples: 0,
          rollout_failures: 5,
          rollout_mean_actor_team_delta: null,
          rollout_median_actor_team_delta: null,
          rollout_std_actor_team_delta: null,
          rollout_win_rate: null,
          rollout_hand_win_rate: null,
          rollout_tichu_success_rate: null,
          rollout_grand_tichu_success_rate: null,
          rollout_mean_finish_rank_actor: null,
          rollout_mean_finish_rank_partner: null,
          rollout_continuation_provider: "server_heuristic",
          rollout_seed: "seed",
          rollout_engine_version: "milestone-1",
          rollout_failure_reason: "invalid_forced_action"
        },
        5
      )
    ).toBe(true);
  });

  it("rejects rollout states with hidden placeholder hands", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-3"
    }) as unknown as {
      hands: Record<string, unknown[]>;
    };

    state.hands["seat-0"] = ["unknown-seat-0-1"];

    expect(hasConcreteRolloutStateHands(state as never)).toBe(false);
  });

  it("accepts rollout states when every seat has concrete cards", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0"
    });

    expect(hasConcreteRolloutStateHands(state)).toBe(true);
  });

  it("spreads capped rollout decision selection across games", () => {
    const selected = limitDecisionRowsRoundRobinByGame(
      [
        {
          id: 1,
          game_id: "game-a",
          hand_id: "game-a-hand-1",
          phase: "trick_play",
          actor_seat: "seat-0",
          decision_index: 1,
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          engine_version: "milestone-1",
          sim_version: "test",
          state_raw: {},
          state_norm: {},
          legal_actions: {}
        },
        {
          id: 2,
          game_id: "game-a",
          hand_id: "game-a-hand-1",
          phase: "trick_play",
          actor_seat: "seat-0",
          decision_index: 2,
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          engine_version: "milestone-1",
          sim_version: "test",
          state_raw: {},
          state_norm: {},
          legal_actions: {}
        },
        {
          id: 3,
          game_id: "game-a",
          hand_id: "game-a-hand-1",
          phase: "trick_play",
          actor_seat: "seat-0",
          decision_index: 3,
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          engine_version: "milestone-1",
          sim_version: "test",
          state_raw: {},
          state_norm: {},
          legal_actions: {}
        },
        {
          id: 10,
          game_id: "game-b",
          hand_id: "game-b-hand-1",
          phase: "trick_play",
          actor_seat: "seat-1",
          decision_index: 1,
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          engine_version: "milestone-1",
          sim_version: "test",
          state_raw: {},
          state_norm: {},
          legal_actions: {}
        },
        {
          id: 11,
          game_id: "game-b",
          hand_id: "game-b-hand-1",
          phase: "trick_play",
          actor_seat: "seat-1",
          decision_index: 2,
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          engine_version: "milestone-1",
          sim_version: "test",
          state_raw: {},
          state_norm: {},
          legal_actions: {}
        }
      ],
      4
    );

    expect(selected.map((row) => row.id)).toEqual([1, 10, 2, 11]);
    expect(new Set(selected.map((row) => row.game_id))).toEqual(
      new Set(["game-a", "game-b"])
    );
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
