import { fileURLToPath } from "node:url";
import { createAppServer } from "./app.js";
import { loadServerConfig } from "./config/env.js";
import { ensureDatabaseReady } from "./db/bootstrap.js";
import { createDatabaseClient } from "./db/postgres.js";
import { createLightgbmScorer } from "./ml/lightgbm-scorer.js";
import { PostgresTelemetryRepository } from "./services/telemetry-repository.js";
import { getBackendRuntimeInfo } from "./utils/runtime-info.js";

function serializeStartupError(error: unknown): Record<string, unknown> {
  if (error instanceof AggregateError) {
    const aggregateCode =
      typeof (error as unknown as { code?: unknown }).code === "string"
        ? (error as unknown as { code: string }).code
        : undefined;
    return {
      name: error.name,
      message: error.message,
      ...(aggregateCode ? { code: aggregateCode } : {}),
      causes: error.errors.map((cause) => serializeStartupError(cause))
    };
  }

  if (error instanceof Error) {
    const maybeCode =
      typeof (error as unknown as { code?: unknown }).code === "string"
        ? (error as unknown as { code: string }).code
        : undefined;
    return {
      name: error.name,
      message: error.message,
      ...(maybeCode ? { code: maybeCode } : {}),
      ...(error.stack ? { stack: error.stack } : {})
    };
  }

  if (typeof error === "object" && error !== null) {
    return {
      value: String(error),
      ...error
    };
  }

  return {
    value: String(error)
  };
}

export async function startServer() {
  const serverConfig = loadServerConfig();
  console.info("[server] startup", {
    stage: "config_loaded",
    host: serverConfig.host,
    port: serverConfig.port,
    autoBootstrapDatabase: serverConfig.autoBootstrapDatabase,
    autoMigrate: serverConfig.autoMigrate
  });

  console.info("[server] startup", { stage: "database_ready_begin" });
  await ensureDatabaseReady({
    databaseUrl: serverConfig.databaseUrl,
    bootstrapUrl: serverConfig.pgBootstrapUrl,
    autoBootstrapDatabase: serverConfig.autoBootstrapDatabase,
    autoMigrate: serverConfig.autoMigrate
  });
  console.info("[server] startup", { stage: "database_ready_complete" });

  const sql = createDatabaseClient(serverConfig.databaseUrl);
  console.info("[server] startup", { stage: "database_client_created" });
  const repository = new PostgresTelemetryRepository(sql);
  console.info("[server] startup", { stage: "repository_created" });
  const lightgbmScorer = createLightgbmScorer(serverConfig);
  console.info("[server] startup", { stage: "lightgbm_scorer_created" });
  const server = createAppServer({
    serverConfig,
    repository,
    lightgbmScorer
  });
  console.info("[server] startup", { stage: "http_server_created" });

  await new Promise<void>((resolve) => {
    server.listen(serverConfig.port, serverConfig.host, () => {
      const runtime = getBackendRuntimeInfo(serverConfig);
      console.info("[server] listening", {
        host: serverConfig.host,
        port: serverConfig.port,
        pid: runtime.pid,
        cwd: runtime.cwd,
        commandLine: runtime.command_line,
        databaseUrl: runtime.database_url,
        gitCommit: runtime.git_commit,
        buildTimestamp: runtime.build_timestamp,
        backendMode: runtime.backend_mode,
        requestBodyLimitBytes: serverConfig.requestBodyLimitBytes,
        requestBodyLimit: serverConfig.requestBodyLimitLabel
      });
      resolve();
    });
  });

  const shutdown = async (signal: string) => {
    console.info("[server] shutting down", { signal });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await sql.end();
    await lightgbmScorer.close();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });

  return server;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer().catch((error: unknown) => {
    console.error("[server] failed to start", serializeStartupError(error));
    process.exitCode = 1;
  });
}
