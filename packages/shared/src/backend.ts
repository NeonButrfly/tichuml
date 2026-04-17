import type { SeedJsonValue } from "./seed.js";

export const DEFAULT_SERVER_PORT = 4310;
export const DEFAULT_BACKEND_BASE_URL = `http://localhost:${DEFAULT_SERVER_PORT}`;
export const BACKEND_SETTINGS_STORAGE_KEY = "tichuml.backend-settings.v1";
export const BACKEND_HEALTH_PATH = "/health";
export const TELEMETRY_DECISION_PATH = "/api/telemetry/decision";
export const TELEMETRY_EVENT_PATH = "/api/telemetry/event";
export const DECISION_REQUEST_PATH = "/api/decision/request";

export type JsonObject = Record<string, SeedJsonValue>;
export type JsonArray = SeedJsonValue[];
export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type DecisionMode = "local" | "server";
export type RequestedDecisionProvider = "server_heuristic";
export type DecisionProviderUsed = RequestedDecisionProvider | "local_heuristic";
export type BackendReachabilityState =
  | "unknown"
  | "checking"
  | "reachable"
  | "unreachable";

export type BackendRuntimeSettings = {
  decisionMode: DecisionMode;
  backendBaseUrl: string;
  serverFallbackEnabled: boolean;
  telemetryEnabled: boolean;
};

export type TelemetryDecisionPayload = {
  ts: string;
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  decision_index: number;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  policy_name: string;
  policy_source: string;
  state_raw: JsonObject;
  state_norm: JsonObject | null;
  legal_actions: SeedJsonValue;
  chosen_action: JsonObject;
  metadata: JsonObject;
  antipattern_tags: SeedJsonValue;
};

export type TelemetryEventPayload = {
  ts: string;
  game_id: string;
  hand_id: string;
  phase: string;
  event_type: string;
  actor_seat: string | null;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  payload: SeedJsonValue;
  metadata: JsonObject;
};

export type DecisionRequestPayload = {
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  state_raw: JsonObject | null;
  state_norm: JsonObject | null;
  legal_actions: SeedJsonValue;
  requested_provider: RequestedDecisionProvider;
  metadata: JsonObject;
};

export type DecisionResponsePayload = {
  accepted: boolean;
  chosen_action: JsonObject | null;
  provider_used: DecisionProviderUsed | null;
  provider_reason?: string;
  validation_errors?: ValidationIssue[];
  telemetry_id?: number;
};

export type StoredTelemetryDecisionRecord = TelemetryDecisionPayload & {
  id: number;
  created_at: string;
};

export type StoredTelemetryEventRecord = TelemetryEventPayload & {
  id: number;
  created_at: string;
};

export type ReplayRecord =
  | {
      kind: "decision";
      ts: string;
      id: number;
      phase: string;
      actor_seat: string;
      payload: StoredTelemetryDecisionRecord;
    }
  | {
      kind: "event";
      ts: string;
      id: number;
      phase: string;
      actor_seat: string | null;
      payload: StoredTelemetryEventRecord;
    };

export type ReplayPayload = {
  game_id: string;
  decisions: StoredTelemetryDecisionRecord[];
  events: StoredTelemetryEventRecord[];
  timeline: ReplayRecord[];
};

type ValidatorContext = {
  issues: ValidationIssue[];
};

function pushIssue(
  context: ValidatorContext,
  path: string,
  message: string
): void {
  context.issues.push({ path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is SeedJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return Number.isFinite(value as number) || typeof value !== "number";
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function expectString(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(context, key, "Expected a non-empty string.");
    return null;
  }

  return value;
}

function expectNumber(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): number | null {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(context, key, "Expected a finite number.");
    return null;
  }

  return value;
}

function expectJsonObject(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string,
  options?: { nullable?: boolean }
): JsonObject | null {
  const value = input[key];
  if (value === null && options?.nullable) {
    return null;
  }

  if (!isPlainObject(value) || !isJsonValue(value)) {
    pushIssue(context, key, "Expected a JSON object.");
    return null;
  }

  return value as JsonObject;
}

function expectJsonValue(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): SeedJsonValue | null {
  const value = input[key];
  if (!isJsonValue(value)) {
    pushIssue(context, key, "Expected JSON-compatible data.");
    return null;
  }

  return value;
}

function expectOptionalSeat(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = input[key];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(context, key, "Expected a seat string or null.");
    return null;
  }

  return value;
}

