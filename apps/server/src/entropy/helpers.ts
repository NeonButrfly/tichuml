import crypto from "node:crypto";
import type { SeedJsonValue } from "@tichuml/shared";
import type { EntropyLogger, EntropyRuntime } from "./types.js";

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

function createConsoleLogger(): EntropyLogger {
  return {
    info(message, details) {
      console.info(message, details ?? {});
    },
    warn(message, details) {
      console.warn(message, details ?? {});
    },
    error(message, details) {
      console.error(message, details ?? {});
    }
  };
}

export function createDefaultEntropyRuntime(
  overrides: Partial<Omit<EntropyRuntime, "logger">> & {
    logger?: EntropyLogger;
  } = {}
): EntropyRuntime {
  const runtime: EntropyRuntime = {
    fetch: overrides.fetch ?? globalThis.fetch,
    now: overrides.now ?? (() => new Date()),
    randomBytes: overrides.randomBytes ?? ((size) => crypto.randomBytes(size)),
    randomUUID: overrides.randomUUID ?? (() => crypto.randomUUID()),
    logger: overrides.logger ?? createConsoleLogger()
  };

  if (!runtime.fetch) {
    throw new Error("Global fetch is unavailable in the entropy runtime.");
  }

  return runtime;
}

export async function readResponseBuffer(
  response: Response,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(`Response exceeded max size of ${maxBytes} bytes.`);
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("response_too_large");
      throw new Error(`Response exceeded max size of ${maxBytes} bytes.`);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function fetchBuffer(config: {
  url: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  maxBytes?: number;
  headers?: HeadersInit;
}): Promise<{ response: Response; body: Buffer }> {
  const requestInit: RequestInit = {
    method: "GET",
    signal: config.signal
  };
  if (config.headers) {
    requestInit.headers = config.headers;
  }

  const response = await config.fetchImpl(config.url, requestInit);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${config.url}`);
  }

  const body = await readResponseBuffer(
    response,
    config.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  );
  return { response, body };
}

export async function fetchJson(config: {
  url: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  maxBytes?: number;
  headers?: HeadersInit;
}): Promise<{ response: Response; json: unknown; text: string }> {
  const { response, body } = await fetchBuffer(config);
  const text = body.toString("utf8");

  try {
    return { response, json: JSON.parse(text), text };
  } catch (error) {
    throw new Error(
      `Invalid JSON from ${config.url}: ${
        error instanceof Error ? error.message : "Unknown parse error."
      }`
    );
  }
}

export function formatHexPreview(bytes: Buffer, visibleHexLength = 24): string {
  if (bytes.byteLength === 0) {
    return "empty";
  }

  const hex = bytes.toString("hex");
  const visible = hex.slice(0, visibleHexLength);
  return `${visible}${hex.length > visibleHexLength ? "…" : ""} (${bytes.byteLength} bytes)`;
}

export function summarizeSourcePreview(
  value: SeedJsonValue,
  fallbackBytes: Buffer
): string {
  if (typeof value === "string") {
    const trimmed = value.length > 60 ? `${value.slice(0, 60)}…` : value;
    return `${trimmed} (${value.length} chars)`;
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const keys = Object.keys(value).slice(0, 5);
    return keys.length > 0
      ? `keys: ${keys.join(", ")}`
      : formatHexPreview(fallbackBytes);
  }

  if (Array.isArray(value)) {
    return `items: ${value.length}`;
  }

  if (value === null) {
    return formatHexPreview(fallbackBytes);
  }

  return String(value);
}

export function asSeedJsonValue(value: unknown): SeedJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => asSeedJsonValue(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        asSeedJsonValue(entry)
      ])
    );
  }

  return String(value);
}

export function toIsoString(value: Date): string {
  return value.toISOString();
}
