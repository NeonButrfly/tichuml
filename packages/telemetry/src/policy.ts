import { normalizeBackendBaseUrl } from "@tichuml/shared";
import {
  DEFAULT_TELEMETRY_MAX_BYTES,
  type NormalizedTelemetryConfig,
  type TelemetryConfigInput,
  type TelemetryDiagnostic,
  type TelemetryMode,
  type TelemetryRequestKind,
  type TelemetrySource
} from "./types.js";

export function normalizeTelemetryMode(
  value: TelemetryMode | undefined
): TelemetryMode {
  return value === "full" || value === "adaptive" ? value : "minimal";
}

export function normalizeTelemetryConfig(
  input: TelemetryConfigInput,
  defaults: { source: TelemetrySource; backendBaseUrl?: string }
): NormalizedTelemetryConfig {
  const maxBytes =
    input.maxBytes ??
    input.telemetry_max_bytes ??
    (Number.isFinite(input.telemetryMaxBytes)
      ? input.telemetryMaxBytes
      : undefined);
  const backendBaseUrl =
    input.backendBaseUrl ??
    input.backend_url ??
    defaults.backendBaseUrl ??
    "http://localhost:4310";

  return {
    enabled: input.enabled ?? input.telemetryEnabled ?? true,
    strictTelemetry: input.strictTelemetry ?? input.strict_telemetry ?? false,
    traceBackend: input.traceBackend ?? input.trace_backend ?? false,
    mode: normalizeTelemetryMode(input.mode ?? input.telemetry_mode),
    maxBytes:
      Number.isFinite(maxBytes) && maxBytes !== undefined && maxBytes > 0
        ? Math.floor(maxBytes)
        : DEFAULT_TELEMETRY_MAX_BYTES,
    backendBaseUrl: normalizeBackendBaseUrl(backendBaseUrl),
    source: input.source ?? defaults.source,
    quiet: input.quiet ?? false,
    ...(input.workerId ? { workerId: input.workerId } : {}),
    controllerMode: input.controllerMode ?? false
  };
}

export function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}

export function createTelemetryDiagnostic(config: {
  event: TelemetryDiagnostic["event"];
  source: TelemetrySource;
  requestKind: TelemetryRequestKind;
  payload: Record<string, unknown>;
  payloadBytes?: number;
  maxBytes?: number;
  status?: number;
  failureKind?: TelemetryDiagnostic["failure_kind"];
  message?: string;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): TelemetryDiagnostic {
  return {
    ts: new Date().toISOString(),
    event: config.event,
    source: config.source,
    request_kind: config.requestKind,
    ...(typeof config.payload.game_id === "string"
      ? { game_id: config.payload.game_id }
      : {}),
    ...(typeof config.payload.hand_id === "string"
      ? { hand_id: config.payload.hand_id }
      : {}),
    ...(typeof config.payload.phase === "string"
      ? { phase: config.payload.phase }
      : {}),
    ...(typeof config.payload.actor_seat === "string"
      ? { actor_seat: config.payload.actor_seat }
      : {}),
    ...(typeof config.payload.decision_index === "number"
      ? { decision_index: config.payload.decision_index }
      : {}),
    ...(typeof config.payload.event_index === "number"
      ? { event_index: config.payload.event_index }
      : {}),
    ...(config.payloadBytes !== undefined
      ? { payload_bytes: config.payloadBytes }
      : {}),
    ...(config.maxBytes !== undefined ? { max_bytes: config.maxBytes } : {}),
    ...(config.status !== undefined ? { status: config.status } : {}),
    ...(config.failureKind ? { failure_kind: config.failureKind } : {}),
    ...(config.message ? { message: config.message } : {}),
    ...(config.workerId ? { worker_id: config.workerId } : {}),
    ...(config.controllerMode ? { controller_mode: true } : {})
  };
}

export function selectTelemetryPayload<T>(config: {
  mode: TelemetryMode;
  full: T;
  minimal: T;
  maxBytes: number;
  source: TelemetrySource;
  requestKind: TelemetryRequestKind;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): {
  payload: T | null;
  outcome: "posted" | "downgraded" | "skipped";
  payloadBytes: number;
  diagnostics: TelemetryDiagnostic[];
} {
  const desiredPayload = config.mode === "full" ? config.full : config.minimal;
  const desiredBytes = jsonByteLength(desiredPayload);
  const desiredDiagnostics: TelemetryDiagnostic[] = [];

  if (desiredBytes <= config.maxBytes) {
    return {
      payload: desiredPayload,
      outcome: "posted",
      payloadBytes: desiredBytes,
      diagnostics: desiredDiagnostics
    };
  }

  if (config.mode === "full" || config.mode === "adaptive") {
    const minimalBytes = jsonByteLength(config.minimal);
    desiredDiagnostics.push(
      createTelemetryDiagnostic({
        event: "telemetry_payload_downgraded",
        source: config.source,
        requestKind: config.requestKind,
        payload: config.full as Record<string, unknown>,
        payloadBytes: desiredBytes,
        maxBytes: config.maxBytes,
        workerId: config.workerId,
        controllerMode: config.controllerMode
      })
    );
    if (minimalBytes <= config.maxBytes) {
      return {
        payload: config.minimal,
        outcome: "downgraded",
        payloadBytes: minimalBytes,
        diagnostics: desiredDiagnostics
      };
    }
  }

  desiredDiagnostics.push(
    createTelemetryDiagnostic({
      event: "telemetry_payload_skipped",
      source: config.source,
      requestKind: config.requestKind,
      payload: desiredPayload as Record<string, unknown>,
      payloadBytes: desiredBytes,
      maxBytes: config.maxBytes,
      failureKind: "oversize_skipped",
      message: `Telemetry payload is ${desiredBytes} bytes and exceeds ${config.maxBytes} bytes.`,
      workerId: config.workerId,
      controllerMode: config.controllerMode
    })
  );

  return {
    payload: null,
    outcome: "skipped",
    payloadBytes: desiredBytes,
    diagnostics: desiredDiagnostics
  };
}
