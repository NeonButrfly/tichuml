import { describe, expect, it } from "vitest";
import {
  buildTrainingBatchId,
  buildTrainingGameId,
  buildTrainingGameIdPrefix,
  buildTrainingRunId,
  buildTrainingSeedHash,
  buildTrainingSessionName,
  deriveTrainingBatchSeed,
  formatTrainingRunTimestamp,
  sanitizeSessionName
} from "@tichuml/shared";
import {
  formatTrainingSimCommandForLog,
  findTrainingRunMetadataFile,
  assessTrainingStartStatus,
  assessTelemetryReadiness,
  isProcessStartCompatibleWithRun,
  buildTrainingSimArgs,
  parseSimBatchSummaryFromLines,
  mergeBatchSummaries,
  summarizePersistenceMismatch,
  selectMlExportValidationSummaryFromOutput
} from "../../scripts/training-data.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("training run helpers", () => {
  it("builds stable run ids, session names, and scoped game id prefixes", () => {
    const startedAt = new Date("2026-05-03T18:44:55.000Z");
    const runId = buildTrainingRunId({
      seed: "a1b2c3d4feedbeef",
      startedAt,
      zone: "utc"
    });
    const batchId = buildTrainingBatchId(1);
    const gameIdPrefix = buildTrainingGameIdPrefix({ runId, batchId });

    expect(formatTrainingRunTimestamp(startedAt, "utc")).toBe(
      "20260503-184455"
    );
    expect(runId).toBe("training-20260503-184455-a1b2c3d4");
    expect(buildTrainingSessionName(runId)).toBe(
      "tichuml-training-20260503-184455-a1b2c3d4"
    );
    expect(batchId).toBe("batch-000001");
    expect(gameIdPrefix).toBe(
      "selfplay-training-20260503-184455-a1b2c3d4-batch-000001"
    );
    expect(
      buildTrainingGameId({ gameIdPrefix, gameNumber: 42 })
    ).toBe(
      "selfplay-training-20260503-184455-a1b2c3d4-batch-000001-game-000042"
    );
  });

  it("derives deterministic batch seeds and stable seed hashes", () => {
    const batchOne = deriveTrainingBatchSeed({
      resolvedRunSeed: "feedfacecafebeef",
      derivationNamespace: "training-data",
      batchId: "batch-000001"
    });
    const batchTwo = deriveTrainingBatchSeed({
      resolvedRunSeed: "feedfacecafebeef",
      derivationNamespace: "training-data",
      batchId: "batch-000002"
    });

    expect(batchOne).toHaveLength(32);
    expect(batchOne).not.toBe(batchTwo);
    expect(buildTrainingSeedHash("feedfacecafebeef")).toHaveLength(64);
  });

  it("sanitizes user session names into safe readable tokens", () => {
    expect(sanitizeSessionName("My Training / Run")).toBe("my-training-run");
    expect(() => sanitizeSessionName("///")).toThrow(/Session name/);
  });

  it("builds the known-good training sim command shape without forcing rich full-state requests", () => {
    const args = buildTrainingSimArgs({
      metadata: {
        run_id: "training-20260504-000000-deadbeef",
        provider: "server_heuristic",
        backend_url: "http://127.0.0.1:4310",
        strict_telemetry: false,
        telemetry_mode: "full",
        seed_hash: "abc123",
        decision_timeout_ms: 2000,
        game_id_prefix: "selfplay-training-20260504-000000-deadbeef"
      },
      remainingGames: 3,
      batchId: "batch-000001",
      batchSeed: "feedfacefeedfacefeedfacefeedface",
      batchGameIdPrefix:
        "selfplay-training-20260504-000000-deadbeef-batch-000001"
    });

    expect(args).toContain("--telemetry-mode");
    expect(args).toContain("full");
    expect(args).toContain("--progress");
    expect(args).not.toContain("--quiet");
    expect(args).not.toContain("--full-state");
    expect(args).toEqual([
      "run",
      "sim",
      "--",
      "--games",
      "3",
      "--provider",
      "server_heuristic",
      "--backend-url",
      "http://127.0.0.1:4310",
      "--telemetry",
      "true",
      "--strict-telemetry",
      "false",
      "--telemetry-mode",
      "full",
      "--seed",
      "feedfacefeedfacefeedfacefeedface",
      "--seed-prefix",
      "training-data",
      "--run-id",
      "training-20260504-000000-deadbeef",
      "--batch-id",
      "batch-000001",
      "--game-id-prefix",
      "selfplay-training-20260504-000000-deadbeef-batch-000001",
      "--seed-hash",
      "abc123",
      "--decision-timeout-ms",
      "2000",
      "--exploration-profile",
      "off",
      "--progress"
    ]);
    expect(
      formatTrainingSimCommandForLog(
        process.platform === "win32" ? "npm.cmd" : "npm",
        args
      )
    ).toContain("--progress");
  });

  it("carries explicit exploration controls into the training sim command", () => {
    const args = buildTrainingSimArgs({
      metadata: {
        run_id: "training-20260504-000000-deadbeef",
        provider: "server_heuristic",
        backend_url: "http://127.0.0.1:4310",
        strict_telemetry: false,
        telemetry_mode: "full",
        seed_hash: "abc123",
        decision_timeout_ms: 2000,
        game_id_prefix: "selfplay-training-20260504-000000-deadbeef",
        exploration_profile: "training_diversity",
        exploration_rate: 0.15,
        exploration_top_n: 3,
        exploration_max_score_gap: 12
      },
      remainingGames: 2,
      batchId: "batch-000002",
      batchSeed: "feedfacefeedfacefeedfacefeedface",
      batchGameIdPrefix:
        "selfplay-training-20260504-000000-deadbeef-batch-000002"
    });

    expect(args).toContain("--exploration-profile");
    expect(args).toContain("training_diversity");
    expect(args).toContain("--exploration-rate");
    expect(args).toContain("0.15");
    expect(args).toContain("--exploration-top-n");
    expect(args).toContain("3");
    expect(args).toContain("--exploration-max-score-gap");
    expect(args).toContain("12");
  });

  it("parses compact sim summaries from streaming training output", () => {
    const summary = parseSimBatchSummaryFromLines([
      "noise",
      '{"gamesPlayed":3,"handsPlayed":12,"decisionsRecorded":183,"eventsRecorded":240,"errors":0,"fallbackCount":0,"decisionProviderFailures":0,"decisionTimeoutCount":0,"invalidDecisionCount":0,"providerUsage":{"server_heuristic":183},"averageLatencyByProvider":{"server_heuristic":3.12},"telemetryRuntime":{"status":"degraded","pending_count":4}}'
    ]);

    expect(summary?.gamesPlayed).toBe(3);
    expect(summary?.handsPlayed).toBe(12);
    expect(summary?.decisionsRecorded).toBe(183);
    expect(summary?.eventsRecorded).toBe(240);
    expect(summary?.fallbackCount).toBe(0);
    expect(summary?.providerUsage.server_heuristic).toBe(183);
    expect(summary?.averageLatencyByProvider.server_heuristic).toBe(3.12);
    expect(summary?.telemetryRuntime?.pending_count).toBe(4);
  });

  it("aggregates wrapper metadata across all batches instead of only the final batch", () => {
    const aggregated = mergeBatchSummaries(
      null,
      {
        gamesPlayed: 60,
        handsPlayed: 800,
        decisionsRecorded: 70000,
        eventsRecorded: 88000,
        errors: 0,
        fallbackCount: 0,
        decisionProviderFailures: 0,
        decisionTimeoutCount: 0,
        invalidDecisionCount: 0,
        providerUsage: {
          server_heuristic: 68000,
          system_local: 2000
        },
        averageLatencyByProvider: {
          server_heuristic: 8,
          system_local: 0.1
        },
        telemetryRuntime: {
          status: "connected",
          pending_count: 0
        }
      }
    );
    const merged = mergeBatchSummaries(aggregated, {
      gamesPlayed: 40,
      handsPlayed: 589,
      decisionsRecorded: 48114,
      eventsRecorded: 61497,
      errors: 0,
      fallbackCount: 0,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      invalidDecisionCount: 0,
      providerUsage: {
        server_heuristic: 45847,
        system_local: 2267
      },
      averageLatencyByProvider: {
        server_heuristic: 7.65,
        system_local: 0.05
      },
      telemetryRuntime: {
        status: "degraded",
        pending_count: 4
      }
    });

    expect(merged?.gamesPlayed).toBe(100);
    expect(merged?.handsPlayed).toBe(1389);
    expect(merged?.decisionsRecorded).toBe(118114);
    expect(merged?.eventsRecorded).toBe(149497);
    expect(merged?.providerUsage.server_heuristic).toBe(113847);
    expect(merged?.providerUsage.system_local).toBe(4267);
    expect(merged?.telemetryRuntime?.status).toBe("degraded");
    expect(merged?.telemetryRuntime?.pending_count).toBe(4);
    expect(merged?.averageLatencyByProvider.server_heuristic).toBeCloseTo(
      (68000 * 8 + 45847 * 7.65) / 113847,
      6
    );
  });

  it("reports requested vs executed vs persisted mismatches explicitly", () => {
    const mismatch = summarizePersistenceMismatch({
      requestedGames: 100,
      executedGames: 100,
      executedHands: 1389,
      executedDecisions: 118014,
      executedEvents: 149497,
      persistedMatches: 100,
      persistedDecisions: 118114,
      persistedEvents: 149497
    });

    expect(mismatch.games).toEqual({
      requested: 100,
      executed: 100,
      persisted: 100,
      missing: 0,
      extra: 0
    });
    expect(mismatch.decisions).toEqual({
      executed: 118014,
      persisted: 118114,
      missing: 0,
      extra: 100
    });
    expect(mismatch.events).toEqual({
      executed: 149497,
      persisted: 149497,
      missing: 0,
      extra: 0
    });
    expect(mismatch.hasMismatch).toBe(true);
  });

  it("selects the canonical ml:export validation summary when warning JSON follows it", () => {
    const output = [
      "> tichuml@0.1.0 ml:export",
      '{"accepted": true, "validation_only": true, "validation_status": "accepted", "supports_validate_only": true}',
      '{"accepted": true, "warning": "database_url_fallback_used", "database_url_source": "default_local_training_db"}'
    ].join("\n");

    const summary = selectMlExportValidationSummaryFromOutput(output);

    expect(summary).toEqual({
      accepted: true,
      validation_only: true,
      validation_status: "accepted",
      supports_validate_only: true
    });
  });

  it("does not treat a spawned process as started before scoped rows exist", () => {
    const status = assessTrainingStartStatus({
      processRunning: true,
      runComplete: false,
      logShowsBatchStart: true,
      backendHealthy: true,
      telemetryAccepted: true,
      telemetryReady: true,
      scopedCounts: {
        matches: 0,
        decisions: 0,
        events: 0
      },
      fallbackCount: 0,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      telemetryPending: 0,
      persistenceFailures: 0,
      simExitCode: null
    });

    expect(status.kind).toBe("pending");
    expect(status.message).toContain("scoped");
  });

  it("fails startup readiness when telemetry/provider failures are already present", () => {
    const status = assessTrainingStartStatus({
      processRunning: true,
      runComplete: false,
      logShowsBatchStart: true,
      backendHealthy: true,
      telemetryAccepted: true,
      telemetryReady: true,
      scopedCounts: {
        matches: 1,
        decisions: 15,
        events: 18
      },
      fallbackCount: 1,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      telemetryPending: 0,
      persistenceFailures: 0,
      simExitCode: null
    });

    expect(status.kind).toBe("failure");
    expect(status.message).toContain("fallback");
  });

  it("reports verified startup only after scoped matches, decisions, and events exist", () => {
    const status = assessTrainingStartStatus({
      processRunning: true,
      runComplete: false,
      logShowsBatchStart: true,
      backendHealthy: true,
      telemetryAccepted: true,
      telemetryReady: true,
      scopedCounts: {
        matches: 1,
        decisions: 24,
        events: 31
      },
      fallbackCount: 0,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      telemetryPending: 0,
      persistenceFailures: 0,
      simExitCode: null
    });

    expect(status.kind).toBe("success");
    expect(status.message).toContain("verified");
  });

  it("finds run metadata outside the default training-runs directory", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-run-locate-"));
    try {
      fs.mkdirSync(path.join(repoRoot, ".git"));
      fs.mkdirSync(path.join(repoRoot, ".runtime", "custom-run", "training-123"), {
        recursive: true
      });
      const metadataPath = path.join(
        repoRoot,
        ".runtime",
        "custom-run",
        "training-123",
        "metadata.json"
      );
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            run_id: "training-123",
            session_name: "custom-session",
            game_id_prefix: "selfplay-training-123",
            metadata_file: metadataPath,
            run_directory: path.dirname(metadataPath),
            started_at: "2026-05-08T18:29:25.775Z"
          },
          null,
          2
        ),
        "utf8"
      );

      const resolved = findTrainingRunMetadataFile(repoRoot, {
        sessionName: "custom-session"
      });

      expect(resolved).toBe(metadataPath);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects PID reuse when the live process start is far newer than the run metadata", () => {
    expect(
      isProcessStartCompatibleWithRun({
        runStartedAt: "2026-05-05T05:17:15.000Z",
        processStartedAt: "2026-05-21T18:39:59.000Z"
      })
    ).toBe(false);
    expect(
      isProcessStartCompatibleWithRun({
        runStartedAt: "2026-05-21T18:30:00.000Z",
        processStartedAt: "2026-05-21T18:31:15.000Z"
      })
    ).toBe(true);
  });

  it("fails telemetry readiness when coverage, warnings, or scoped holes remain", () => {
    const assessment = assessTelemetryReadiness({
      requestedGames: 12,
      runComplete: true,
      failureReason: null,
      fallbackCount: 0,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      invalidDecisionCount: 0,
      telemetryFlushStatus: {
        accepted: true,
        ready: true,
        queue_pending: 0,
        persistence_failures: 0
      },
      persistenceMismatch: {
        games: { requested: 12, executed: 12, persisted: 12, missing: 0, extra: 0 },
        hands: { executed: 120 },
        decisions: { executed: 480, persisted: 480, missing: 0, extra: 0 },
        events: { executed: 720, persisted: 720, missing: 0, extra: 0 },
        hasMismatch: false
      },
      concurrentWriterOverlap: {
        warning: false,
        scoped_window: { minTs: "2026-05-21T00:00:00.000Z", maxTs: "2026-05-21T00:05:00.000Z" },
        overlapping_decisions: 0,
        overlapping_events: 0,
        overlapping_matches: 0,
        overlap_first_ts: null,
        overlap_last_ts: null
      },
      mlExportValidationSummary: {
        accepted: true,
        validation_status: "accepted"
      },
      trainingDataValidationSummary: {
        coverage: {
          decisions: 480,
          state_features_coverage: 1,
          candidate_scores_coverage: 0.91,
          chosen_action_type_coverage: 1,
          hand_result_coverage: 1,
          game_result_coverage: 0.97,
          outcome_reward_coverage: 1,
          pass_turn_rate: 0.2,
          pass_turn_with_legal_play_rate: 0.01,
          call_tichu_rate: 0,
          decline_grand_tichu_rate: 0.02,
          grand_tichu_call_rate: 0.01,
          pass_reduction_count: 100,
          tichu_aggression_count: 55,
          grand_tichu_aggression_count: 12,
          aggression_context_count: 0
        },
        rewardStats: { min: -100, avg: 5, max: 100 },
        actionDistribution: {},
        phaseDistribution: {},
        providerDistribution: { server_heuristic: 480 },
        averageOutcomeRewardByAction: {},
        candidateScoreStatsByAction: {},
        aggressionComponentCounts: {
          pass_reduction_v1: 100,
          tichu_aggression_v1: 55,
          grand_tichu_aggression_v1: 12,
          aggression_context_v1: 0
        },
        warnings: [
          "No Tichu calls were recorded.",
          "Aggression context metadata is missing."
        ]
      },
      scopedRunValidationSummary: {
        scope: {
          game_id_prefix: "selfplay-training-attempt-001",
          run_id: "training-attempt-001"
        },
        counts: {
          matches: 12,
          decisions: 480,
          events: 720,
          server_heuristic_decisions: 480,
          server_heuristic_trick_play_decisions: 420,
          legal_chosen_actions: 480,
          state_features_count: 480,
          candidate_scores_count: 430,
          explanation_count: 480,
          reward_count: 480,
          invalid_decisions: 0,
          exploration_selected_count: 0,
          exploration_enabled_count: 0,
          fallback_count: 0,
          tichu_calls: 0,
          grand_tichu_calls: 2,
          grand_tichu_declines: 8,
          bomb_chosen_count: 10,
          pass_select_count: 48
        },
        rewardStats: {
          min: -100,
          p01: -90,
          p05: -60,
          median: 0,
          mean: 5,
          p95: 85,
          p99: 100,
          max: 100
        },
        phaseDistribution: [],
        actionDistribution: [],
        missingRewardByPhaseProvider: [],
        passDiagnostics: {
          protected_cards_passed: 10,
          control_cards_passed: 12,
          avg_partner_support: 0.2,
          avg_self_structure_delta: 0.1,
          avg_dead_singles_delta: -0.3
        },
        matchConsistency: {
          completed_zero_zero: 0,
          completed_hands_le_one: 0,
          server_mixed_provider_mismatch: 0
        },
        recentGames: ["game-001"]
      }
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("candidate_scores_coverage"),
        expect.stringContaining("game_result_coverage"),
        expect.stringContaining("warning"),
        expect.stringContaining("candidate_scores_count"),
        expect.stringContaining("tichu_calls")
      ])
    );
  });

  it("passes telemetry readiness only when coverage and scoped validation are hole-free", () => {
    const assessment = assessTelemetryReadiness({
      requestedGames: 12,
      runComplete: true,
      failureReason: null,
      fallbackCount: 0,
      decisionProviderFailures: 0,
      decisionTimeoutCount: 0,
      invalidDecisionCount: 0,
      telemetryFlushStatus: {
        accepted: true,
        ready: true,
        queue_pending: 0,
        persistence_failures: 0
      },
      persistenceMismatch: {
        games: { requested: 12, executed: 12, persisted: 12, missing: 0, extra: 0 },
        hands: { executed: 120 },
        decisions: { executed: 480, persisted: 480, missing: 0, extra: 0 },
        events: { executed: 720, persisted: 720, missing: 0, extra: 0 },
        hasMismatch: false
      },
      concurrentWriterOverlap: {
        warning: false,
        scoped_window: { minTs: "2026-05-21T00:00:00.000Z", maxTs: "2026-05-21T00:05:00.000Z" },
        overlapping_decisions: 0,
        overlapping_events: 0,
        overlapping_matches: 0,
        overlap_first_ts: null,
        overlap_last_ts: null
      },
      mlExportValidationSummary: {
        accepted: true,
        validation_status: "accepted"
      },
      trainingDataValidationSummary: {
        coverage: {
          decisions: 516,
          state_features_coverage: 1,
          candidate_scores_coverage: 1,
          chosen_action_type_coverage: 1,
          hand_result_coverage: 1,
          game_result_coverage: 1,
          outcome_reward_coverage: 0.9302325581,
          pass_turn_rate: 0.2,
          pass_turn_with_legal_play_rate: 0.01,
          call_tichu_rate: 0.01,
          decline_grand_tichu_rate: 0.02,
          grand_tichu_call_rate: 0.01,
          pass_reduction_count: 100,
          tichu_aggression_count: 55,
          grand_tichu_aggression_count: 12,
          aggression_context_count: 55
        },
        rewardStats: { min: -100, avg: 5, max: 100 },
        actionDistribution: {},
        phaseDistribution: {},
        providerDistribution: { server_heuristic: 480 },
        averageOutcomeRewardByAction: {},
        candidateScoreStatsByAction: {},
        aggressionComponentCounts: {
          pass_reduction_v1: 100,
          tichu_aggression_v1: 55,
          grand_tichu_aggression_v1: 12,
          aggression_context_v1: 55
        },
        warnings: []
      },
      scopedRunValidationSummary: {
        scope: {
          game_id_prefix: "selfplay-training-attempt-001",
          run_id: "training-attempt-001"
        },
        counts: {
          matches: 12,
          decisions: 516,
          events: 720,
          server_heuristic_decisions: 480,
          server_heuristic_trick_play_decisions: 420,
          legal_chosen_actions: 516,
          state_features_count: 516,
          candidate_scores_count: 516,
          explanation_count: 516,
          reward_count: 480,
          invalid_decisions: 0,
          exploration_selected_count: 0,
          exploration_enabled_count: 0,
          fallback_count: 0,
          tichu_calls: 4,
          grand_tichu_calls: 2,
          grand_tichu_declines: 8,
          bomb_chosen_count: 10,
          pass_select_count: 48
        },
        rewardStats: {
          min: -100,
          p01: -90,
          p05: -60,
          median: 0,
          mean: 5,
          p95: 85,
          p99: 100,
          max: 100
        },
        phaseDistribution: [],
        actionDistribution: [],
        missingRewardByPhaseProvider: [
          {
            provider_used: "system_local",
            phase: "exchange_complete",
            total: 12,
            missing_reward: 12
          },
          {
            provider_used: "system_local",
            phase: "pass_reveal",
            total: 12,
            missing_reward: 12
          },
          {
            provider_used: "system_local",
            phase: "round_scoring",
            total: 12,
            missing_reward: 12
          }
        ],
        passDiagnostics: {
          protected_cards_passed: 10,
          control_cards_passed: 12,
          avg_partner_support: 0.2,
          avg_self_structure_delta: 0.1,
          avg_dead_singles_delta: -0.3
        },
        matchConsistency: {
          completed_zero_zero: 0,
          completed_hands_le_one: 0,
          server_mixed_provider_mismatch: 0
        },
        recentGames: ["game-001"]
      }
    });

    expect(assessment.ok).toBe(true);
    expect(assessment.failures).toEqual([]);
  });
});
