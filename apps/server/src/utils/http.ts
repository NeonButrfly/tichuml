import http from "node:http";
import type { ValidationIssue } from "@tichuml/shared";

export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 25 * 1024 * 1024;

export class RequestBodyLimitError extends Error {
  readonly limitBytes: number;
  readonly receivedBytes: number;

  constructor(limitBytes: number, receivedBytes: number) {
    super(
      `Request body exceeded the supported size limit (${receivedBytes} bytes > ${limitBytes} bytes).`
    );
    this.name = "RequestBodyLimitError";
    this.limitBytes = limitBytes;
    this.receivedBytes = receivedBytes;
  }
}

export function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  allowedOrigin = "*"
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-confirm"
  });
  response.end(body);
}

export async function readJsonBody(
  request: http.IncomingMessage,
  options: { maxBytes?: number } = {}
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const maxBytes =
    Number.isFinite(options.maxBytes) && options.maxBytes !== undefined && options.maxBytes > 0
      ? Math.floor(options.maxBytes)
      : DEFAULT_REQUEST_BODY_LIMIT_BYTES;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.byteLength;
    if (totalBytes > maxBytes) {
      throw new RequestBodyLimitError(maxBytes, totalBytes);
    }

    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid JSON request body: ${
        error instanceof Error ? error.message : "Unknown parse error."
      }`
    );
  }
}

export function handleCorsPreflight(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  allowedOrigin: string
): boolean {
  if (request.method !== "OPTIONS") {
    return false;
  }

  response.writeHead(204, {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-confirm"
  });
  response.end();
  return true;
}

export function notFound(
  response: http.ServerResponse,
  allowedOrigin: string
): void {
  writeJson(response, 404, { error: "Not found." }, allowedOrigin);
}

export function badRequest(
  response: http.ServerResponse,
  message: string,
  allowedOrigin: string,
  validationErrors?: ValidationIssue[]
): void {
  writeJson(
    response,
    400,
    {
      accepted: false,
      error: message,
      ...(validationErrors ? { validation_errors: validationErrors } : {})
    },
    allowedOrigin
  );
}
