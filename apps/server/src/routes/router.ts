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
import { summarizeDecisionRequest } from "../providers/provider-utils.js";
import type { RuntimeAdminService } from "../services/runtime-admin-service.js";
import { renderRuntimeControlPanel } from "../services/runtime-control-panel.js";
import type { SimControllerService } from "../services/sim-controller-service.js";
import type { TelemetryIngestQueue } from "../services/telemetry-ingest-queue.js";
import type { TelemetryRepository } from "../services/telemetry-repository.js";
import {
  badRequest,
  handleCorsPreflight,
  notFound,
  RequestBodyLimitError,
  readJsonBody,
  writeJson
} from "../utils/http.js";
import {
  getBackendRuntimeInfo,
  TELEMETRY_HEALTH_SHAPE_VERSION
} from "../utils/runtime-info.js";

type RouterDependencies = {
  config: ServerConfig;
  repository: TelemetryRepository;
  simController: SimControllerService;
  runtimeAdmin: RuntimeAdminService;
  telemetryQueue: TelemetryIngestQueue;
  lightgbmScorer?: LightgbmScorer;
};

const SIM_DASHBOARD_PATHS = new Set(["/admin/sim", "/sim/control"]);

function logDecisionTrace(
  config: ServerConfig,
  event: string,
  payload: Record<string, unknown>
): void {
  if (!config.traceDecisionRequests) {
    return;
  }
  console.info(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

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

async function readRuntimeAdminBody(
  request: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  return (await readJsonBody(request)) as Record<string, unknown>;
}

async function assertRuntimeActionRequest(
  request: http.IncomingMessage,
  runtimeAdmin: RuntimeAdminService,
  action: string | null
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; issues: Array<{ path: string; message: string }> }> {
  const issues: Array<{ path: string; message: string }> = [];
  const body = (await readJsonBody(request)) as Record<string, unknown>;

  if (await runtimeAdmin.isAdminSafetyLocked()) {
    issues.push({
      path: "admin_safety",
      message:
        "Admin safety lock is enabled. Disable the lock before running runtime actions."
    });
  }

  if (action === "clear_db" && body.confirmed !== true) {
    issues.push({
      path: "confirmed",
      message: "Clear DB requires explicit confirmation."
    });
  }

  return issues.length === 0 ? { ok: true, body } : { ok: false, issues };
}

export function createRouter({
  config,
  repository,
  simController,
  runtimeAdmin,
  telemetryQueue,
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
    const readConfiguredJsonBody = () =>
      readJsonBody(request, { maxBytes: config.requestBodyLimitBytes });

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

      if (request.method === "POST" && url.pathname === "/api/admin/runtime/config") {
        const body = await readRuntimeAdminBody(request);
        const values =
          typeof body.values === "object" &&
          body.values !== null &&
          !Array.isArray(body.values)
            ? (body.values as Record<string, unknown>)
            : body;
        writeJson(
          response,
          200,
          await runtimeAdmin.saveConfig(values),
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/runtime/safety") {
        const body = await readRuntimeAdminBody(request);
        if (typeof body.locked !== "boolean") {
          badRequest(response, "Expected locked boolean.", config.allowedOrigin, [
            { path: "locked", message: "Expected locked boolean." }
          ]);
          return;
        }
        if (body.locked === false && body.confirmed !== true) {
          badRequest(response, "Unlock requires confirmation.", config.allowedOrigin, [
            { path: "confirmed", message: "Expected confirmed=true when disabling the lock." }
          ]);
          return;
        }
        writeJson(
          response,
          200,
          await runtimeAdmin.setAdminSafetyLocked(body.locked),
          config.allowedOrigin
        );
        return;
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/api/admin/runtime/action" ||
          url.pathname.startsWith("/api/admin/runtime/actions/"))
      ) {
        const action = url.pathname.startsWith("/api/admin/runtime/actions/")
          ? url.pathname
              .slice("/api/admin/runtime/actions/".length)
              .replace(/-/gu, "_")
          : null;
        const guard = await assertRuntimeActionRequest(request, runtimeAdmin, action);
        if (!guard.ok) {
          badRequest(
            response,
            "Runtime admin safeguards were not satisfied.",
            config.allowedOrigin,
            guard.issues
          );
          return;
        }

        if (action) {
          writeJson(
            response,
            202,
            await runtimeAdmin.runAction(action),
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
        const runtime = getBackendRuntimeInfo(config);
        writeJson(
          response,
          200,
          {
            ok: true,
            service: "tichuml-server",
            runtime,
            database: {
              status: "deferred",
              database_url: runtime.database_url
            },
            telemetry_ingest: {
              ready: true,
              health_endpoint: "/api/telemetry/health",
              health_shape_version: TELEMETRY_HEALTH_SHAPE_VERSION
            }
          },
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/telemetry/health") {
        const stats = await repository.getHealthStats();
        const queue = telemetryQueue.stats();
        writeJson(
          response,
          200,
          {
            accepted: true,
            ready: true,
            shape_version: TELEMETRY_HEALTH_SHAPE_VERSION,
            runtime: getBackendRuntimeInfo(config),
            queue_accepted: queue.accepted,
            queue_pending: queue.pending,
            queue_in_flight: queue.in_flight_batches,
            queue_persisted: queue.persisted,
            queue_dropped: queue.dropped_queue_pressure,
            persistence_failures: queue.persistence_failures,
            last_failure_at: queue.last_failure_at,
            last_failure_message: queue.last_failure_message,
            last_failure_detail: queue.last_failure_detail,
            db_decisions_count: stats.decisions,
            db_events_count: stats.events,
            db_matches_count: stats.matches,
            db_latest_decision_ts: stats.latest_decision_ts,
            db_latest_event_ts: stats.latest_event_ts,
            stats,
            queue
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
        const parsed = validateTelemetryDecisionPayload(await readConfiguredJsonBody());
        if (!parsed.ok) {
          badRequest(
            response,
            "Invalid telemetry decision payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        const queued = telemetryQueue.enqueueDecision(parsed.value);
        writeJson(
          response,
          202,
          {
            accepted: true,
            telemetry_id: null,
            queued: queued.queued,
            dropped: queued.dropped,
            queue_depth: queued.queue_depth,
            ...(queued.drop_reason ? { drop_reason: queued.drop_reason } : {})
          },
          config.allowedOrigin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === TELEMETRY_EVENT_PATH) {
        const parsed = validateTelemetryEventPayload(await readConfiguredJsonBody());
        if (!parsed.ok) {
          badRequest(
            response,
            "Invalid telemetry event payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        const queued = telemetryQueue.enqueueEvent(parsed.value);
        writeJson(
          response,
          202,
          {
            accepted: true,
            event_id: null,
            queued: queued.queued,
            dropped: queued.dropped,
            queue_depth: queued.queue_depth,
            ...(queued.drop_reason ? { drop_reason: queued.drop_reason } : {})
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
        const startedAt = Date.now();
        const parseStartedAt = Date.now();
        const body = await readConfiguredJsonBody();
        const parseMs = Date.now() - parseStartedAt;
        const validateStartedAt = Date.now();
        const parsed = validateDecisionRequestPayload(body);
        const validateMs = Date.now() - validateStartedAt;
        const payloadBytes = Number(request.headers["content-length"] ?? 0) || 0;
        if (!parsed.ok) {
          logDecisionTrace(config, "decision_request_rejected", {
            reason: "payload_validation",
            validation_issues: parsed.issues,
            latency_ms: Date.now() - startedAt,
            parse_ms: parseMs,
            validate_ms: validateMs,
            payload_bytes: payloadBytes
          });
          badRequest(
            response,
            "Invalid decision request payload.",
            config.allowedOrigin,
            parsed.issues
          );
          return;
        }

        logDecisionTrace(config, "decision_request_received", {
          ...summarizeDecisionRequest(parsed.value),
          parse_ms: parseMs,
          validate_ms: validateMs,
          payload_bytes: payloadBytes
        });
        let decisionResponse;
        try {
          decisionResponse = await handleDecisionRequest(
            repository,
            parsed.value,
            {
              ...(lightgbmScorer ? { lightgbmScorer } : {}),
              traceDecisionRequests: config.traceDecisionRequests,
              parseMs,
              validateMs,
              payloadBytes
            }
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unexpected decision error.";
          const event = message.startsWith("Actor mismatch:")
            ? "decision_request_rejected"
            : "decision_request_failed";
          logDecisionTrace(config, event, {
            game_id: parsed.value.game_id,
            hand_id: parsed.value.hand_id,
            phase: parsed.value.phase,
            actor_seat: parsed.value.actor_seat,
            requested_provider: parsed.value.requested_provider,
            error: message,
            latency_ms: Date.now() - startedAt,
            parse_ms: parseMs,
            validate_ms: validateMs,
            payload_bytes: payloadBytes
          });
          if (message.startsWith("Actor mismatch:")) {
            badRequest(response, message, config.allowedOrigin, [
              { path: "actor_seat", message }
            ]);
            return;
          }
          throw error;
        }
        logDecisionTrace(config, "decision_request_resolved", {
          ...summarizeDecisionRequest(parsed.value),
          provider_used: decisionResponse.provider_used,
          telemetry_id: decisionResponse.telemetry_id,
          latency_ms: Date.now() - startedAt,
          parse_ms: parseMs,
          validate_ms: validateMs,
          payload_bytes: payloadBytes,
          scoring_path:
            typeof decisionResponse.metadata?.scoring_path === "string"
              ? decisionResponse.metadata.scoring_path
              : "fast_path"
        });
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
      if (error instanceof RequestBodyLimitError) {
        writeJson(
          response,
          413,
          {
            accepted: false,
            error: error.message,
            limit_bytes: error.limitBytes,
            received_bytes: error.receivedBytes
          },
          config.allowedOrigin
        );
        return;
      }
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
