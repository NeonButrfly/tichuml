import fs from "node:fs";
import path from "node:path";
import type { SimControllerRuntimeState } from "@tichuml/shared";
import type { SelfPlayBatchSummary } from "./self-play-batch.js";

export type DiagnosticsRunTarget = "oneshot" | "controller";
export type DiagnosticsStream =
  | "stdout"
  | "stderr"
  | "runtime"
  | "controller_log"
  | "meta";

export type DiagnosticsFlag = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
};

export type DiagnosticsRunDescriptor = {
  run_id: string;
  label: string;
  target: DiagnosticsRunTarget;
  provider: "local" | "server_heuristic" | "lightgbm_model";
  telemetry_enabled: boolean;
  telemetry_mode: "minimal" | "full";
  server_fallback_enabled: boolean;
  worker_count: number;
  games_requested: number | null;
  games_per_batch: number | null;
  backend_url: string | null;
  command: {
    executable: string;
    args: string[];
    display: string;
  };
  resolved_config: Record<string, unknown>;
  seed: {
    mode: string;
    resolved_run_seed: string;
    derivation_namespace: string;
    manual_override_enabled: boolean;
    manual_override_seed: string | null;
    generated_at: string;
    entropy_game_id: string | null;
    audit_hash_hex: string | null;
    primary_provider: string | null;
    local_fallback_used: boolean | null;
    source_summary: Record<string, unknown> | null;
  };
  backend_preflight?: {
    checked_at: string;
    ok: boolean;
    status: number | null;
    detail: string;
  };
};

export type DiagnosticsPerfAggregate = {
  count: number;
  total_ms: number;
  average_ms: number;
  max_ms: number;
};

export type DiagnosticsSummary = {
  run_id: string;
  label: string;
  target: DiagnosticsRunTarget;
  provider: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  duration_seconds: number;
  command: DiagnosticsRunDescriptor["command"];
  resolved_config: Record<string, unknown>;
  backend_preflight?: DiagnosticsRunDescriptor["backend_preflight"];
  provider_config: {
    telemetry_enabled: boolean;
    telemetry_mode: string;
    server_fallback_enabled: boolean;
    worker_count: number;
    games_requested: number | null;
    games_per_batch: number | null;
    backend_url: string | null;
  };
  seed: DiagnosticsRunDescriptor["seed"];
  process: {
    exit_code: number | null;
    exit_signal: string | null;
  };
  totals: {
    games_requested: number | null;
    games_completed: number;
    decisions_requested: number;
    events_recorded: number;
    errors: number;
    batches_started: number;
    batches_completed: number;
  };
  throughput: {
    games_per_sec: number;
    decisions_per_sec: number;
  };
  counters: {
    decision_request_contract_failure: number;
    payload_validation: number;
    fallback_count: number;
    fallback_rate: number;
    decision_provider_failures: number;
    telemetry_send_attempts: number;
    telemetry_success_count: number;
    telemetry_failure_count: number;
    telemetry_failure_rate: number;
    telemetry_backoff_suppressed: number;
    telemetry_oversize_downgraded: number;
    telemetry_oversize_skipped: number;
    active_seat_null_occurrences: number;
    canonical_active_seat_failures: number;
    stale_runtime_anomalies: number;
    repeated_log_count: number;
  };
  telemetry: {
    failure_by_kind: Record<string, number>;
    failure_by_endpoint: Record<string, number>;
  };
  runtime: {
    final_status: string | null;
    final_worker_count: number;
    final_running_worker_count: number;
    final_current_batch_active: boolean;
    stale_recovery_detected: boolean;
    max_live_workers_seen: number;
    last_runtime_path: string | null;
    anomalies: string[];
  };
  perf: {
    by_stage: Record<string, DiagnosticsPerfAggregate>;
  };
  repeated_log_signatures: Array<{
    signature: string;
    count: number;
    sample: string;
    classifications: string[];
  }>;
  flags: DiagnosticsFlag[];
  clean: boolean;
  degraded: boolean;
  stdout_path: string;
  stderr_path: string;
  events_path: string;
  runtime_path: string | null;
  log_path: string | null;
  aggregate_summary: SelfPlayBatchSummary | null;
};

export type DiagnosticsComparison = {
  generated_at: string;
  session_root: string;
  total_runs: number;
  thresholds: {
    fallback_rate_warn: number;
    telemetry_failure_rate_warn: number;
    slowdown_ratio_warn: number;
  };
  runs: Array<{
    run_id: string;
    label: string;
    provider: string;
    target: DiagnosticsRunTarget;
    telemetry_enabled: boolean;
    telemetry_mode: string;
    duration_ms: number;
    games_completed: number;
    decisions_requested: number;
    games_per_sec: number;
    decisions_per_sec: number;
    contract_failure_count: number;
    fallback_rate: number;
    telemetry_failure_rate: number;
    active_seat_null_occurrences: number;
    repeated_log_count: number;
    clean: boolean;
    degraded: boolean;
    flags: DiagnosticsFlag[];
  }>;
  provider_rollups: Record<
    string,
    {
      runs: number;
      average_games_per_sec: number;
      average_decisions_per_sec: number;
      average_fallback_rate: number;
      average_telemetry_failure_rate: number;
      active_seat_null_runs: number;
      degraded_runs: number;
    }
  >;
  comparisons: Array<{
    profile: string;
    left_run_id: string;
    right_run_id: string;
    left_provider: string;
    right_provider: string;
    metric: "games_per_sec" | "decisions_per_sec" | "fallback_rate" | "telemetry_failure_rate";
    left_value: number;
    right_value: number;
    delta: number;
    delta_ratio: number | null;
  }>;
  highlights: DiagnosticsFlag[];
};

