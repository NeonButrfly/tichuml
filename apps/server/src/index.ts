import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  FOUNDATION_MILESTONE,
  defaultDatabaseUrl,
  isSeedProviderName,
  type SeedProviderName
} from "@tichuml/shared";
import {
  generateEntropySeed,
  serializeEntropyGenerationResult
} from "./entropy/index.js";

const DEFAULT_SERVER_PORT = 4310;
const MAX_REQUEST_BYTES = 32 * 1024;

export function createServerManifest() {
  return {
    service: "server",
    milestone: FOUNDATION_MILESTONE,
    databaseUrl: defaultDatabaseUrl,
    entropyEndpoint: "/api/entropy/generate"
  };
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown
) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(body);
}

async function readJsonBody(
  request: http.IncomingMessage
): Promise<Record<string, unknown>> {
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
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid JSON request body: ${
        error instanceof Error ? error.message : "Unknown parse error."
      }`
    );
  }
}

function parseOptionalSourceIds(value: unknown): SeedProviderName[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is SeedProviderName =>
    isSeedProviderName(entry)
  );
}

export function createEntropyHttpServer() {
  return http.createServer(async (request, response) => {
    if (!request.url) {
      writeJson(response, 400, { error: "Missing request URL." });
      return;
    }

    const url = new URL(request.url, "http://localhost");

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/manifest") {
      writeJson(response, 200, createServerManifest());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/entropy/generate") {
      try {
        const body = await readJsonBody(request);
        const roundIndex =
          typeof body.roundIndex === "number" && Number.isFinite(body.roundIndex)
            ? body.roundIndex
            : 1;
        const enabledSourceIds = parseOptionalSourceIds(body.enabledSourceIds);
        const result = await generateEntropySeed({
          roundIndex,
          ...(typeof body.gameId === "string" ? { gameId: body.gameId } : {}),
          ...(typeof body.unixTimeMs === "number" && Number.isFinite(body.unixTimeMs)
            ? { unixTimeMs: body.unixTimeMs }
            : {}),
          ...(enabledSourceIds ? { enabledSourceIds } : {}),
          includeBlitzortung: body.includeBlitzortung === true,
          ...(typeof body.blitzortungUrl === "string"
            ? { blitzortungUrl: body.blitzortungUrl }
            : {})
        });
        writeJson(response, 200, serializeEntropyGenerationResult(result));
      } catch (error) {
        writeJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Entropy generation failed."
        });
      }
      return;
    }

    writeJson(response, 404, { error: "Not found." });
  });
}

export function startServer(port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT)) {
  const server = createEntropyHttpServer();
  server.listen(port, () => {
    console.info("[server] listening", { port });
  });
  return server;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer();
}
