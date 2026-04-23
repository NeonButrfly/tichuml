import {
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  validateTelemetryDecisionPayload,
  validateTelemetryEventPayload,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload,
  type ValidationIssue
} from "@tichuml/shared";
import { TelemetryError } from "./failures.js";
import {
  createTelemetryDiagnostic,
  normalizeTelemetryConfig,
  selectTelemetryPayload
} from "./policy.js";
import {
  type NormalizedTelemetryConfig,
  type TelemetryClientFetch,
  type TelemetryConfigInput,
  type TelemetryDecisionBuildResult,
  type TelemetryEventBuildResult,
  type TelemetryFailureKind,
  type TelemetryRequestKind,
  type TelemetrySource,
  type TelemetryWriteResult
} from "./types.js";

type TelemetryResponse = {
  accepted: boolean;
  telemetry_id?: number;
};

function buildEndpoint(
  config: NormalizedTelemetryConfig,
  requestKind: TelemetryRequestKind
): string {
  return `${config.backendBaseUrl}${
    requestKind === "telemetry_decision"
      ? TELEMETRY_DECISION_PATH
      : TELEMETRY_EVENT_PATH
  }`;
}

function validationMessage(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

async function readResponseJson(
  response: Response
): Promise<{ payload: unknown; rawBody: string }> {
  const rawBody = await response.text();
  return {
    rawBody,
    payload: rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null
  };
}

function maybeThrow(
  config: NormalizedTelemetryConfig,
  result: TelemetryWriteResult
): TelemetryWriteResult {
  if (!result.ok && config.strictTelemetry) {
    throw new TelemetryError(result);
  }
  return result;
}

async function postPayload(config: {
  telemetryConfig: NormalizedTelemetryConfig;
  requestKind: TelemetryRequestKind;
  payload: TelemetryDecisionPayload | TelemetryEventPayload;
  payloadBytes: number;
  outcome: "posted" | "downgraded";
  diagnostics: TelemetryWriteResult["diagnostics"];
  fetchImpl: TelemetryClientFetch;
}): Promise<TelemetryWriteResult> {
  const endpoint = buildEndpoint(config.telemetryConfig, config.requestKind);
  const startedAt = Date.now();
  let response: Response | undefined;
  let lastFailure: unknown;
  try {
    for (
      let attempt = 0;
      attempt <= config.telemetryConfig.retryAttempts;
      attempt += 1
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.telemetryConfig.timeoutMs
      );
      try {
        response = await config.fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(config.payload),
          signal: controller.signal
        });
        break;
      } catch (error) {
        lastFailure = error;
        if (attempt >= config.telemetryConfig.retryAttempts) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, config.telemetryConfig.retryDelayMs)
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: TelemetryWriteResult = {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "failed",
      failure_kind: "network_failure",
      message,
      cause: error instanceof Error ? error.name : "unknown",
      latency_ms: Date.now() - startedAt,
      payload_bytes: config.payloadBytes,
      max_bytes: config.telemetryConfig.maxBytes,
      diagnostics: [
        ...config.diagnostics,
        createTelemetryDiagnostic({
          event: "telemetry_transport_failed",
          source: config.telemetryConfig.source,
          requestKind: config.requestKind,
          payload: config.payload,
          payloadBytes: config.payloadBytes,
          maxBytes: config.telemetryConfig.maxBytes,
          failureKind: "network_failure",
          message,
          workerId: config.telemetryConfig.workerId,
          controllerMode: config.telemetryConfig.controllerMode
        })
      ]
    };
    return maybeThrow(config.telemetryConfig, result);
  }
  if (response === undefined) {
    const error = lastFailure ?? new Error("Telemetry request failed.");
    const message = error instanceof Error ? error.message : String(error);
    const result: TelemetryWriteResult = {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "failed",
      failure_kind: "network_failure",
      message,
      cause: error instanceof Error ? error.name : "unknown",
      latency_ms: Date.now() - startedAt,
      payload_bytes: config.payloadBytes,
      max_bytes: config.telemetryConfig.maxBytes,
      diagnostics: config.diagnostics
    };
    return maybeThrow(config.telemetryConfig, result);
  }

  let parsed: { payload: unknown; rawBody: string };
  try {
    parsed = await readResponseJson(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: TelemetryWriteResult = {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "failed",
      failure_kind: "unexpected_failure",
      status: response.status,
      message,
      cause: error instanceof Error ? error.name : "unknown",
      latency_ms: Date.now() - startedAt,
      payload_bytes: config.payloadBytes,
      max_bytes: config.telemetryConfig.maxBytes,
      diagnostics: config.diagnostics
    };
    return maybeThrow(config.telemetryConfig, result);
  }

  if (!response.ok) {
    const body =
      typeof parsed.payload === "object" &&
      parsed.payload !== null &&
      !Array.isArray(parsed.payload)
        ? (parsed.payload as Record<string, unknown>)
        : undefined;
    const message =
      body && typeof body.error === "string"
        ? body.error
        : `Telemetry request failed with HTTP ${response.status}.`;
    const result: TelemetryWriteResult = {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "failed",
      failure_kind: "backend_rejection",
      status: response.status,
      message,
      ...(body ? { body } : {}),
      raw_body: parsed.rawBody,
      latency_ms: Date.now() - startedAt,
      payload_bytes: config.payloadBytes,
      max_bytes: config.telemetryConfig.maxBytes,
      diagnostics: [
        ...config.diagnostics,
        createTelemetryDiagnostic({
          event: "telemetry_backend_rejected",
          source: config.telemetryConfig.source,
          requestKind: config.requestKind,
          payload: config.payload,
          payloadBytes: config.payloadBytes,
          maxBytes: config.telemetryConfig.maxBytes,
          status: response.status,
          failureKind: "backend_rejection",
          message,
          workerId: config.telemetryConfig.workerId,
          controllerMode: config.telemetryConfig.controllerMode
        })
      ]
    };
    return maybeThrow(config.telemetryConfig, result);
  }

  const payload =
    typeof parsed.payload === "object" && parsed.payload !== null
      ? (parsed.payload as TelemetryResponse)
      : { accepted: true };
  return {
    ok: true,
    endpoint,
    method: "POST",
    request_kind: config.requestKind,
    outcome: config.outcome,
    status: response.status,
    latency_ms: Date.now() - startedAt,
    payload_bytes: config.payloadBytes,
    max_bytes: config.telemetryConfig.maxBytes,
    diagnostics: [
      ...config.diagnostics,
      createTelemetryDiagnostic({
        event: "telemetry_posted",
        source: config.telemetryConfig.source,
        requestKind: config.requestKind,
        payload: config.payload,
        payloadBytes: config.payloadBytes,
        maxBytes: config.telemetryConfig.maxBytes,
        status: response.status,
        workerId: config.telemetryConfig.workerId,
        controllerMode: config.telemetryConfig.controllerMode
      })
    ],
    ...(typeof payload.telemetry_id === "number"
      ? { telemetry_id: payload.telemetry_id }
      : {})
  };
}