export type DiagnosticsAccumulator = {
  descriptor: DiagnosticsRunDescriptor;
  startedAt: number;
  parsedSummary: SelfPlayBatchSummary | null;
  controllerSummary: SelfPlayBatchSummary | null;
  totals: {
    batchesStarted: number;
    batchesCompleted: number;
    maxLiveWorkersSeen: number;
  };
  counters: {
    decision_request_contract_failure: number;
    payload_validation: number;
    fallback_count: number;
    decision_provider_failures: number;
    telemetry_send_attempts: number;
    telemetry_success_count: number;
    telemetry_failure_count: number;
    telemetry_backoff_suppressed: number;
    telemetry_oversize_downgraded: number;
    telemetry_oversize_skipped: number;
    active_seat_null_occurrences: number;
    canonical_active_seat_failures: number;
    stale_runtime_anomalies: number;
  };
  telemetryFailureByKind: Record<string, number>;
  telemetryFailureByEndpoint: Record<string, number>;
  signatureCounts: Map<
    string,
    { count: number; sample: string; classifications: Set<string> }
  >;
  perfByStage: Record<string, { count: number; totalMs: number; maxMs: number }>;
  runtime: {
    finalState: SimControllerRuntimeState | null;
    anomalies: Set<string>;
    staleRecoveryDetected: boolean;
    runtimePath: string | null;
    logPath: string | null;
  };
};

type DiagnosticsEventPayload = Record<string, unknown>;

function roundNumber(value: number, digits = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

function normalizeTextSignature(line: string): string {
  return line
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/gu, "<ts>")
    .replace(/\bpid=\d+\b/gu, "pid=<n>")
    .replace(/\b\d+\b/gu, "<n>")
    .trim();
}

function normalizeMessageSignature(message: string | null): string | null {
  if (!message) {
    return null;
  }
  return normalizeTextSignature(message).slice(0, 200);
}

function buildSignature(
  payload: unknown,
  line: string,
  classifications: string[]
): string {
  if (isPlainObject(payload)) {
    const signature = {
      event: typeof payload.event === "string" ? payload.event : null,
      kind: typeof payload.kind === "string" ? payload.kind : null,
      failure_kind:
        typeof payload.failure_kind === "string" ? payload.failure_kind : null,
      request_kind:
        typeof payload.request_kind === "string" ? payload.request_kind : null,
      provider_used:
        typeof payload.provider_used === "string" ? payload.provider_used : null,
      requested_provider:
        typeof payload.requested_provider === "string"
          ? payload.requested_provider
          : null,
      message:
        typeof payload.message === "string"
          ? normalizeMessageSignature(payload.message)
          : null,
      classifications
    };
    return JSON.stringify(signature);
  }
  return JSON.stringify({
    raw: normalizeTextSignature(line),
    classifications
  });
}

function cloneBatchSummary(summary: SelfPlayBatchSummary): SelfPlayBatchSummary {
  return JSON.parse(JSON.stringify(summary)) as SelfPlayBatchSummary;
}

function createEmptyBatchSummary(): SelfPlayBatchSummary {
  return {
    gamesPlayed: 0,
    handsPlayed: 0,
    decisionsRecorded: 0,
    eventsRecorded: 0,
    decisionsByPhase: {},
    eventsByPhase: {},
    providerUsage: {},
    fallbackCount: 0,
    errors: 0,
    averageGameDurationMs: 0,
    averageDecisionsPerHand: 0,
    exchangePhaseRecorded: false,
    passSelectRecorded: false,
    winCountsByTeam: {
      "team-0": 0,
      "team-1": 0,
      tie: 0
    },
    totalScoreByTeam: {
      "team-0": 0,
      "team-1": 0
    },
    averageScoreMargin: 0,
    passRate: 0,
    bombUsageRate: 0,
    wishSatisfactionRate: null,
    invalidDecisionCount: 0,
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {},
    telemetryFailureByKind: {},
    telemetryBackoffUntil: null,
    averageLatencyByProvider: {}
  };
}

