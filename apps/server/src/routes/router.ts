import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  BACKEND_HEALTH_PATH,
  DECISION_REQUEST_PATH,
  ADMIN_CONFIRMATION_VALUE,
  ADMIN_DATABASE_CLEAR_PATH,
  ADMIN_DATABASE_RESET_PATH,
  ADMIN_SIM_CONTINUE_PATH,
  ADMIN_SIM_PAUSE_PATH,
  ADMIN_SIM_RUN_ONCE_PATH,
  ADMIN_SIM_START_PATH,
  ADMIN_SIM_STATUS_PATH,
  ADMIN_SIM_STOP_PATH,
  ADMIN_TELEMETRY_CLEAR_PATH,
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  validateDecisionRequestPayload,
  validateTelemetryDecisionPayload,
  validateTelemetryEventPayload,
  type SimControllerRequestPayload
} from "@tichuml/shared";
import {
  generateEntropySeed,
  serializeEntropyGenerationResult
} from "../entropy/index.js";
import type { ServerConfig } from "../config/env.js";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";
import { handleDecisionRequest } from "../services/decision-service.js";
import type { RuntimeAdminService } from "../services/runtime-admin-service.js";
import { renderRuntimeControlPanel } from "../services/runtime-control-panel.js";
import type { SimControllerService } from "../services/sim-controller-service.js";
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
  simController: SimControllerService;
  runtimeAdmin: RuntimeAdminService;
  lightgbmScorer?: LightgbmScorer;
};

const SIM_DASHBOARD_PATHS = new Set(["/admin/sim", "/sim/control"]);

function getWebDistDir(config: ServerConfig): string {
  return path.join(config.repoRoot, "apps", "web", "dist");
}

function getWebContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function writeStaticFile(
  response: http.ServerResponse,
  filePath: string,
  allowedOrigin: string,
  options: { immutable?: boolean } = {}
): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, {
    "Content-Type": getWebContentType(filePath),
    "Cache-Control": options.immutable
      ? "public, max-age=31536000, immutable"
      : "no-store",
    "Access-Control-Allow-Origin": allowedOrigin
  });
  response.end(fs.readFileSync(filePath));
  return true;
}

function resolveWebAssetPath(config: ServerConfig, pathname: string): string | null {
  if (!pathname.startsWith("/assets/")) {
    return null;
  }

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const distDir = getWebDistDir(config);
  const resolvedPath = path.resolve(
    distDir,
    decodedPathname.replace(/^\/+/, "")
  );
  const distRoot = path.resolve(distDir);
  return resolvedPath.startsWith(`${distRoot}${path.sep}`) ? resolvedPath : null;
}

function serveWebAsset(
  response: http.ServerResponse,
  config: ServerConfig,
  pathname: string
): boolean {
  const assetPath = resolveWebAssetPath(config, pathname);
  return assetPath
    ? writeStaticFile(response, assetPath, config.allowedOrigin, { immutable: true })
    : false;
}

function serveSimDashboard(
  response: http.ServerResponse,
  config: ServerConfig,
  pathname: string
): boolean {
  if (!SIM_DASHBOARD_PATHS.has(pathname)) {
    return false;
  }

  return writeStaticFile(
    response,
    path.join(getWebDistDir(config), "index.html"),
    config.allowedOrigin
  );
}

