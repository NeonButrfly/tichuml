import { inspect } from "node:util";

export type SerializedErrorDetail = {
  name: string;
  message: string;
  stack: string | null;
  code: string | null;
  detail: string | null;
  hint: string | null;
  constraint: string | null;
  table: string | null;
  column: string | null;
  schema: string | null;
  type: string;
  value_preview: string | null;
  causes: SerializedErrorDetail[];
};

function readStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.length > 0 ? entry : null;
}

function previewUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 0 ? value : "[empty string]";
  }
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string" && json.length > 0) {
      return json;
    }
  } catch {
    // Fall through to util.inspect.
  }
  return inspect(value, { depth: 4, breakLength: 160 });
}

function nonEmptyMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }
  const nested = Array.isArray((value as { errors?: unknown } | null)?.errors)
    ? (value as { errors: unknown[] }).errors
        .map((entry) => nonEmptyMessage(entry, ""))
        .filter((entry) => entry.length > 0)
        .join("; ")
    : "";
  if (nested.length > 0) {
    const codePrefix = readStringProperty(value, "code");
    return codePrefix ? `${codePrefix}: ${nested}` : nested;
  }
  const code = readStringProperty(value, "code");
  if (code) {
    return code;
  }
  const preview = previewUnknown(value);
  return preview.length > 0 ? preview : fallback;
}

export function serializeErrorDetail(
  error: unknown,
  fallback = "Unknown telemetry persistence failure."
): SerializedErrorDetail {
  const causes = Array.isArray((error as { errors?: unknown } | null)?.errors)
    ? (error as { errors: unknown[] }).errors.map((entry) =>
        serializeErrorDetail(entry, fallback)
      )
    : [];

  return {
    name:
      error instanceof Error
        ? error.name
        : readStringProperty(error, "name") ?? typeof error,
    message: nonEmptyMessage(error, fallback),
    stack: error instanceof Error && error.stack ? error.stack : null,
    code: readStringProperty(error, "code"),
    detail: readStringProperty(error, "detail"),
    hint: readStringProperty(error, "hint"),
    constraint: readStringProperty(error, "constraint"),
    table: readStringProperty(error, "table"),
    column: readStringProperty(error, "column"),
    schema: readStringProperty(error, "schema"),
    type: typeof error,
    value_preview: error instanceof Error ? null : previewUnknown(error),
    causes
  };
}

export function serializeErrorMessage(
  error: unknown,
  fallback = "Unknown telemetry persistence failure."
): string {
  return serializeErrorDetail(error, fallback).message;
}