function mergeCounts(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function mergeBatchSummary(
  target: SelfPlayBatchSummary,
  source: SelfPlayBatchSummary
): void {
  target.gamesPlayed += source.gamesPlayed;
  target.handsPlayed += source.handsPlayed;
  target.decisionsRecorded += source.decisionsRecorded;
  target.eventsRecorded += source.eventsRecorded;
  target.fallbackCount += source.fallbackCount;
  target.errors += source.errors;
  target.invalidDecisionCount += source.invalidDecisionCount;
  target.telemetryDecisionFailures += source.telemetryDecisionFailures;
  target.telemetryEventFailures += source.telemetryEventFailures;
  target.telemetryFailuresTotal += source.telemetryFailuresTotal;
  target.exchangePhaseRecorded =
    target.exchangePhaseRecorded || source.exchangePhaseRecorded;
  target.passSelectRecorded =
    target.passSelectRecorded || source.passSelectRecorded;
  target.telemetryBackoffUntil =
    source.telemetryBackoffUntil ?? target.telemetryBackoffUntil;
  mergeCounts(target.decisionsByPhase, source.decisionsByPhase);
  mergeCounts(target.eventsByPhase, source.eventsByPhase);
  mergeCounts(target.providerUsage, source.providerUsage);
  mergeCounts(target.winCountsByTeam, source.winCountsByTeam);
  mergeCounts(target.totalScoreByTeam, source.totalScoreByTeam);
  mergeCounts(
    target.telemetryFailureByEndpoint,
    source.telemetryFailureByEndpoint
  );
  mergeCounts(target.telemetryFailureByKind, source.telemetryFailureByKind);
}

function classifyActiveSeatNull(line: string): boolean {
  return /activeSeat["=:\s]+null/iu.test(line);
}

function classifyCanonicalActiveSeatFailure(line: string): boolean {
  return /actor mismatch|canonical active seat|actor_seat=.*canonical/iu.test(line);
}

function isSelfPlayBatchSummary(value: unknown): value is SelfPlayBatchSummary {
  return (
    isPlainObject(value) &&
    typeof value.gamesPlayed === "number" &&
    typeof value.decisionsRecorded === "number" &&
    typeof value.eventsRecorded === "number"
  );
}

export function detectRuntimeAnomalies(
  state: SimControllerRuntimeState
): string[] {
  const anomalies: string[] = [];
  const activeStatuses = new Set([
    "starting",
    "running",
    "pausing",
    "paused",
    "stopping"
  ]);
  const live = activeStatuses.has(state.status);
  const workers = state.workers ?? [];
  if (live && state.pid === null) {
    anomalies.push("live_status_without_pid");
  }
  if (!live && workers.length > 0) {
    anomalies.push("inactive_status_with_workers");
  }
  if (!live && state.current_batch_started_at !== null) {
    anomalies.push("inactive_status_with_current_batch");
  }
  if (!live && state.last_batch_status === "running") {
    anomalies.push("inactive_status_with_running_last_batch");
  }
  if (!live && state.active_run_seed !== null) {
    anomalies.push("inactive_status_with_active_seed");
  }
  if (state.worker_count !== workers.length) {
    anomalies.push("worker_count_mismatch");
  }
  const runningWorkers = workers.filter((worker) => worker.status === "running");
  if (state.running_worker_count !== runningWorkers.length) {
    anomalies.push("running_worker_count_mismatch");
  }
  if (
    state.controller_session_id !== null &&
    workers.some(
      (worker) => worker.controller_session_id !== state.controller_session_id
    )
  ) {
    anomalies.push("worker_session_mismatch");
  }
  if (
    state.controller_session_id === null &&
    workers.some((worker) => worker.controller_session_id !== null)
  ) {
    anomalies.push("workers_without_live_session");
  }
  return anomalies;
}

export function createDiagnosticsAccumulator(
  descriptor: DiagnosticsRunDescriptor
): DiagnosticsAccumulator {
  return {
    descriptor,
    startedAt: Date.now(),
    parsedSummary: null,
    controllerSummary: null,
    totals: {
      batchesStarted: 0,
      batchesCompleted: 0,
      maxLiveWorkersSeen: 0
    },
    counters: {
      decision_request_contract_failure: 0,
      payload_validation: 0,
      fallback_count: 0,
      decision_provider_failures: 0,
      telemetry_send_attempts: 0,
      telemetry_success_count: 0,
      telemetry_failure_count: 0,
      telemetry_backoff_suppressed: 0,
      telemetry_oversize_downgraded: 0,
      telemetry_oversize_skipped: 0,
      active_seat_null_occurrences: 0,
      canonical_active_seat_failures: 0,
      stale_runtime_anomalies: 0
    },
    telemetryFailureByKind: {},
    telemetryFailureByEndpoint: {},
    signatureCounts: new Map(),
    perfByStage: {},
    runtime: {
      finalState: null,
      anomalies: new Set(),
      staleRecoveryDetected: false,
      runtimePath: null,
      logPath: null
    }
  };
}

function countByKey(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function updateTelemetryDiagnostics(
  accumulator: DiagnosticsAccumulator,
  diagnostics: unknown[],
  options: { countFailureAttempts: boolean }
): string[] {
  const classifications: string[] = [];
  for (const diagnostic of diagnostics) {
    if (!isPlainObject(diagnostic) || typeof diagnostic.event !== "string") {
      continue;
    }
    switch (diagnostic.event) {
      case "telemetry_posted":
        accumulator.counters.telemetry_send_attempts += 1;
        accumulator.counters.telemetry_success_count += 1;
        classifications.push("telemetry_success");
        break;
      case "telemetry_transport_failed":
      case "telemetry_backend_rejected":
      case "telemetry_client_validation_failed":
        if (options.countFailureAttempts) {
          accumulator.counters.telemetry_send_attempts += 1;
        }
        classifications.push("telemetry_failure");
        break;
      case "telemetry_backoff_suppressed":
        accumulator.counters.telemetry_backoff_suppressed += 1;
        classifications.push("telemetry_backoff_suppressed");
        break;
      case "telemetry_payload_downgraded":
      case "telemetry_payload_trimmed":
        accumulator.counters.telemetry_oversize_downgraded += 1;
        classifications.push("telemetry_payload_downgraded");
        break;
      case "telemetry_payload_skipped":
        accumulator.counters.telemetry_oversize_skipped += 1;
        classifications.push("telemetry_payload_skipped");
        break;
      default:
        break;
    }
  }
  return classifications;
}

export function processDiagnosticsLine(
  accumulator: DiagnosticsAccumulator,
  stream: DiagnosticsStream,
  line: string
): {
  eventRecord: Record<string, unknown>;
  classifications: string[];
} | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const classifications: string[] = [];
  if (classifyActiveSeatNull(trimmed)) {
    accumulator.counters.active_seat_null_occurrences += 1;
    classifications.push("active_seat_null");
  }
  if (classifyCanonicalActiveSeatFailure(trimmed)) {
    accumulator.counters.canonical_active_seat_failures += 1;
    classifications.push("canonical_active_seat_failure");
  }

  const parsed = parseJsonLine(trimmed);
  if (isSelfPlayBatchSummary(parsed)) {
    accumulator.parsedSummary = cloneBatchSummary(parsed);
    classifications.push("batch_summary");
  }

  if (isPlainObject(parsed) && typeof parsed.event === "string") {
    switch (parsed.event) {
      case "decision_request_contract_failure":
        accumulator.counters.decision_request_contract_failure += 1;
        classifications.push("decision_request_contract_failure");
        if (parsed.kind === "payload_validation") {
          accumulator.counters.payload_validation += 1;
          classifications.push("payload_validation");
        }
        break;
      case "decision_backend_validation_failure":
        classifications.push("decision_backend_validation_failure");
        if (parsed.kind === "payload_validation") {
          accumulator.counters.payload_validation += 1;
          classifications.push("payload_validation");
        }
        break;
      case "decision_provider_failure":
        accumulator.counters.decision_provider_failures += 1;
        classifications.push("decision_provider_failure");
        break;
      case "decision_fallback":
        accumulator.counters.fallback_count += 1;
        classifications.push("fallback_used");
        break;
      case "telemetry_failure":
        accumulator.counters.telemetry_failure_count += 1;
        classifications.push("telemetry_failure");
        if (typeof parsed.failure_kind === "string") {
          countByKey(accumulator.telemetryFailureByKind, parsed.failure_kind);
          if (parsed.failure_kind !== "backoff_suppressed") {
            accumulator.counters.telemetry_send_attempts += 1;
          }
          if (parsed.failure_kind === "client_validation") {
            accumulator.counters.payload_validation += 1;
            classifications.push("payload_validation");
          }
        }
        if (typeof parsed.endpoint === "string") {
          countByKey(accumulator.telemetryFailureByEndpoint, parsed.endpoint);
        }
        if (Array.isArray(parsed.diagnostics)) {
          classifications.push(
            ...updateTelemetryDiagnostics(accumulator, parsed.diagnostics, {
              countFailureAttempts: false
            })
          );
        } else if (parsed.failure_kind === "backoff_suppressed") {
          accumulator.counters.telemetry_backoff_suppressed += 1;
        }
        break;
      case "telemetry_posted":
        accumulator.counters.telemetry_send_attempts += 1;
        accumulator.counters.telemetry_success_count += 1;
        classifications.push("telemetry_success");
        break;
      case "telemetry_payload_downgraded":
      case "telemetry_payload_trimmed":
        accumulator.counters.telemetry_oversize_downgraded += 1;
        classifications.push("telemetry_payload_downgraded");
        break;
      case "telemetry_payload_skipped":
        accumulator.counters.telemetry_oversize_skipped += 1;
        classifications.push("telemetry_payload_skipped");
        break;
      case "telemetry_backoff_suppressed":
        accumulator.counters.telemetry_backoff_suppressed += 1;
        classifications.push("telemetry_backoff_suppressed");
        break;
      case "telemetry_chosen_action_mismatch":
        accumulator.counters.payload_validation += 1;
        classifications.push("payload_validation");
        break;
      case "diagnostic_timing":
        if (
          typeof parsed.stage === "string" &&
          typeof parsed.duration_ms === "number"
        ) {
          const bucket = accumulator.perfByStage[parsed.stage] ?? {
            count: 0,
            totalMs: 0,
            maxMs: 0
          };
          bucket.count += 1;
          bucket.totalMs += parsed.duration_ms;
          bucket.maxMs = Math.max(bucket.maxMs, parsed.duration_ms);
          accumulator.perfByStage[parsed.stage] = bucket;
          classifications.push("diagnostic_timing");
        }
        break;
      case "batch_start":
        accumulator.totals.batchesStarted += 1;
        classifications.push("batch_start");
        break;
      case "batch_end":
        accumulator.totals.batchesCompleted += 1;
        classifications.push("batch_end");
        if (isSelfPlayBatchSummary(parsed.summary)) {
          accumulator.controllerSummary ??= createEmptyBatchSummary();
          mergeBatchSummary(accumulator.controllerSummary, parsed.summary);
        }
        break;
      case "worker_error":
      case "controller_stop":
      case "controller_start":
        classifications.push(parsed.event);
        break;
      default:
        break;
    }
  }

  const signature = buildSignature(parsed, trimmed, classifications);
  const signatureEntry = accumulator.signatureCounts.get(signature) ?? {
    count: 0,
    sample: trimmed,
    classifications: new Set<string>()
  };
  signatureEntry.count += 1;
  for (const classification of classifications) {
    signatureEntry.classifications.add(classification);
  }
  accumulator.signatureCounts.set(signature, signatureEntry);

  return {
    eventRecord: {
      ts: new Date().toISOString(),
      stream,
      raw_line: trimmed,
      ...(parsed !== null ? { parsed } : {}),
      ...(classifications.length > 0 ? { classifications } : {}),
      signature
    },
    classifications
  };
}

export function recordRuntimeSnapshot(
  accumulator: DiagnosticsAccumulator,
  state: SimControllerRuntimeState,
  observedAt: string
): Record<string, unknown> {
  const anomalies = detectRuntimeAnomalies(state);
  for (const anomaly of anomalies) {
    accumulator.runtime.anomalies.add(anomaly);
  }
  accumulator.counters.stale_runtime_anomalies += anomalies.length;
  accumulator.runtime.finalState = state;
  accumulator.runtime.runtimePath = state.runtime_path ?? accumulator.runtime.runtimePath;
  accumulator.runtime.logPath = state.log_path ?? accumulator.runtime.logPath;
  accumulator.runtime.staleRecoveryDetected =
    accumulator.runtime.staleRecoveryDetected ||
    state.last_shutdown_reason === "stale_recovery" ||
    state.warnings.some((warning) => /stale simulator session/iu.test(warning));
  accumulator.totals.maxLiveWorkersSeen = Math.max(
    accumulator.totals.maxLiveWorkersSeen,
    state.worker_count
  );
  return {
    ts: observedAt,
    stream: "runtime",
    event: "runtime_snapshot",
    status: state.status,
    worker_count: state.worker_count,
    running_worker_count: state.running_worker_count,
    current_batch_started_at: state.current_batch_started_at,
    heartbeat_stale: state.heartbeat_stale,
    last_shutdown_reason: state.last_shutdown_reason,
    active_run_seed: state.active_run_seed?.resolved_run_seed ?? null,
    anomalies
  };
}

export function finalizeDiagnosticsSummary(config: {
  accumulator: DiagnosticsAccumulator;
  endedAt: number;
  exitCode: number | null;
  exitSignal: string | null;
  stdoutPath: string;
  stderrPath: string;
  eventsPath: string;
}): DiagnosticsSummary {
  const { accumulator } = config;
  const startedAt = accumulator.startedAt;
  const durationMs = Math.max(0, config.endedAt - startedAt);
  const batchSummary =
    accumulator.parsedSummary ?? accumulator.controllerSummary ?? null;
  const gamesCompleted = batchSummary?.gamesPlayed ?? 0;
  const decisionsRequested = batchSummary?.decisionsRecorded ?? 0;
  const eventsRecorded = batchSummary?.eventsRecorded ?? 0;
  const errors = batchSummary?.errors ?? 0;
  const fallbackCount = Math.max(
    accumulator.counters.fallback_count,
    batchSummary?.fallbackCount ?? 0
  );
  const fallbackRate =
    decisionsRequested > 0 ? fallbackCount / decisionsRequested : 0;
  const telemetryFailureRate =
    accumulator.counters.telemetry_send_attempts > 0
      ? accumulator.counters.telemetry_failure_count /
        accumulator.counters.telemetry_send_attempts
      : 0;
  const repeatedLogSignatures = [...accumulator.signatureCounts.entries()]
    .map(([signature, entry]) => ({
      signature,
      count: entry.count,
      sample: entry.sample,
      classifications: [...entry.classifications].sort()
    }))
    .sort((left, right) => right.count - left.count || left.signature.localeCompare(right.signature));
  const repeatedLogCount = repeatedLogSignatures.reduce(
    (sum, entry) => sum + Math.max(0, entry.count - 1),
    0
  );
  const perfByStage = Object.fromEntries(
    Object.entries(accumulator.perfByStage)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stage, value]) => [
        stage,
        {
          count: value.count,
          total_ms: roundNumber(value.totalMs, 2),
          average_ms: roundNumber(value.totalMs / Math.max(1, value.count), 2),
          max_ms: roundNumber(value.maxMs, 2)
        }
      ])
  ) as Record<string, DiagnosticsPerfAggregate>;

  const runtimeFinalState = accumulator.runtime.finalState;
  const runtimeAnomalies = [...accumulator.runtime.anomalies].sort();
  const flags: DiagnosticsFlag[] = [];
  if (config.exitCode !== null && config.exitCode !== 0) {
    flags.push({
      code: "non_zero_exit",
      severity: "error",
      message: `Process exited with code ${config.exitCode}.`
    });
  }
  if (config.exitSignal) {
    flags.push({
      code: "exit_signal",
      severity: "warn",
      message: `Process exited with signal ${config.exitSignal}.`
    });
  }
  if (accumulator.counters.active_seat_null_occurrences > 0) {
    flags.push({
      code: "active_seat_null",
      severity: "error",
      message: `Observed ${accumulator.counters.active_seat_null_occurrences} activeSeat=null occurrence(s).`
    });
  }
  if (accumulator.counters.canonical_active_seat_failures > 0) {
    flags.push({
      code: "canonical_active_seat_failure",
      severity: "error",
      message: `Observed ${accumulator.counters.canonical_active_seat_failures} canonical active-seat failure(s).`
    });
  }
  if (accumulator.counters.decision_request_contract_failure > 0) {
    flags.push({
      code: "decision_request_contract_failure",
      severity: "warn",
      message: `Observed ${accumulator.counters.decision_request_contract_failure} decision contract failure(s).`
    });
  }
  if (fallbackRate > 0.05) {
    flags.push({
      code: "fallback_rate_high",
      severity: "warn",
      message: `Fallback rate ${roundNumber(fallbackRate * 100, 2)}% exceeded the 5% warning threshold.`
    });
  }
  if (telemetryFailureRate > 0.1) {
    flags.push({
      code: "telemetry_failure_rate_high",
      severity: "warn",
      message: `Telemetry failure rate ${roundNumber(telemetryFailureRate * 100, 2)}% exceeded the 10% warning threshold.`
    });
  }
  if (runtimeAnomalies.length > 0) {
    flags.push({
      code: "runtime_anomalies",
      severity: "warn",
      message: `Observed runtime anomalies: ${runtimeAnomalies.join(", ")}.`
    });
  }
  if (errors > 0) {
    flags.push({
      code: "game_errors",
      severity: "warn",
      message: `Run recorded ${errors} game error(s).`
    });
  }

  const clean =
    (config.exitCode === null || config.exitCode === 0) &&
    accumulator.counters.active_seat_null_occurrences === 0 &&
    accumulator.counters.canonical_active_seat_failures === 0 &&
    accumulator.counters.decision_request_contract_failure === 0 &&
    errors === 0 &&
    runtimeAnomalies.length === 0 &&
    telemetryFailureRate === 0;

  return {
    run_id: accumulator.descriptor.run_id,
    label: accumulator.descriptor.label,
    target: accumulator.descriptor.target,
    provider: accumulator.descriptor.provider,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(config.endedAt).toISOString(),
    duration_ms: durationMs,
    duration_seconds: roundNumber(durationMs / 1000, 3),
    command: accumulator.descriptor.command,
    resolved_config: accumulator.descriptor.resolved_config,
    ...(accumulator.descriptor.backend_preflight
      ? { backend_preflight: accumulator.descriptor.backend_preflight }
      : {}),
    provider_config: {
      telemetry_enabled: accumulator.descriptor.telemetry_enabled,
      telemetry_mode: accumulator.descriptor.telemetry_mode,
      server_fallback_enabled: accumulator.descriptor.server_fallback_enabled,
      worker_count: accumulator.descriptor.worker_count,
      games_requested: accumulator.descriptor.games_requested,
      games_per_batch: accumulator.descriptor.games_per_batch,
      backend_url: accumulator.descriptor.backend_url
    },
    seed: accumulator.descriptor.seed,
    process: {
      exit_code: config.exitCode,
      exit_signal: config.exitSignal
    },
    totals: {
      games_requested:
        accumulator.descriptor.games_requested ??
        (accumulator.descriptor.games_per_batch !== null
          ? accumulator.totals.batchesStarted *
            accumulator.descriptor.games_per_batch
          : null),
      games_completed: gamesCompleted,
      decisions_requested: decisionsRequested,
      events_recorded: eventsRecorded,
      errors,
      batches_started: accumulator.totals.batchesStarted,
      batches_completed: accumulator.totals.batchesCompleted
    },
    throughput: {
      games_per_sec:
        durationMs > 0 ? roundNumber((gamesCompleted * 1000) / durationMs, 4) : 0,
      decisions_per_sec:
        durationMs > 0
          ? roundNumber((decisionsRequested * 1000) / durationMs, 4)
          : 0
    },
    counters: {
      decision_request_contract_failure:
        accumulator.counters.decision_request_contract_failure,
      payload_validation: accumulator.counters.payload_validation,
      fallback_count: fallbackCount,
      fallback_rate: roundNumber(fallbackRate, 4),
      decision_provider_failures: accumulator.counters.decision_provider_failures,
      telemetry_send_attempts: accumulator.counters.telemetry_send_attempts,
      telemetry_success_count: accumulator.counters.telemetry_success_count,
      telemetry_failure_count: accumulator.counters.telemetry_failure_count,
      telemetry_failure_rate: roundNumber(telemetryFailureRate, 4),
      telemetry_backoff_suppressed:
        accumulator.counters.telemetry_backoff_suppressed,
      telemetry_oversize_downgraded:
        accumulator.counters.telemetry_oversize_downgraded,
      telemetry_oversize_skipped:
        accumulator.counters.telemetry_oversize_skipped,
      active_seat_null_occurrences:
        accumulator.counters.active_seat_null_occurrences,
      canonical_active_seat_failures:
        accumulator.counters.canonical_active_seat_failures,
      stale_runtime_anomalies: accumulator.counters.stale_runtime_anomalies,
      repeated_log_count: repeatedLogCount
    },
    telemetry: {
      failure_by_kind: accumulator.telemetryFailureByKind,
      failure_by_endpoint: accumulator.telemetryFailureByEndpoint
    },
    runtime: {
      final_status: runtimeFinalState?.status ?? null,
      final_worker_count: runtimeFinalState?.worker_count ?? 0,
      final_running_worker_count: runtimeFinalState?.running_worker_count ?? 0,
      final_current_batch_active:
        runtimeFinalState?.current_batch_started_at !== null,
      stale_recovery_detected: accumulator.runtime.staleRecoveryDetected,
      max_live_workers_seen: accumulator.totals.maxLiveWorkersSeen,
      last_runtime_path: accumulator.runtime.runtimePath,
      anomalies: runtimeAnomalies
    },
    perf: {
      by_stage: perfByStage
    },
    repeated_log_signatures: repeatedLogSignatures,
    flags,
    clean,
    degraded: !clean || flags.length > 0,
    stdout_path: config.stdoutPath,
    stderr_path: config.stderrPath,
    events_path: config.eventsPath,
    runtime_path: accumulator.runtime.runtimePath,
    log_path: accumulator.runtime.logPath,
    aggregate_summary: batchSummary
  };
}

