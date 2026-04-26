import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsComparison,
  createDiagnosticsAccumulator,
  finalizeDiagnosticsSummary,
  processDiagnosticsLine,
  recordRuntimeSnapshot,
  renderDiagnosticsReport,
  writeDiagnosticsSessionArtifacts,
  type DiagnosticsRunDescriptor
} from "../../apps/sim-runner/src/sim-diagnostics";
import type { SimControllerRuntimeState } from "@tichuml/shared";

function createDescriptor(
  overrides: Partial<DiagnosticsRunDescriptor> = {}
): DiagnosticsRunDescriptor {
  return {
    run_id: "run-1",
    label: "local telemetry off",
    target: "oneshot",
    provider: "local",
    telemetry_enabled: false,
    telemetry_mode: "minimal",
    server_fallback_enabled: true,
    worker_count: 1,
    games_requested: 1,
    games_per_batch: null,
    backend_url: "http://127.0.0.1:4310",
    command: {
      executable: "npm.cmd",
      args: ["run", "sim"],
      display: "npm.cmd run sim"
    },
    resolved_config: {
      provider: "local",
      telemetry_enabled: false
    },
    seed: {
      mode: "automatic_entropy",
      resolved_run_seed: "seed-1",
      derivation_namespace: "diagnostics",
      manual_override_enabled: false,
      manual_override_seed: null,
      generated_at: "2026-04-23T00:00:00.000Z",
      entropy_game_id: "entropy-1",
      audit_hash_hex: "audit-1",
      primary_provider: "local_crypto",
      local_fallback_used: true,
      source_summary: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
        minimumRequired: 1,
        metMinimum: true
      }
    },
    ...overrides
  };
}

function createRuntimeState(
  overrides: Partial<SimControllerRuntimeState> = {}
): SimControllerRuntimeState {
  return {
    runtime_schema_version: 2,
    status: "running",
    pid: 1234,
    controller_id: "sim-controller",
    controller_session_id: "session-1",
    started_at: "2026-04-23T00:00:00.000Z",
    updated_at: "2026-04-23T00:00:05.000Z",
    last_heartbeat: "2026-04-23T00:00:05.000Z",
    heartbeat_stale: false,
    heartbeat_stale_after_seconds: 30,
    requested_action: null,
    current_batch_started_at: "2026-04-23T00:00:02.000Z",
    last_batch_started_at: "2026-04-23T00:00:02.000Z",
    last_batch_finished_at: null,
    last_batch_size: 1,
    last_batch_status: "running",
    total_batches_completed: 0,
    total_games_completed: 0,
    total_errors: 0,
    last_error: null,
    last_shutdown_reason: null,
    last_exit_code: null,
    last_exit_signal: null,
    active_run_seed: {
      mode: "automatic_entropy",
      resolved_run_seed: "seed-1",
      derivation_namespace: "diagnostics",
      manual_override_enabled: false,
      manual_override_seed: null,
      generated_at: "2026-04-23T00:00:00.000Z",
      entropy_game_id: "entropy-1",
      audit_hash_hex: "audit-1",
      primary_provider: "local_crypto",
      local_fallback_used: true,
      source_summary: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
        minimumRequired: 1,
        metMinimum: true
      }
    },
    last_run_seed: null,
    telemetry_decision_failures: 0,
    telemetry_event_failures: 0,
    telemetry_failures_total: 0,
    telemetry_failure_by_endpoint: {},
    telemetry_failure_by_kind: {},
    telemetry_backoff_until: null,
    worker_count: 1,
    running_worker_count: 1,
    paused_worker_count: 0,
    stopped_worker_count: 0,
    errored_worker_count: 0,
    config: {
      provider: "local",
      games_per_batch: 1,
      telemetry_enabled: false,
      server_fallback_enabled: true,
      strict_telemetry: false,
      trace_backend: false,
      telemetry_mode: "minimal",
      telemetry_max_bytes: 1024,
      telemetry_timeout_ms: 1000,
      telemetry_retry_attempts: 1,
      telemetry_retry_delay_ms: 10,
      telemetry_backoff_ms: 100,
      backend_url: "http://127.0.0.1:4310",
      seed_namespace: "diagnostics",
      manual_seed_override_enabled: false,
      manual_seed_override: "",
      seed_prefix: "diagnostics",
      sleep_seconds: 0,
      worker_count: 1,
      quiet: true,
      progress: false,
      seat_providers: {}
    },
    workers: [
      {
        worker_id: "worker-01",
        controller_session_id: "session-1",
        status: "running",
        pid: 1234,
        current_batch_started_at: "2026-04-23T00:00:02.000Z",
        total_batches_completed: 0,
        total_games_completed: 0,
        last_heartbeat: "2026-04-23T00:00:05.000Z",
        last_error: null
      }
    ],
    log_path: "runtime/controller.ndjson",
    runtime_path: "runtime/state.json",
    lock_path: "runtime/controller.lock",
    pause_path: "runtime/pause",
    stop_path: "runtime/stop",
    warnings: [],
    recent_logs: [],
    ...overrides
  };
}

