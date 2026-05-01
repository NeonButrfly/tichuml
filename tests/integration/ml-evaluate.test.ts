import { describe, expect, it } from "vitest";
import {
  buildLatestSummary,
  buildProviderComparisonSummary,
  evaluateImprovementGate
} from "../../apps/sim-runner/src/evaluate";

describe("ml evaluation helpers", () => {
  const args: Parameters<typeof evaluateImprovementGate>[0]["args"] = {
    games: 20,
    seed: "eval-seed",
    telemetryEnabled: false,
    quiet: true,
    progress: false,
    defaultProvider: "lightgbm_model",
    nsProvider: "lightgbm_model",
    ewProvider: "server_heuristic",
    seatProviders: {
      "seat-0": "lightgbm_model",
      "seat-2": "lightgbm_model",
      "seat-1": "server_heuristic",
      "seat-3": "server_heuristic"
    },
    mirrorSeats: true,
    minGamesForGate: 20,
    requireNoIllegalActions: true,
    requireNoFallbackIncrease: true,
    maxAverageLatencyMs: 250
  };

  const primaryLeg = {
    name: "primary",
    seed: "seed:primary",
    games_played: 20,
    hands_played: 100,
    default_provider: "lightgbm_model",
    ns_provider: "lightgbm_model",
    ew_provider: "server_heuristic",
    seat_providers: {
      "seat-0": "lightgbm_model",
      "seat-2": "lightgbm_model",
      "seat-1": "server_heuristic",
      "seat-3": "server_heuristic"
    },
    team_assignments: {
      "team-0": "lightgbm_model",
      "team-1": "server_heuristic"
    },
    win_counts: {
      "team-0": 12,
      "team-1": 8,
      tie: 0
    },
    hand_win_counts: {
      "team-0": 56,
      "team-1": 44,
      tie: 0
    },
    win_rate_by_team: {
      "team-0": 0.6,
      "team-1": 0.4,
      tie: 0
    },
    hand_win_rate_by_team: {
      "team-0": 0.56,
      "team-1": 0.44,
      tie: 0
    },
    average_score_margin: 32,
    total_score_by_team: {
      "team-0": 2140,
      "team-1": 1860
    },
    pass_rate: 0.21,
    bomb_usage_rate: 0.05,
    wish_satisfaction_rate: 0.4,
    tichu_call_rate: 0.3,
    tichu_success_rate: 0.55,
    grand_tichu_call_rate: 0.08,
    grand_tichu_success_rate: 0.5,
    double_victory_rate: 0.07,
    double_victory_counts: {
      "team-0": 5,
      "team-1": 2
    },
    fallback_count: 0,
    invalid_decision_count: 0,
    average_latency_by_provider: {
      lightgbm_model: 35,
      server_heuristic: 18
    },
    decision_latency_p95_by_provider: {
      lightgbm_model: null,
      server_heuristic: null
    },
    provider_usage: {
      lightgbm_model: 220,
      server_heuristic: 220
    },
    decisions_by_phase: {
      trick_play: 380,
      pass_select: 60
    },
    events_by_phase: {
      trick_play: 500
    },
    exchange_phase_recorded: true,
    pass_select_recorded: true,
    errors: 0
  } as const;

  const mirrorLeg = {
    ...primaryLeg,
    name: "mirror",
    seed: "seed:mirror",
    default_provider: "server_heuristic",
    ns_provider: "server_heuristic",
    ew_provider: "lightgbm_model",
    seat_providers: {
      "seat-0": "server_heuristic",
      "seat-2": "server_heuristic",
      "seat-1": "lightgbm_model",
      "seat-3": "lightgbm_model"
    },
    team_assignments: {
      "team-0": "server_heuristic",
      "team-1": "lightgbm_model"
    },
    win_counts: {
      "team-0": 9,
      "team-1": 11,
      tie: 0
    },
    hand_win_counts: {
      "team-0": 47,
      "team-1": 53,
      tie: 0
    },
    total_score_by_team: {
      "team-0": 1930,
      "team-1": 2070
    },
    double_victory_counts: {
      "team-0": 1,
      "team-1": 4
    }
  } as const;

  it("aggregates mirrored seat results by provider identity", () => {
    const comparison = buildProviderComparisonSummary(
      [primaryLeg, mirrorLeg],
      "lightgbm_model",
      "server_heuristic"
    );

    expect(comparison).not.toBeNull();
    expect(comparison?.provider_a_match_wins).toBe(23);
    expect(comparison?.provider_b_match_wins).toBe(17);
    expect(comparison?.provider_a_match_win_rate).toBe(0.575);
    expect(comparison?.provider_a_total_score).toBe(4210);
    expect(comparison?.provider_b_total_score).toBe(3790);
    expect(comparison?.provider_a_average_latency_ms).toBe(35);
  });

  it("passes the improvement gate when the challenger wins cleanly", () => {
    const comparison = buildProviderComparisonSummary(
      [primaryLeg, mirrorLeg],
      "lightgbm_model",
      "server_heuristic"
    );
    const gate = evaluateImprovementGate({
      comparison,
      baselineRun: {
        ...primaryLeg,
        name: "heuristic_sanity",
        default_provider: "server_heuristic",
        ns_provider: "server_heuristic",
        ew_provider: "server_heuristic",
        fallback_count: 0,
        invalid_decision_count: 0,
        average_latency_by_provider: {
          server_heuristic: 18
        },
        provider_usage: {
          server_heuristic: 440
        }
      },
      comparisonLegs: [primaryLeg, mirrorLeg],
      args
    });

    expect(gate.applied).toBe(true);
    expect(gate.passed).toBe(true);
    expect(gate.challenger_provider).toBe("lightgbm_model");
  });

  it("builds the latest summary payload with new evaluation fields", () => {
    const latest = buildLatestSummary({
      reportTimestamp: "2026-05-01T00:00:00.000Z",
      args,
      primaryLeg,
      gate: {
        applied: true,
        passed: true,
        challenger_provider: "lightgbm_model",
        baseline_provider: "server_heuristic",
        min_games_for_gate: 20,
        games_evaluated: 40,
        require_no_illegal_actions: true,
        require_no_fallback_increase: true,
        max_average_latency_ms: 250,
        checks: []
      },
      gitCommit: "abc123",
      modelFile: "ml/model_registry/lightgbm_action_model.txt",
      modelVersion: "rollout_ranker@2026-05-01"
    });

    expect(latest.mirror_seats).toBe(true);
    expect(latest.tichu_call_rate).toBe(0.3);
    expect(latest.double_victory_rate).toBe(0.07);
    expect(latest.gate_passed).toBe(true);
  });
});