function makeProfileKey(summary: DiagnosticsSummary): string {
  return [
    summary.target,
    summary.provider_config.telemetry_enabled ? "telemetry-on" : "telemetry-off",
    summary.provider_config.telemetry_mode,
    summary.provider_config.server_fallback_enabled
      ? "fallback-on"
      : "fallback-off",
    `workers-${summary.provider_config.worker_count}`
  ].join("|");
}

function buildProviderRollups(
  summaries: DiagnosticsSummary[]
): DiagnosticsComparison["provider_rollups"] {
  const bucket = new Map<
    string,
    {
      runs: number;
      gamesPerSec: number;
      decisionsPerSec: number;
      fallbackRate: number;
      telemetryFailureRate: number;
      activeSeatNullRuns: number;
      degradedRuns: number;
    }
  >();

  for (const summary of summaries) {
    const current = bucket.get(summary.provider) ?? {
      runs: 0,
      gamesPerSec: 0,
      decisionsPerSec: 0,
      fallbackRate: 0,
      telemetryFailureRate: 0,
      activeSeatNullRuns: 0,
      degradedRuns: 0
    };
    current.runs += 1;
    current.gamesPerSec += summary.throughput.games_per_sec;
    current.decisionsPerSec += summary.throughput.decisions_per_sec;
    current.fallbackRate += summary.counters.fallback_rate;
    current.telemetryFailureRate += summary.counters.telemetry_failure_rate;
    current.activeSeatNullRuns +=
      summary.counters.active_seat_null_occurrences > 0 ? 1 : 0;
    current.degradedRuns += summary.degraded ? 1 : 0;
    bucket.set(summary.provider, current);
  }

  return Object.fromEntries(
    [...bucket.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([provider, value]) => [
        provider,
        {
          runs: value.runs,
          average_games_per_sec: roundNumber(value.gamesPerSec / value.runs, 4),
          average_decisions_per_sec: roundNumber(
            value.decisionsPerSec / value.runs,
            4
          ),
          average_fallback_rate: roundNumber(value.fallbackRate / value.runs, 4),
          average_telemetry_failure_rate: roundNumber(
            value.telemetryFailureRate / value.runs,
            4
          ),
          active_seat_null_runs: value.activeSeatNullRuns,
          degraded_runs: value.degradedRuns
        }
      ])
  );
}