describe("sim diagnostics harness helpers", () => {
  it("classifies contract failures, fallbacks, and activeSeat=null occurrences", () => {
    const accumulator = createDiagnosticsAccumulator(createDescriptor());

    const contract = processDiagnosticsLine(
      accumulator,
      "stderr",
      JSON.stringify({
        ts: "2026-04-23T00:00:00.000Z",
        event: "decision_request_contract_failure",
        kind: "payload_validation",
        message: "actor mismatch; activeSeat=null"
      })
    );
    const fallback = processDiagnosticsLine(
      accumulator,
      "stderr",
      JSON.stringify({
        ts: "2026-04-23T00:00:01.000Z",
        event: "decision_fallback",
        requested_provider: "server_heuristic",
        provider_used: "local_heuristic"
      })
    );

    expect(contract?.classifications).toContain("decision_request_contract_failure");
    expect(contract?.classifications).toContain("payload_validation");
    expect(fallback?.classifications).toContain("fallback_used");
    expect(
      finalizeDiagnosticsSummary({
        accumulator,
        endedAt: accumulator.startedAt + 1000,
        exitCode: 0,
        exitSignal: null,
        stdoutPath: "stdout.log",
        stderrPath: "stderr.log",
        eventsPath: "events.ndjson"
      }).counters
    ).toMatchObject({
      decision_request_contract_failure: 1,
      payload_validation: 1,
      fallback_count: 1,
      active_seat_null_occurrences: 1
    });
  });

  it("detects telemetry failures, backoff suppression, and controller runtime anomalies", () => {
    const accumulator = createDiagnosticsAccumulator(
      createDescriptor({
        run_id: "controller-local-workers-low",
        label: "controller local workers 1",
        target: "controller",
        games_requested: null,
        games_per_batch: 1
      })
    );

    processDiagnosticsLine(
      accumulator,
      "stderr",
      JSON.stringify({
        ts: "2026-04-23T00:00:00.500Z",
        event: "telemetry_chosen_action_mismatch",
        failure_kind: "client_validation"
      })
    );
    processDiagnosticsLine(
      accumulator,
      "stderr",
      JSON.stringify({
        ts: "2026-04-23T00:00:00.000Z",
        event: "telemetry_failure",
        failure_kind: "network_failure",
        endpoint: "http://127.0.0.1:4310/api/telemetry/decision",
        diagnostics: [
          { event: "telemetry_transport_failed", request_kind: "telemetry_decision" }
        ]
      })
    );
    processDiagnosticsLine(
      accumulator,
      "stderr",
      JSON.stringify({
        ts: "2026-04-23T00:00:01.000Z",
        event: "telemetry_failure",
        failure_kind: "backoff_suppressed",
        endpoint: "http://127.0.0.1:4310/api/telemetry/decision",
        diagnostics: [
          { event: "telemetry_backoff_suppressed", request_kind: "telemetry_decision" }
        ]
      })
    );

    recordRuntimeSnapshot(
      accumulator,
      createRuntimeState({
        status: "stopped",
        pid: null,
        current_batch_started_at: "2026-04-23T00:00:02.000Z",
        last_batch_status: "running",
        workers: [
          {
            worker_id: "worker-01",
            controller_session_id: "session-1",
            status: "running",
            pid: null,
            current_batch_started_at: "2026-04-23T00:00:02.000Z",
            total_batches_completed: 0,
            total_games_completed: 0,
            last_heartbeat: "2026-04-23T00:00:05.000Z",
            last_error: null
          }
        ],
        worker_count: 1,
        running_worker_count: 1,
        last_shutdown_reason: "stale_recovery",
        warnings: ["Recovered stale simulator session from dead persisted controller state."]
      }),
      "2026-04-23T00:00:05.000Z"
    );

    const summary = finalizeDiagnosticsSummary({
      accumulator,
      endedAt: accumulator.startedAt + 2000,
      exitCode: 0,
      exitSignal: null,
      stdoutPath: "stdout.log",
      stderrPath: "stderr.log",
      eventsPath: "events.ndjson"
    });

    expect(summary.counters.telemetry_send_attempts).toBe(1);
    expect(summary.counters.telemetry_failure_count).toBe(2);
    expect(summary.counters.telemetry_chosen_action_mismatch).toBe(1);
    expect(summary.counters.telemetry_transport_failed).toBe(1);
    expect(summary.counters.telemetry_backoff_suppressed).toBe(1);
    expect(summary.runtime.stale_recovery_detected).toBe(true);
    expect(summary.runtime.anomalies).toContain("inactive_status_with_workers");
    expect(summary.runtime.anomalies).toContain("inactive_status_with_current_batch");
  });

  it("builds comparison output and highlights slower server_heuristic runs", () => {
    const localAccumulator = createDiagnosticsAccumulator(createDescriptor());
    processDiagnosticsLine(
      localAccumulator,
      "stdout",
      JSON.stringify({
        gamesPlayed: 2,
        handsPlayed: 2,
        decisionsRecorded: 100,
        eventsRecorded: 200,
        decisionsByPhase: {},
        eventsByPhase: {},
        providerUsage: { local_heuristic: 100 },
        fallbackCount: 0,
        errors: 0,
        averageGameDurationMs: 200,
        averageDecisionsPerHand: 50,
        exchangePhaseRecorded: true,
        passSelectRecorded: true,
        winCountsByTeam: { "team-0": 1, "team-1": 1, tie: 0 },
        totalScoreByTeam: { "team-0": 100, "team-1": 0 },
        averageScoreMargin: 50,
        passRate: 0.1,
        bombUsageRate: 0,
        wishSatisfactionRate: null,
        invalidDecisionCount: 0,
        telemetryDecisionFailures: 0,
        telemetryEventFailures: 0,
        telemetryFailuresTotal: 0,
        telemetryFailureByEndpoint: {},
        telemetryFailureByKind: {},
        telemetryBackoffUntil: null,
        averageLatencyByProvider: { local_heuristic: 1 }
      })
    );
    const localSummary = finalizeDiagnosticsSummary({
      accumulator: localAccumulator,
      endedAt: localAccumulator.startedAt + 1000,
      exitCode: 0,
      exitSignal: null,
      stdoutPath: "stdout.log",
      stderrPath: "stderr.log",
      eventsPath: "events.ndjson"
    });

    const serverAccumulator = createDiagnosticsAccumulator(
      createDescriptor({
        run_id: "run-2",
        label: "server_heuristic telemetry off",
        provider: "server_heuristic"
      })
    );
    processDiagnosticsLine(
      serverAccumulator,
      "stdout",
      JSON.stringify({
        gamesPlayed: 2,
        handsPlayed: 2,
        decisionsRecorded: 100,
        eventsRecorded: 200,
        decisionsByPhase: {},
        eventsByPhase: {},
        providerUsage: { server_heuristic: 100 },
        fallbackCount: 5,
        errors: 0,
        averageGameDurationMs: 500,
        averageDecisionsPerHand: 50,
        exchangePhaseRecorded: true,
        passSelectRecorded: true,
        winCountsByTeam: { "team-0": 1, "team-1": 1, tie: 0 },
        totalScoreByTeam: { "team-0": 80, "team-1": 20 },
        averageScoreMargin: 30,
        passRate: 0.1,
        bombUsageRate: 0,
        wishSatisfactionRate: null,
        invalidDecisionCount: 0,
        telemetryDecisionFailures: 0,
        telemetryEventFailures: 0,
        telemetryFailuresTotal: 0,
        telemetryFailureByEndpoint: {},
        telemetryFailureByKind: {},
        telemetryBackoffUntil: null,
        averageLatencyByProvider: { server_heuristic: 4 }
      })
    );
    const serverSummary = finalizeDiagnosticsSummary({
      accumulator: serverAccumulator,
      endedAt: serverAccumulator.startedAt + 3000,
      exitCode: 0,
      exitSignal: null,
      stdoutPath: "stdout.log",
      stderrPath: "stderr.log",
      eventsPath: "events.ndjson"
    });

    const comparison = buildDiagnosticsComparison(
      "diagnostics/sim-runs/session",
      [localSummary, serverSummary]
    );
    const report = renderDiagnosticsReport(
      "diagnostics/sim-runs/session",
      [localSummary, serverSummary],
      comparison
    );

    expect(comparison.total_runs).toBe(2);
    expect(comparison.comparisons.some((entry) => entry.metric === "games_per_sec")).toBe(true);
    expect(comparison.highlights.some((flag) => flag.code === "server_path_slowdown")).toBe(true);
    expect(report).toContain("server_heuristic telemetry off");
    expect(report).toContain("Provider Rollups");
  });

  it("writes stable machine-readable artifact files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-sim-diag-"));
    try {
      const accumulator = createDiagnosticsAccumulator(createDescriptor());
      processDiagnosticsLine(
        accumulator,
        "stdout",
        JSON.stringify({
          gamesPlayed: 1,
          handsPlayed: 1,
          decisionsRecorded: 10,
          eventsRecorded: 20,
          decisionsByPhase: {},
          eventsByPhase: {},
          providerUsage: { local_heuristic: 10 },
          fallbackCount: 0,
          errors: 0,
          averageGameDurationMs: 100,
          averageDecisionsPerHand: 10,
          exchangePhaseRecorded: true,
          passSelectRecorded: true,
          winCountsByTeam: { "team-0": 1, "team-1": 0, tie: 0 },
          totalScoreByTeam: { "team-0": 100, "team-1": 0 },
          averageScoreMargin: 100,
          passRate: 0,
          bombUsageRate: 0,
          wishSatisfactionRate: null,
          lastCompletedGameId: "selfplay-seed-game-000001",
          lastCompletedHandId: "selfplay-seed-game-000001-hand-1",
          lastCompletedMatchWinner: "team-0",
          lastCompletedMatchScore: { "team-0": 100, "team-1": 0 },
          invalidDecisionCount: 0,
          telemetryDecisionFailures: 0,
          telemetryEventFailures: 0,
          telemetryFailuresTotal: 0,
          telemetryFailureByEndpoint: {},
          telemetryFailureByKind: {},
          telemetryBackoffUntil: null,
          averageLatencyByProvider: { local_heuristic: 1 }
        })
      );
      const summary = finalizeDiagnosticsSummary({
        accumulator,
        endedAt: accumulator.startedAt + 500,
        exitCode: 0,
        exitSignal: null,
        stdoutPath: path.join(tempDir, "run-1", "stdout.log"),
        stderrPath: path.join(tempDir, "run-1", "stderr.log"),
        eventsPath: path.join(tempDir, "run-1", "events.ndjson")
      });
      fs.mkdirSync(path.join(tempDir, "run-1"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "run-1", "summary.json"),
        `${JSON.stringify(summary, null, 2)}\n`,
        "utf8"
      );

      const comparison = buildDiagnosticsComparison(tempDir, [summary]);
      const report = renderDiagnosticsReport(tempDir, [summary], comparison);
      const artifacts = writeDiagnosticsSessionArtifacts({
        sessionRoot: tempDir,
        summaries: [summary],
        comparison,
        reportMarkdown: report
      });

      expect(fs.existsSync(artifacts.indexPath)).toBe(true);
      expect(fs.existsSync(artifacts.comparisonPath)).toBe(true);
      expect(fs.existsSync(artifacts.reportPath)).toBe(true);
      expect(
        JSON.parse(fs.readFileSync(artifacts.indexPath, "utf8"))
      ).toMatchObject({
        runs: [
          {
            run_id: "run-1"
          }
        ]
      });
      expect(
        JSON.parse(fs.readFileSync(artifacts.comparisonPath, "utf8"))
      ).toMatchObject({
        total_runs: 1
      });
      expect(fs.readFileSync(artifacts.reportPath, "utf8")).toContain(
        "Simulator Diagnostics Report"
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
