import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  normalizeBackendBaseUrl,
  validateDecisionRequestPayload,
  validateTelemetryDecisionPayload,
  validateTelemetryEventPayload,
  type DecisionRequestPayload,
  type DecisionResponsePayload,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";

type FetchLike = typeof fetch;

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<T> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : `Request failed with HTTP ${response.status}.`
    );
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
    fetchImpl
  );
}

export async function postDecisionRequest(
  baseUrl: string,
  payload: DecisionRequestPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<DecisionResponsePayload> {
  const parsed = validateDecisionRequestPayload(payload);
  if (!parsed.ok) {
    return {
      accepted: false,
      chosen_action: null,
      provider_used: null,
      validation_errors: parsed.issues
    };
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
    fetchImpl
  );
}

export async function postTelemetryDecision(
  baseUrl: string,
  payload: TelemetryDecisionPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<void> {
  const parsed = validateTelemetryDecisionPayload(payload);
  if (!parsed.ok) {
    throw new Error("Local telemetry payload failed validation before upload.");
  }

  await fetchJson<{ accepted: boolean }>(
    buildUrl(baseUrl, TELEMETRY_DECISION_PATH),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parsed.value)
    },
    fetchImpl
  );
}

export async function postTelemetryEvent(
  baseUrl: string,
  payload: TelemetryEventPayload,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<void> {
  const parsed = validateTelemetryEventPayload(payload);
  if (!parsed.ok) {
    throw new Error("Local event telemetry payload failed validation before upload.");
  }

  await fetchJson<{ accepted: boolean }>(
    buildUrl(baseUrl, TELEMETRY_EVENT_PATH),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parsed.value)
    },
    fetchImpl
  );
}