function expectIsoDate(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = expectString(context, input, key);
  if (!value) {
    return null;
  }

  if (Number.isNaN(Date.parse(value))) {
    pushIssue(context, key, "Expected an ISO-8601 timestamp.");
    return null;
  }

  return value;
}

function expectRequestedProvider(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): RequestedDecisionProvider | null {
  const value = input[key];
  if (value !== "server_heuristic") {
    pushIssue(context, key, "Expected 'server_heuristic'.");
    return null;
  }

  return value;
}

function finalizeValidation<T>(
  context: ValidatorContext,
  value: T
): ValidationResult<T> {
  return context.issues.length === 0
    ? { ok: true, value }
    : { ok: false, issues: context.issues };
}

export function validateTelemetryDecisionPayload(
  payload: unknown
): ValidationResult<TelemetryDecisionPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const value: TelemetryDecisionPayload = {
    ts: expectIsoDate(context, payload, "ts") ?? new Date(0).toISOString(),
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    actor_seat: expectString(context, payload, "actor_seat") ?? "",
    decision_index: expectNumber(context, payload, "decision_index") ?? 0,
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    policy_name: expectString(context, payload, "policy_name") ?? "",
    policy_source: expectString(context, payload, "policy_source") ?? "",
    state_raw: expectJsonObject(context, payload, "state_raw") ?? {},
    state_norm: expectJsonObject(context, payload, "state_norm", {
      nullable: true
    }),
    legal_actions: expectJsonValue(context, payload, "legal_actions") ?? [],
    chosen_action: expectJsonObject(context, payload, "chosen_action") ?? {},
    metadata: expectJsonObject(context, payload, "metadata") ?? {},
    antipattern_tags: expectJsonValue(context, payload, "antipattern_tags") ?? []
  };

  return finalizeValidation(context, value);
}

export function validateTelemetryEventPayload(
  payload: unknown
): ValidationResult<TelemetryEventPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const value: TelemetryEventPayload = {
    ts: expectIsoDate(context, payload, "ts") ?? new Date(0).toISOString(),
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    event_type: expectString(context, payload, "event_type") ?? "",
    actor_seat: expectOptionalSeat(context, payload, "actor_seat"),
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    payload: expectJsonValue(context, payload, "payload") ?? {},
    metadata: expectJsonObject(context, payload, "metadata") ?? {}
  };

  return finalizeValidation(context, value);
}

export function validateDecisionRequestPayload(
  payload: unknown
): ValidationResult<DecisionRequestPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const stateRaw =
    payload.state_raw === null || payload.state_raw === undefined
      ? null
      : expectJsonObject(context, payload, "state_raw");
  const stateNorm =
    payload.state_norm === null || payload.state_norm === undefined
      ? null
      : expectJsonObject(context, payload, "state_norm");

  if (!stateRaw && !stateNorm) {
    pushIssue(context, "state_raw", "Expected state_raw or state_norm.");
  }

  const value: DecisionRequestPayload = {
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    actor_seat: expectString(context, payload, "actor_seat") ?? "",
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    state_raw: stateRaw,
    state_norm: stateNorm,
    legal_actions: expectJsonValue(context, payload, "legal_actions") ?? [],
    requested_provider:
      expectRequestedProvider(context, payload, "requested_provider") ??
      "server_heuristic",
    metadata: expectJsonObject(context, payload, "metadata") ?? {}
  };

  return finalizeValidation(context, value);
}

export function normalizeBackendBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_BACKEND_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}
