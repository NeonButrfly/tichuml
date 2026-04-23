import type {
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";

export const TELEMETRY_SCHEMA_VERSION = 2;
export const TELEMETRY_ENGINE_VERSION = "milestone-1";
export const TELEMETRY_SIM_VERSION = "milestone-2";
export const DEFAULT_TELEMETRY_MAX_BYTES = 24 * 1024 * 1024;

export type TelemetrySource =
  | "selfplay"
  | "gameplay"
  | "controller"
  | "eval"
  | "system";
export type TelemetryMode = "minimal" | "full" | "adaptive";

export type NormalizedTelemetryConfig = {
  enabled: boolean;
  strictTelemetry: boolean;
  traceBackend: boolean;
  mode: TelemetryMode;
  maxBytes: number;
  backendBaseUrl: string;
  source: TelemetrySource;
  quiet: boolean;
  workerId?: string | undefined;
  controllerMode: boolean;
};

export type TelemetryConfigInput = {
  enabled?: boolean | undefined;
  strictTelemetry?: boolean | undefined;
  traceBackend?: boolean | undefined;
  mode?: TelemetryMode | undefined;
  maxBytes?: number | undefined;
  backendBaseUrl?: string | undefined;
  source?: TelemetrySource | undefined;
  quiet?: boolean | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
  telemetryEnabled?: boolean | undefined;
  strict_telemetry?: boolean | undefined;
  trace_backend?: boolean | undefined;
  telemetry_mode?: TelemetryMode | undefined;
  telemetry_max_bytes?: number | undefined;
  telemetryMaxBytes?: number | undefined;
  backend_url?: string | undefined;
};

export type TelemetryRequestKind = "telemetry_decision" | "telemetry_event";

export type TelemetryFailureKind =
  | "client_validation"
  | "network_failure"
  | "backend_rejection"
  | "unexpected_failure"
  | "oversize_skipped";

export type TelemetryWriteOutcome =
  | "disabled"
  | "posted"
  | "downgraded"
  | "trimmed"
  | "skipped"
  | "failed";

export type TelemetryWriteResult =
  | {
      ok: true;
      endpoint: string;
      method: "POST";
      request_kind: TelemetryRequestKind;
      outcome: "posted" | "downgraded" | "trimmed";
      status: number;
      latency_ms: number;
      payload_bytes: number;
      max_bytes: number;
      diagnostics: TelemetryDiagnostic[];
      telemetry_id?: number;
    }
  | {
      ok: false;
      endpoint: string;
      method: "POST";
      request_kind: TelemetryRequestKind;
      outcome: "disabled" | "skipped" | "failed";
      failure_kind: TelemetryFailureKind;
      status?: number;
      message: string;
      body?: Record<string, unknown>;
      raw_body?: string;
      cause?: string;
      latency_ms?: number;
      payload_bytes?: number;
      max_bytes?: number;
      diagnostics: TelemetryDiagnostic[];
    };

export type TelemetryDiagnostic = {
  ts: string;
  event:
    | "telemetry_disabled"
    | "telemetry_payload_downgraded"
    | "telemetry_payload_trimmed"
    | "telemetry_payload_skipped"
    | "telemetry_transport_failed"
    | "telemetry_backend_rejected"
    | "telemetry_client_validation_failed"
    | "telemetry_posted";
  source: TelemetrySource;
  request_kind: TelemetryRequestKind;
  game_id?: string;
  hand_id?: string;
  phase?: string;
  actor_seat?: string;
  decision_index?: number;
  event_index?: number;
  payload_bytes?: number;
  max_bytes?: number;
  status?: number;
  failure_kind?: TelemetryFailureKind;
  message?: string;
  worker_id?: string;
  controller_mode?: boolean;
};

export type TelemetryFailureStats = {
  telemetryDecisionFailures: number;
  telemetryEventFailures: number;
  telemetryFailuresTotal: number;
  telemetryFailureByEndpoint: Record<string, number>;
};

export type TelemetryFailureTracker = {
  emittedDetailedFailures: number;
  compactedFailures: number;
};

export type TelemetryClientFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type TelemetryDecisionBuildResult = {
  full: TelemetryDecisionPayload;
  minimal: TelemetryDecisionPayload;
};

export type TelemetryEventBuildResult = {
  full: TelemetryEventPayload;
  minimal: TelemetryEventPayload;
};