function createServerManifest(config: ServerConfig) {
  return {
    service: "server",
    databaseUrl: config.databaseUrl,
    entropyEndpoint: "/api/entropy/generate",
    healthEndpoint: BACKEND_HEALTH_PATH,
    telemetryDecisionEndpoint: TELEMETRY_DECISION_PATH,
    telemetryEventEndpoint: TELEMETRY_EVENT_PATH,
    decisionEndpoint: DECISION_REQUEST_PATH,
    simControllerEndpoint: ADMIN_SIM_STATUS_PATH,
    simDashboardEndpoints: [...SIM_DASHBOARD_PATHS],
    runtimeControlPanelEndpoint: "/admin/control",
    runtimeAdminStatusEndpoint: "/api/admin/runtime/status"
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

async function assertSimAdminRequest(
  request: http.IncomingMessage,
  config: ServerConfig,
  options: { mutating: boolean }
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; issues: Array<{ path: string; message: string }> }> {
  const issues: Array<{ path: string; message: string }> = [];
  const body =
    options.mutating ? ((await readJsonBody(request)) as Record<string, unknown>) : {};
  const headerConfirm = request.headers["x-admin-confirm"];
  const bodyConfirm = body.confirm;
  const confirmed =
    headerConfirm === ADMIN_CONFIRMATION_VALUE ||
    bodyConfirm === ADMIN_CONFIRMATION_VALUE;

  if (!config.adminSimControlEnabled) {
    issues.push({
      path: "ENABLE_ADMIN_SIM_CONTROL",
      message:
        "Simulator admin control endpoints are disabled. Set ENABLE_ADMIN_SIM_CONTROL=true for development/operator use."
    });
  }

  if (options.mutating && !confirmed) {
    issues.push({
      path: "x-admin-confirm",
      message: `Expected x-admin-confirm or body.confirm to equal ${ADMIN_CONFIRMATION_VALUE}.`
    });
  }

  return issues.length === 0 ? { ok: true, body } : { ok: false, issues };
}

async function assertRuntimeAdminRequest(
  request: http.IncomingMessage,
  config: ServerConfig
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; issues: Array<{ path: string; message: string }> }> {
  const issues: Array<{ path: string; message: string }> = [];
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const headerConfirm = request.headers["x-admin-confirm"];
  const bodyConfirm = body.confirm;
  const confirmed =
    headerConfirm === ADMIN_CONFIRMATION_VALUE ||
    bodyConfirm === ADMIN_CONFIRMATION_VALUE;

  if (!config.runtimeAdminControlEnabled) {
    issues.push({
      path: "ENABLE_RUNTIME_ADMIN_CONTROL",
      message:
        "Runtime admin mutating endpoints are disabled. Set ENABLE_RUNTIME_ADMIN_CONTROL=true for trusted operator use."
    });
  }

  if (!confirmed) {
    issues.push({
      path: "x-admin-confirm",
      message: `Expected x-admin-confirm or body.confirm to equal ${ADMIN_CONFIRMATION_VALUE}.`
    });
  }

  return issues.length === 0 ? { ok: true, body } : { ok: false, issues };
}

export function createRouter({
  config,
  repository,
  simController,
  runtimeAdmin,
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
      if (request.method === "GET" && url.pathname === "/admin/control") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": config.allowedOrigin
        });
        response.end(renderRuntimeControlPanel());
        return;
      }

      if (request.method === "GET" && serveWebAsset(response, config, url.pathname)) {
        return;
      }

      if (
        request.method === "GET" &&
        serveSimDashboard(response, config, url.pathname)
      ) {
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/manifest") {
        writeJson(response, 200, createServerManifest(config), config.allowedOrigin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/runtime/status") {
        writeJson(response, 200, await runtimeAdmin.status(), config.allowedOrigin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/runtime/config") {
        writeJson(response, 200, await runtimeAdmin.readConfig(), config.allowedOrigin);
        return;
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/api/admin/runtime/config" ||
          url.pathname === "/api/admin/runtime/action")
      ) {
        const guard = await assertRuntimeAdminRequest(request, config);
        if (!guard.ok) {
          badRequest(
            response,
            "Runtime admin safeguards were not satisfied.",
            config.allowedOrigin,
            guard.issues
          );
          return;
        }

        if (url.pathname === "/api/admin/runtime/config") {
          const values =
            typeof guard.body.values === "object" &&
            guard.body.values !== null &&
            !Array.isArray(guard.body.values)
              ? (guard.body.values as Record<string, unknown>)
              : guard.body;
          writeJson(
            response,
            200,
            await runtimeAdmin.saveConfig(values),
            config.allowedOrigin
          );
          return;
        }

        if (typeof guard.body.action !== "string") {
          badRequest(response, "Expected action string.", config.allowedOrigin, [
            { path: "action", message: "Expected action string." }
          ]);
          return;
        }

        writeJson(
          response,
          202,
          await runtimeAdmin.runAction(guard.body.action),
          config.allowedOrigin
        );
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

      if (
        url.pathname === ADMIN_SIM_STATUS_PATH ||
        url.pathname === ADMIN_SIM_START_PATH ||
        url.pathname === ADMIN_SIM_PAUSE_PATH ||
        url.pathname === ADMIN_SIM_CONTINUE_PATH ||
        url.pathname === ADMIN_SIM_STOP_PATH ||
        url.pathname === ADMIN_SIM_RUN_ONCE_PATH
      ) {
        const mutating = url.pathname !== ADMIN_SIM_STATUS_PATH;
        if (
          (mutating && request.method !== "POST") ||
          (!mutating && request.method !== "GET")
        ) {
          notFound(response, config.allowedOrigin);
          return;
        }

        const guard = await assertSimAdminRequest(request, config, { mutating });
        if (!guard.ok) {
          badRequest(
            response,
            "Simulator admin control safeguards were not satisfied.",
            config.allowedOrigin,
            guard.issues
          );
          return;
        }

        const body = guard.body as SimControllerRequestPayload;
        const result =
          url.pathname === ADMIN_SIM_START_PATH
            ? await simController.start(body)
            : url.pathname === ADMIN_SIM_PAUSE_PATH
              ? await simController.pause()
              : url.pathname === ADMIN_SIM_CONTINUE_PATH
                ? await simController.continue()
                : url.pathname === ADMIN_SIM_STOP_PATH
                  ? await simController.stop()
                  : url.pathname === ADMIN_SIM_RUN_ONCE_PATH
                    ? await simController.runOnce(body)
                    : await simController.status();
        writeJson(response, result.accepted ? 200 : 409, result, config.allowedOrigin);
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