function validatePayload(config: {
  telemetryConfig: NormalizedTelemetryConfig;
  requestKind: TelemetryRequestKind;
  endpoint: string;
  payload: TelemetryDecisionPayload | TelemetryEventPayload;
  payloadBytes: number;
  diagnostics: TelemetryWriteResult["diagnostics"];
}): TelemetryWriteResult | null {
  const parsed =
    config.requestKind === "telemetry_decision"
      ? validateTelemetryDecisionPayload(config.payload)
      : validateTelemetryEventPayload(config.payload);
  if (parsed.ok) {
    return null;
  }
  const message = `Local telemetry payload failed validation: ${validationMessage(parsed.issues)}`;
  return maybeThrow(config.telemetryConfig, {
    ok: false,
    endpoint: config.endpoint,
    method: "POST",
    request_kind: config.requestKind,
    outcome: "failed",
    failure_kind: "client_validation",
    message,
    payload_bytes: config.payloadBytes,
    max_bytes: config.telemetryConfig.maxBytes,
    diagnostics: [
      ...config.diagnostics,
      createTelemetryDiagnostic({
        event: "telemetry_client_validation_failed",
        source: config.telemetryConfig.source,
        requestKind: config.requestKind,
        payload: config.payload,
        payloadBytes: config.payloadBytes,
        maxBytes: config.telemetryConfig.maxBytes,
        failureKind: "client_validation",
        message,
        workerId: config.telemetryConfig.workerId,
        controllerMode: config.telemetryConfig.controllerMode
      })
    ]
  });
}

