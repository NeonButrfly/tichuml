import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  ADMIN_CONFIRMATION_VALUE,
  ADMIN_SIM_CONTINUE_PATH,
  ADMIN_SIM_PAUSE_PATH,
  ADMIN_SIM_RUN_ONCE_PATH,
  ADMIN_SIM_START_PATH,
  ADMIN_SIM_STATUS_PATH,
  ADMIN_SIM_STOP_PATH,
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  normalizeBackendBaseUrl,
  validateDecisionRequestPayload,
  type DecisionRequestPayload,
  type DecisionResponsePayload,
  type SimControllerRequestPayload,
  type SimControllerResponse,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  emitTelemetryDecision,
  emitTelemetryEvent,
  TelemetryError,
  type TelemetryWriteResult
} from "@tichuml/telemetry";

type FetchLike = typeof fetch;

export type TelemetryWriteResponse = {
  accepted: boolean;
  telemetry_id?: number;
};

export type BackendRequestErrorKind =
  | "network"
  | "validation"
  | "client_validation"
  | "server";

export class BackendRequestError extends Error {
  endpoint: string;
  kind: BackendRequestErrorKind;
  reachable: boolean | null;
  statusCode: number | null;
  validationErrors: Array<{ path: string; message: string }> | null;

  constructor(config: {
    message: string;
    endpoint: string;
    kind: BackendRequestErrorKind;
    reachable: boolean | null;
    statusCode?: number | null;
    validationErrors?: Array<{ path: string; message: string }> | null;
  }) {
    super(config.message);
    this.name = "BackendRequestError";
    this.endpoint = config.endpoint;
    this.kind = config.kind;
    this.reachable = config.reachable;
    this.statusCode = config.statusCode ?? null;
    this.validationErrors = config.validationErrors ?? null;
  }
}