export function buildDiagnosticsComparison(
  sessionRoot: string,
  summaries: DiagnosticsSummary[]
): DiagnosticsComparison {
  const runs = summaries
    .map((summary) => ({
      run_id: summary.run_id,
      label: summary.label,
      provider: summary.provider,
      target: summary.target,
      telemetry_enabled: summary.provider_config.telemetry_enabled,
      telemetry_mode: summary.provider_config.telemetry_mode,
      duration_ms: summary.duration_ms,
      games_completed: summary.totals.games_completed,
      decisions_requested: summary.totals.decisions_requested,
      games_per_sec: summary.throughput.games_per_sec,
      decisions_per_sec: summary.throughput.decisions_per_sec,
      contract_failure_count:
        summary.counters.decision_request_contract_failure,
      fallback_rate: summary.counters.fallback_rate,
      telemetry_failure_rate: summary.counters.telemetry_failure_rate,
      active_seat_null_occurrences:
        summary.counters.active_seat_null_occurrences,
      repeated_log_count: summary.counters.repeated_log_count,
      clean: summary.clean,
      degraded: summary.degraded,
      flags: summary.flags
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const comparisons: DiagnosticsComparison["comparisons"] = [];
  const byProfile = new Map<string, DiagnosticsSummary[]>();
  for (const summary of summaries) {
    const profile = makeProfileKey(summary);
    const bucket = byProfile.get(profile) ?? [];
    bucket.push(summary);
    byProfile.set(profile, bucket);
  }

  for (const [profile, bucket] of [...byProfile.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const local = bucket.find((entry) => entry.provider === "local");
    const server = bucket.find((entry) => entry.provider === "server_heuristic");
    if (!local || !server) {
      continue;
    }
    for (const metric of [
      "games_per_sec",
      "decisions_per_sec",
      "fallback_rate",
      "telemetry_failure_rate"
    ] as const) {
      const leftValue =
        metric === "games_per_sec"
          ? server.throughput.games_per_sec
          : metric === "decisions_per_sec"
            ? server.throughput.decisions_per_sec
            : metric === "fallback_rate"
              ? server.counters.fallback_rate
              : server.counters.telemetry_failure_rate;
      const rightValue =
        metric === "games_per_sec"
          ? local.throughput.games_per_sec
          : metric === "decisions_per_sec"
            ? local.throughput.decisions_per_sec
            : metric === "fallback_rate"
              ? local.counters.fallback_rate
              : local.counters.telemetry_failure_rate;
      comparisons.push({
        profile,
        left_run_id: server.run_id,
        right_run_id: local.run_id,
        left_provider: server.provider,
        right_provider: local.provider,
        metric,
        left_value: leftValue,
        right_value: rightValue,
        delta: roundNumber(leftValue - rightValue, 4),
        delta_ratio:
          rightValue !== 0 ? roundNumber((leftValue - rightValue) / rightValue, 4) : null
      });
    }
  }

  const highlights: DiagnosticsFlag[] = [];
  const anyActiveSeatNull = summaries.some(
    (summary) => summary.counters.active_seat_null_occurrences > 0
  );
  if (anyActiveSeatNull) {
    highlights.push({
      code: "active_seat_null_detected",
      severity: "error",
      message: "At least one run reproduced activeSeat=null."
    });
  }
  const serverOnlySlowdown = comparisons.find(
    (entry) =>
      entry.metric === "games_per_sec" &&
      entry.left_provider === "server_heuristic" &&
      entry.delta_ratio !== null &&
      entry.delta_ratio <= -0.5
  );
  if (serverOnlySlowdown) {
    highlights.push({
      code: "server_path_slowdown",
      severity: "warn",
      message: `server_heuristic throughput on ${serverOnlySlowdown.profile} was ${roundNumber(
        Math.abs(serverOnlySlowdown.delta_ratio ?? 0) * 100,
        2
      )}% slower than local.`
    });
  }
  const anyTelemetryFailures = summaries.some(
    (summary) => summary.counters.telemetry_failure_rate > 0.1
  );
  if (anyTelemetryFailures) {
    highlights.push({
      code: "telemetry_failure_rate_high",
      severity: "warn",
      message: "At least one run exceeded the telemetry failure rate threshold."
    });
  }

  return {
    generated_at: new Date().toISOString(),
    session_root: sessionRoot,
    total_runs: summaries.length,
    thresholds: {
      fallback_rate_warn: 0.05,
      telemetry_failure_rate_warn: 0.1,
      slowdown_ratio_warn: 0.5
    },
    runs,
    provider_rollups: buildProviderRollups(summaries),
    comparisons,
    highlights
  };
}

export function renderDiagnosticsReport(
  sessionRoot: string,
  summaries: DiagnosticsSummary[],
  comparison: DiagnosticsComparison
): string {
  const lines: string[] = [];
  lines.push("# Simulator Diagnostics Report");
  lines.push("");
  lines.push(`Session root: \`${sessionRoot}\``);
  lines.push(`Generated: ${comparison.generated_at}`);
  lines.push("");
  lines.push("## Runs");
  lines.push("");
  for (const summary of summaries.sort((left, right) =>
    left.label.localeCompare(right.label)
  )) {
    lines.push(
      `- ${summary.label}: ${summary.provider} / ${summary.target}, duration ${summary.duration_seconds}s, games/sec ${summary.throughput.games_per_sec}, fallback ${roundNumber(summary.counters.fallback_rate * 100, 2)}%, telemetry failure ${roundNumber(summary.counters.telemetry_failure_rate * 100, 2)}%, ${summary.clean ? "clean" : "degraded"}`
    );
  }
  lines.push("");
  lines.push("## Highlights");
  lines.push("");
  if (comparison.highlights.length === 0) {
    lines.push("- No cross-run highlights exceeded the configured thresholds.");
  } else {
    for (const flag of comparison.highlights) {
      lines.push(`- [${flag.severity}] ${flag.message}`);
    }
  }
  lines.push("");
  lines.push("## Provider Rollups");
  lines.push("");
  for (const [provider, rollup] of Object.entries(comparison.provider_rollups)) {
    lines.push(
      `- ${provider}: ${rollup.runs} run(s), avg games/sec ${rollup.average_games_per_sec}, avg decisions/sec ${rollup.average_decisions_per_sec}, avg fallback ${roundNumber(rollup.average_fallback_rate * 100, 2)}%, avg telemetry failure ${roundNumber(rollup.average_telemetry_failure_rate * 100, 2)}%, degraded ${rollup.degraded_runs}`
    );
  }
  lines.push("");
  lines.push("## Explicit Comparisons");
  lines.push("");
  if (comparison.comparisons.length === 0) {
    lines.push("- No local vs server_heuristic pairings were available for direct comparison.");
  } else {
    for (const entry of comparison.comparisons) {
      lines.push(
        `- ${entry.profile} / ${entry.metric}: ${entry.left_provider}=${entry.left_value}, ${entry.right_provider}=${entry.right_value}, delta=${entry.delta}`
      );
    }
  }
  lines.push("");
  lines.push("## Artifact Layout");
  lines.push("");
  lines.push("```text");
  lines.push(`${sessionRoot}/`);
  lines.push("  index.json");
  lines.push("  comparison.json");
  lines.push("  REPORT.md");
  lines.push("  <run-id>/");
  lines.push("    summary.json");
  lines.push("    stdout.log");
  lines.push("    stderr.log");
  lines.push("    events.ndjson");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeJsonFile(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function writeDiagnosticsSessionArtifacts(config: {
  sessionRoot: string;
  summaries: DiagnosticsSummary[];
  comparison: DiagnosticsComparison;
  reportMarkdown: string;
}): {
  indexPath: string;
  comparisonPath: string;
  reportPath: string;
} {
  const indexPath = path.join(config.sessionRoot, "index.json");
  const comparisonPath = path.join(config.sessionRoot, "comparison.json");
  const reportPath = path.join(config.sessionRoot, "REPORT.md");
  writeJsonFile(indexPath, {
    generated_at: new Date().toISOString(),
    runs: config.summaries.map((summary) => ({
      run_id: summary.run_id,
      label: summary.label,
      summary_path: path.join(config.sessionRoot, summary.run_id, "summary.json"),
      stdout_path: summary.stdout_path,
      stderr_path: summary.stderr_path,
      events_path: summary.events_path
    }))
  });
  writeJsonFile(comparisonPath, config.comparison);
  fs.writeFileSync(reportPath, config.reportMarkdown, "utf8");
  return {
    indexPath,
    comparisonPath,
    reportPath
  };
}

export function tryParseSummaryFromOutput(
  content: string
): SelfPlayBatchSummary | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/u).reverse();
  for (const line of lines) {
    const parsed = parseJsonLine(line.trim());
    if (isSelfPlayBatchSummary(parsed)) {
      return cloneBatchSummary(parsed);
    }
  }
  const parsed = parseJsonLine(trimmed);
  return isSelfPlayBatchSummary(parsed) ? cloneBatchSummary(parsed) : null;
}
