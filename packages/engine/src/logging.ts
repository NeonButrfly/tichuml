type StructuredLogLevel = "info" | "warn" | "error";

type StructuredLogConfig = {
  level: StructuredLogLevel;
  message: string;
  payload?: Record<string, unknown>;
  throttleKey?: string;
  windowMs?: number;
};

type ThrottledLogState = {
  lastLoggedAt: number;
  suppressedCount: number;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createThrottledStructuredLogger(defaultWindowMs = 5_000) {
  const state = new Map<string, ThrottledLogState>();

  return function logStructured(config: StructuredLogConfig): void {
    const payload = config.payload ?? {};
    const throttleKey =
      config.throttleKey ??
      stableStringify({
        level: config.level,
        message: config.message,
        payload
      });
    const windowMs = config.windowMs ?? defaultWindowMs;
    const now = Date.now();
    const existing = state.get(throttleKey);

    if (existing && now - existing.lastLoggedAt < windowMs) {
      existing.suppressedCount += 1;
      state.set(throttleKey, existing);
      return;
    }

    const suppressedCount = existing?.suppressedCount ?? 0;
    state.set(throttleKey, { lastLoggedAt: now, suppressedCount: 0 });

    const serializedPayload =
      suppressedCount > 0
        ? { ...payload, suppressed_duplicates: suppressedCount }
        : payload;
    const logFn =
      config.level === "info"
        ? console.info
        : config.level === "warn"
          ? console.warn
          : console.error;

    logFn(config.message, serializedPayload);
  };
}
