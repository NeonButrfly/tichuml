import {
  BACKEND_SETTINGS_STORAGE_KEY,
  DEFAULT_BACKEND_BASE_URL,
  normalizeBackendBaseUrl,
  parseBooleanEnv,
  type BackendReachabilityState,
  type BackendRuntimeSettings,
  type DecisionMode
} from "@tichuml/shared";

export type BackendReachability = {
  state: BackendReachabilityState;
  detail: string | null;
  checkedAt: string | null;
};

function readDecisionMode(value: string | undefined): DecisionMode {
  return value === "server" ? "server" : "local";
}

export function getBackendSettingsDefaults(): BackendRuntimeSettings {
  return {
    decisionMode: readDecisionMode(import.meta.env.VITE_DECISION_MODE),
    backendBaseUrl: normalizeBackendBaseUrl(
      import.meta.env.VITE_BACKEND_BASE_URL ?? DEFAULT_BACKEND_BASE_URL
    ),
    serverFallbackEnabled: parseBooleanEnv(
      import.meta.env.VITE_SERVER_FALLBACK_ENABLED,
      true
    ),
    telemetryEnabled: parseBooleanEnv(
      import.meta.env.VITE_TELEMETRY_ENABLED,
      true
    )
  };
}

export function loadBackendSettings(): BackendRuntimeSettings {
  const defaults = getBackendSettingsDefaults();

  if (typeof window === "undefined") {
    return defaults;
  }

  const raw = window.localStorage.getItem(BACKEND_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BackendRuntimeSettings>;
    return {
      decisionMode:
        parsed.decisionMode === "server" ? parsed.decisionMode : defaults.decisionMode,
      backendBaseUrl: normalizeBackendBaseUrl(
        typeof parsed.backendBaseUrl === "string"
          ? parsed.backendBaseUrl
          : defaults.backendBaseUrl
      ),
      serverFallbackEnabled:
        typeof parsed.serverFallbackEnabled === "boolean"
          ? parsed.serverFallbackEnabled
          : defaults.serverFallbackEnabled,
      telemetryEnabled:
        typeof parsed.telemetryEnabled === "boolean"
          ? parsed.telemetryEnabled
          : defaults.telemetryEnabled
    };
  } catch {
    return defaults;
  }
}

export function persistBackendSettings(settings: BackendRuntimeSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    BACKEND_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings)
  );
}

export function createUnknownBackendReachability(): BackendReachability {
  return {
    state: "unknown",
    detail: null,
    checkedAt: null
  };
}
