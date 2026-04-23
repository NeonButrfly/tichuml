import type { JsonObject } from "@tichuml/shared";
import {
  type TelemetryFailureStats,
  type TelemetryFailureTracker,
  type TelemetryWriteResult
} from "./types.js";

export class TelemetryError extends Error {
  constructor(readonly result: TelemetryWriteResult) {
    super(
      result.ok
        ? "Telemetry succeeded."
        : `Strict telemetry ${result.request_kind === "telemetry_decision" ? "decision" : "event"} persistence failed (${result.failure_kind}) at ${result.endpoint}: ${result.message}`
    );
    this.name = "TelemetryError";
  }
}

export function createTelemetryFailureStats(): TelemetryFailureStats {
  return {
    telemetryDecisionFailures: 0,
    telemetryEventFailures: 0,
    telemetryFailuresTotal: 0,
    telemetryFailureByEndpoint: {}
  };
}

export function createTelemetryFailureTracker(): TelemetryFailureTracker {
  return {
    emittedDetailedFailures: 0,
    compactedFailures: 0
  };
}

function countByKey(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

export function mergeTelemetryFailureStats(
  target: TelemetryFailureStats,
  source: TelemetryFailureStats
): void {
  target.telemetryDecisionFailures += source.telemetryDecisionFailures;
  target.telemetryEventFailures += source.telemetryEventFailures;
  target.telemetryFailuresTotal += source.telemetryFailuresTotal;
  for (const [key, value] of Object.entries(
    source.telemetryFailureByEndpoint
  )) {
    target.telemetryFailureByEndpoint[key] =
      (target.telemetryFailureByEndpoint[key] ?? 0) + value;
  }
}

export function recordTelemetryFailure(
  stats: TelemetryFailureStats,
  result: TelemetryWriteResult
): void {
  if (result.ok) {
    return;
  }
  if (result.request_kind === "telemetry_decision") {
    stats.telemetryDecisionFailures += 1;
  } else {
    stats.telemetryEventFailures += 1;
  }
  stats.telemetryFailuresTotal += 1;
  countByKey(stats.telemetryFailureByEndpoint, result.endpoint);
}

function shouldEmitDiagnostic(config: {
  quiet?: boolean;
  controllerMode?: boolean;
}): boolean {
  return config.controllerMode === true || config.quiet !== true;
}

export function emitTelemetryFailureDiagnostic(
  config: { quiet?: boolean; controllerMode?: boolean },
  tracker: TelemetryFailureTracker,
  result: TelemetryWriteResult,
  context: JsonObject
): void {
  if (result.ok || !shouldEmitDiagnostic(config)) {
    return;
  }
  const detailedLimit = 5;
  if (tracker.emittedDetailedFailures < detailedLimit) {
    tracker.emittedDetailedFailures += 1;
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "telemetry_failure",
        endpoint: result.endpoint,
        request_kind: result.request_kind,
        failure_kind: result.failure_kind,
        message: result.message,
        status: result.status ?? null,
        latency_ms: result.latency_ms ?? null,
        payload_bytes: result.payload_bytes ?? null,
        max_bytes: result.max_bytes ?? null,
        diagnostics: result.diagnostics,
        ...context
      })
    );
    return;
  }

  tracker.compactedFailures += 1;
  if (tracker.compactedFailures === 1) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "telemetry_failure_compacted",
        message:
          "Additional telemetry failures are being compacted for this game.",
        ...context
      })
    );
  }
}
