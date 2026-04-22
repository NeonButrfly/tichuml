import {
  BACKEND_SETTINGS_STORAGE_KEY,
  DEFAULT_BACKEND_BASE_URL,
  DEFAULT_SERVER_PORT,
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
  if (value === "lightgbm_model") {
    return "lightgbm_model";
  }

  if (value === "server" || value === "server_heuristic") {
    return "server_heuristic";
  }

  return "local";
}

type BrowserLocationLike = Pick<
  Location,
  "host" | "origin" | "port" | "protocol"
>;

export function resolveBrowserBackendBaseUrl(
  location: BrowserLocationLike | undefined
): string | null {
  if (!location || !["http:", "https:"].includes(location.protocol)) {
    return null;
  }

  if (!location.host || location.port !== String(DEFAULT_SERVER_PORT)) {
    return null;
  }

  return normalizeBackendBaseUrl(location.origin);
}

function resolveDefaultBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_BASE_URL;
  if (configured) {
    return normalizeBackendBaseUrl(configured);
  }

  return (
    resolveBrowserBackendBaseUrl(
      typeof window === "undefined" ? undefined : window.location
    ) ?? DEFAULT_BACKEND_BASE_URL
  );
}

export function getBackendSettingsDefaults(): BackendRuntimeSettings {
  return {
    decisionMode: readDecisionMode(import.meta.env.VITE_DECISION_MODE),
    backendBaseUrl: resolveDefaultBackendBaseUrl(),
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
    const parsedBackendBaseUrl =
      typeof parsed.backendBaseUrl === "string"
        ? normalizeBackendBaseUrl(parsed.backendBaseUrl)
        : defaults.backendBaseUrl;
    const backendBaseUrl =
      parsedBackendBaseUrl === DEFAULT_BACKEND_BASE_URL &&
      defaults.backendBaseUrl !== DEFAULT_BACKEND_BASE_URL
        ? defaults.backendBaseUrl
        : parsedBackendBaseUrl;

    return {
      decisionMode:
        parsed.decisionMode === "lightgbm_model" ||
        parsed.decisionMode === "server_heuristic" ||
        parsed.decisionMode === "server"
          ? readDecisionMode(parsed.decisionMode)
          : defaults.decisionMode,
      backendBaseUrl,
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
