import http from "node:http";
import type { ValidationIssue } from "@tichuml/shared";

const MAX_REQUEST_BYTES = 512 * 1024;

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
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(body);
}

export async function readJsonBody(
  request: http.IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error("Request body exceeded the supported size limit.");
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
    "Access-Control-Allow-Headers": "Content-Type"
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
