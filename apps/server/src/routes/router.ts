import http from "node:http";
import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  ADMIN_CONFIRMATION_VALUE,
  ADMIN_DATABASE_CLEAR_PATH,
  ADMIN_DATABASE_RESET_PATH,
  ADMIN_TELEMETRY_CLEAR_PATH,
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  validateDecisionRequestPayload,
  validateTelemetryDecisionPayload,
  validateTelemetryEventPayload
} from "@tichuml/shared";
import {
  generateEntropySeed,
  serializeEntropyGenerationResult
} from "../entropy/index.js";
import type { ServerConfig } from "../config/env.js";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";
import { handleDecisionRequest } from "../services/decision-service.js";
import type { TelemetryRepository } from "../services/telemetry-repository.js";
import {
  badRequest,
  handleCorsPreflight,
  notFound,
  readJsonBody,
  writeJson
} from "../utils/http.js";

type RouterDependencies = {
  config: ServerConfig;
  repository: TelemetryRepository;
  lightgbmScorer?: LightgbmScorer;
};

function createServerManifest(config: ServerConfig) {
  return {
    service: "server",
    databaseUrl: config.databaseUrl,
    entropyEndpoint: "/api/entropy/generate",
    healthEndpoint: BACKEND_HEALTH_PATH,
    telemetryDecisionEndpoint: TELEMETRY_DECISION_PATH,
    telemetryEventEndpoint: TELEMETRY_EVENT_PATH,
    decisionEndpoint: DECISION_REQUEST_PATH
  };
}

function extractGameId(pathname: string, suffix: string): string | null {
  const prefix = "/api/games/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const gameId = pathname.slice(prefix.length, pathname.length - suffix.length);
  return gameId.length > 0 ? decodeURIComponent(gameId) : null;
}