async function emitTelemetry(config: {
  telemetry: TelemetryConfigInput;
  defaultSource: TelemetrySource;
  requestKind: TelemetryRequestKind;
  full: TelemetryDecisionPayload | TelemetryEventPayload;
  minimal: TelemetryDecisionPayload | TelemetryEventPayload;
  fetchImpl?: TelemetryClientFetch | undefined;
}): Promise<TelemetryWriteResult> {
  const telemetryConfig = normalizeTelemetryConfig(config.telemetry, {
    source: config.defaultSource
  });
  const endpoint = buildEndpoint(telemetryConfig, config.requestKind);
  if (!telemetryConfig.enabled) {
    return {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "disabled",
      failure_kind: "unexpected_failure",
      message: "Telemetry is disabled.",
      diagnostics: [
        createTelemetryDiagnostic({
          event: "telemetry_disabled",
          source: telemetryConfig.source,
          requestKind: config.requestKind,
          payload: config.minimal,
          workerId: telemetryConfig.workerId,
          controllerMode: telemetryConfig.controllerMode
        })
      ]
    };
  }

  const selected = selectTelemetryPayload({
    mode: telemetryConfig.mode,
    full: config.full,
    minimal: config.minimal,
    maxBytes: telemetryConfig.maxBytes,
    source: telemetryConfig.source,
    requestKind: config.requestKind,
    workerId: telemetryConfig.workerId,
    controllerMode: telemetryConfig.controllerMode
  });

  if (!selected.payload) {
    return maybeThrow(telemetryConfig, {
      ok: false,
      endpoint,
      method: "POST",
      request_kind: config.requestKind,
      outcome: "skipped",
      failure_kind: "oversize_skipped",
      message: "Telemetry payload skipped by central size policy.",
      cause: "local_oversize_guard",
      payload_bytes: selected.payloadBytes,
      max_bytes: telemetryConfig.maxBytes,
      diagnostics: selected.diagnostics
    });
  }

  const validation = validatePayload({
    telemetryConfig,
    requestKind: config.requestKind,
    endpoint,
    payload: selected.payload,
    payloadBytes: selected.payloadBytes,
    diagnostics: selected.diagnostics
  });
  if (validation) {
    return validation;
  }

  return postPayload({
    telemetryConfig,
    requestKind: config.requestKind,
    payload: selected.payload,
    payloadBytes: selected.payloadBytes,
    outcome: selected.outcome === "downgraded" ? "downgraded" : "posted",
    diagnostics: selected.diagnostics,
    fetchImpl: config.fetchImpl ?? globalThis.fetch.bind(globalThis)
  });
}

export async function emitTelemetryDecision(config: {
  telemetry: TelemetryConfigInput;
  payloads: TelemetryDecisionBuildResult;
  fetchImpl?: TelemetryClientFetch | undefined;
}): Promise<TelemetryWriteResult> {
  return emitTelemetry({
    telemetry: config.telemetry,
    defaultSource: config.telemetry.source ?? "gameplay",
    requestKind: "telemetry_decision",
    full: config.payloads.full,
    minimal: config.payloads.minimal,
    fetchImpl: config.fetchImpl
  });
}

export async function emitTelemetryEvent(config: {
  telemetry: TelemetryConfigInput;
  payloads: TelemetryEventBuildResult;
  fetchImpl?: TelemetryClientFetch | undefined;
}): Promise<TelemetryWriteResult> {
  return emitTelemetry({
    telemetry: config.telemetry,
    defaultSource: config.telemetry.source ?? "gameplay",
    requestKind: "telemetry_event",
    full: config.payloads.full,
    minimal: config.payloads.minimal,
    fetchImpl: config.fetchImpl
  });
}

export const telemetryFailureKinds: Record<TelemetryFailureKind, true> = {
  client_validation: true,
  network_failure: true,
  backend_rejection: true,
  unexpected_failure: true,
  oversize_skipped: true
};