export function isBackendRequestError(
  error: unknown
): error is BackendRequestError {
  return error instanceof BackendRequestError;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  endpoint: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new BackendRequestError({
      message:
        error instanceof Error ? error.message : "Network request failed.",
      endpoint,
      kind: "network",
      reachable: false,
      statusCode: null
    });
  }

  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const validationErrors =
      typeof payload === "object" &&
      payload !== null &&
      "validation_errors" in payload &&
      Array.isArray(payload.validation_errors)
        ? (payload.validation_errors as Array<{
            path: string;
            message: string;
          }>)
        : null;
    throw new BackendRequestError({
      message:
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Request failed with HTTP ${response.status}.`,
      endpoint,
      kind: response.status === 400 ? "validation" : "server",
      reachable: true,
      statusCode: response.status,
      validationErrors
    });
  }

  return payload as T;
}

function buildUrl(baseUrl: string, pathname: string): string {
  return `${normalizeBackendBaseUrl(baseUrl)}${pathname}`;
}

export async function testBackendHealth(
  baseUrl: string,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<{ ok: boolean; database?: string }> {
  return fetchJson<{ ok: boolean; database?: string }>(
    buildUrl(baseUrl, BACKEND_HEALTH_PATH),
    {
      method: "GET"
    },
    fetchImpl,
    BACKEND_HEALTH_PATH
  );
}

export async function postDecisionRequest(
  baseUrl: string,
  payload: DecisionRequestPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<DecisionResponsePayload> {
  const parsed = validateDecisionRequestPayload(payload);
  if (!parsed.ok) {
    throw new BackendRequestError({
      message: "Local decision payload failed validation before request.",
      endpoint: DECISION_REQUEST_PATH,
      kind: "client_validation",
      reachable: null,
      validationErrors: parsed.issues
    });
  }

  return fetchJson<DecisionResponsePayload>(
    buildUrl(baseUrl, DECISION_REQUEST_PATH),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parsed.value)
    },
    fetchImpl,
    DECISION_REQUEST_PATH
  );
}

export async function postTelemetryDecision(
  baseUrl: string,
  payload: TelemetryDecisionPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<TelemetryWriteResponse> {
  const result = await emitTelemetryDecision({
    telemetry: {
      enabled: true,
      strictTelemetry: true,
      backendBaseUrl: baseUrl,
      source:
        payload.metadata.source === "selfplay" ||
        payload.metadata.source === "controller" ||
        payload.metadata.source === "eval"
          ? payload.metadata.source
          : "gameplay",
      mode: "full"
    },
    payloads: {
      full: payload,
      minimal: payload
    },
    fetchImpl
  }).catch((error) => {
    throw toBackendRequestError(error, TELEMETRY_DECISION_PATH);
  });

  return {
    accepted: result.ok,
    ...(result.ok && result.telemetry_id !== undefined
      ? { telemetry_id: result.telemetry_id }
      : {})
  };
}

export async function postTelemetryEvent(
  baseUrl: string,
  payload: TelemetryEventPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<TelemetryWriteResponse> {
  const result = await emitTelemetryEvent({
    telemetry: {
      enabled: true,
      strictTelemetry: true,
      backendBaseUrl: baseUrl,
      source:
        payload.metadata.source === "selfplay" ||
        payload.metadata.source === "controller" ||
        payload.metadata.source === "eval"
          ? payload.metadata.source
          : "gameplay",
      mode: "full"
    },
    payloads: {
      full: payload,
      minimal: payload
    },
    fetchImpl
  }).catch((error) => {
    throw toBackendRequestError(error, TELEMETRY_EVENT_PATH);
  });

  return {
    accepted: result.ok,
    ...(result.ok && result.telemetry_id !== undefined
      ? { telemetry_id: result.telemetry_id }
      : {})
  };
}

function toBackendRequestError(
  error: unknown,
  endpoint: string
): BackendRequestError {
  if (error instanceof BackendRequestError) {
    return error;
  }
  if (error instanceof TelemetryError) {
    const result = error.result as TelemetryWriteResult;
    const validationErrors =
      !result.ok && result.body && Array.isArray(result.body.validation_errors)
        ? (result.body.validation_errors as Array<{
            path: string;
            message: string;
          }>)
        : null;
    return new BackendRequestError({
      message: error.message,
      endpoint,
      kind:
        !result.ok && result.failure_kind === "client_validation"
          ? "client_validation"
          : !result.ok && result.status === 400
            ? "validation"
            : !result.ok && result.failure_kind === "network_failure"
              ? "network"
              : "server",
      reachable:
        !result.ok && result.failure_kind === "client_validation"
          ? null
          : result.ok
            ? true
            : result.failure_kind !== "network_failure",
      statusCode: !result.ok ? (result.status ?? null) : null,
      validationErrors
    });
  }
  return new BackendRequestError({
    message: error instanceof Error ? error.message : String(error),
    endpoint,
    kind: "server",
    reachable: null
  });
}

export async function getSimControllerStatus(
  baseUrl: string,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<SimControllerResponse> {
  return fetchJson<SimControllerResponse>(
    buildUrl(baseUrl, ADMIN_SIM_STATUS_PATH),
    { method: "GET" },
    fetchImpl,
    ADMIN_SIM_STATUS_PATH
  );
}

export async function postSimControllerAction(
  baseUrl: string,
  action: "start" | "pause" | "continue" | "stop" | "run-once",
  payload: SimControllerRequestPayload = {},
  confirmToken = ADMIN_CONFIRMATION_VALUE,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<SimControllerResponse> {
  const endpoint =
    action === "start"
      ? ADMIN_SIM_START_PATH
      : action === "pause"
        ? ADMIN_SIM_PAUSE_PATH
        : action === "continue"
          ? ADMIN_SIM_CONTINUE_PATH
          : action === "stop"
            ? ADMIN_SIM_STOP_PATH
            : ADMIN_SIM_RUN_ONCE_PATH;
  return fetchJson<SimControllerResponse>(
    buildUrl(baseUrl, endpoint),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-confirm": confirmToken
      },
      body: JSON.stringify(payload)
    },
    fetchImpl,
    endpoint
  );
}