async function assertDestructiveAdminRequest(
  request: http.IncomingMessage,
  config: ServerConfig
): Promise<{ ok: true } | { ok: false; issues: Array<{ path: string; message: string }> }> {
  const issues: Array<{ path: string; message: string }> = [];
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const headerConfirm = request.headers["x-admin-confirm"];
  const bodyConfirm = body.confirm;
  const confirmed =
    headerConfirm === ADMIN_CONFIRMATION_VALUE ||
    bodyConfirm === ADMIN_CONFIRMATION_VALUE;

  if (!config.destructiveAdminEndpointsEnabled) {
    issues.push({
      path: "ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS",
      message:
        "Destructive admin endpoints are disabled. Set ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS=true for development use."
    });
  }

  if (!confirmed) {
    issues.push({
      path: "x-admin-confirm",
      message: `Expected x-admin-confirm or body.confirm to equal ${ADMIN_CONFIRMATION_VALUE}.`
    });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function createRouter({
  config,
  repository,
  lightgbmScorer
}: RouterDependencies): http.RequestListener {
  return async (request, response) => {
    if (!request.url) {
      badRequest(response, "Missing request URL.", config.allowedOrigin);
      return;
    }

    if (handleCorsPreflight(request, response, config.allowedOrigin)) {
      return;
    }

    const url = new URL(request.url, config.backendBaseUrl);

    try {
      if (request.method === "GET" && url.pathname === "/api/manifest") {
        writeJson(response, 200, createServerManifest(config), config.allowedOrigin);
        return;
      }

      if (request.method === "GET" && url.pathname === BACKEND_HEALTH_PATH) {
        await repository.ping();
        writeJson(
          response,
          200,
          {
            ok: true,
            service: "tichuml-server",
            database: "ok"
          },
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/telemetry/health") {
        writeJson(
          response,
          200,
          {
            accepted: true,
            stats: await repository.getHealthStats()
          },
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/entropy/generate") {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const roundIndex =
          typeof body.roundIndex === "number" && Number.isFinite(body.roundIndex)
            ? body.roundIndex
            : 1;
        const result = await generateEntropySeed({
          roundIndex,
          ...(typeof body.gameId === "string" ? { gameId: body.gameId } : {}),
          ...(typeof body.unixTimeMs === "number" && Number.isFinite(body.unixTimeMs)
            ? { unixTimeMs: body.unixTimeMs }
            : {}),
          includeBlitzortung: body.includeBlitzortung === true,
          ...(typeof body.blitzortungUrl === "string"
            ? { blitzortungUrl: body.blitzortungUrl }
            : {})
        });
        writeJson(
          response,
          200,
          serializeEntropyGenerationResult(result),
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === TELEMETRY_DECISION_PATH) {
        const parsed = validateTelemetryDecisionPayload(await readJsonBody(request));
        if (!parsed.ok) {
          badRequest(
            response,
            "Invalid telemetry decision payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        const id = await repository.insertDecision(parsed.value);
        writeJson(
          response,
          201,
          {
            accepted: true,
            telemetry_id: id
          },
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === TELEMETRY_EVENT_PATH) {
        const parsed = validateTelemetryEventPayload(await readJsonBody(request));
        if (!parsed.ok) {
          badRequest(
            response,
            "Invalid telemetry event payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        const id = await repository.insertEvent(parsed.value);
        writeJson(
          response,
          201,
          {
            accepted: true,
            telemetry_id: id
          },
          config.allowedOrigin
        );
        return;
      }

      if (
        request.method === "POST" &&
        (url.pathname === ADMIN_TELEMETRY_CLEAR_PATH ||
          url.pathname === ADMIN_DATABASE_CLEAR_PATH ||
          url.pathname === ADMIN_DATABASE_RESET_PATH)
      ) {
        const guard = await assertDestructiveAdminRequest(request, config);
        if (!guard.ok) {
          badRequest(
            response,
            "Destructive admin endpoint safeguards were not satisfied.",
            config.allowedOrigin,
            guard.issues
          );
          return;
        }

        const result =
          url.pathname === ADMIN_TELEMETRY_CLEAR_PATH
            ? await repository.clearTelemetry()
            : url.pathname === ADMIN_DATABASE_CLEAR_PATH
              ? await repository.clearDatabase()
              : await repository.resetDatabase();
        writeJson(response, 200, result, config.allowedOrigin);
        return;
      }

      if (request.method === "POST" && url.pathname === DECISION_REQUEST_PATH) {
        const parsed = validateDecisionRequestPayload(await readJsonBody(request));
        if (!parsed.ok) {
          badRequest(
            response,
            "Invalid decision request payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        let decisionResponse;
        try {
          decisionResponse = await handleDecisionRequest(
            repository,
            parsed.value,
            lightgbmScorer ? { lightgbmScorer } : {}
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unexpected decision error.";
          console.error("[decision] request handling failed", {
            game_id: parsed.value.game_id,
            hand_id: parsed.value.hand_id,
            phase: parsed.value.phase,
            actor_seat: parsed.value.actor_seat,
            error: message
          });
          if (message.startsWith("Actor mismatch:")) {
            badRequest(response, message, config.allowedOrigin, [
              { path: "actor_seat", message }
            ]);
            return;
          }
          throw error;
        }
        writeJson(response, 200, decisionResponse, config.allowedOrigin);
        return;
      }

      if (request.method === "GET") {
        const decisionGameId = extractGameId(url.pathname, "/decisions");
        if (decisionGameId) {
          writeJson(
            response,
            200,
            await repository.listDecisions(decisionGameId),
            config.allowedOrigin
          );
          return;
        }

        const eventGameId = extractGameId(url.pathname, "/events");
        if (eventGameId) {
          writeJson(
            response,
            200,
            await repository.listEvents(eventGameId),
            config.allowedOrigin
          );
          return;
        }

        const replayGameId = extractGameId(url.pathname, "/replay");
        if (replayGameId) {
          writeJson(
            response,
            200,
            await repository.getReplay(replayGameId),
            config.allowedOrigin
          );
          return;
        }
      }

      notFound(response, config.allowedOrigin);
    } catch (error) {
      writeJson(
        response,
        500,
        {
          accepted: false,
          error:
            error instanceof Error ? error.message : "Unexpected server failure."
        },
        config.allowedOrigin
      );
    }
  };
}
