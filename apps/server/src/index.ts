import { fileURLToPath } from "node:url";
import { createAppServer } from "./app.js";
import { loadServerConfig } from "./config/env.js";
import { ensureDatabaseReady } from "./db/bootstrap.js";
import { createDatabaseClient } from "./db/postgres.js";
import { PostgresTelemetryRepository } from "./services/telemetry-repository.js";

export async function startServer() {
  const serverConfig = loadServerConfig();
  await ensureDatabaseReady({
    databaseUrl: serverConfig.databaseUrl,
    bootstrapUrl: serverConfig.pgBootstrapUrl,
    autoBootstrapDatabase: serverConfig.autoBootstrapDatabase,
    autoMigrate: serverConfig.autoMigrate
  });

  const sql = createDatabaseClient(serverConfig.databaseUrl);
  const repository = new PostgresTelemetryRepository(sql);
  const server = createAppServer({ serverConfig, repository });

  await new Promise<void>((resolve) => {
    server.listen(serverConfig.port, serverConfig.host, () => {
      console.info("[server] listening", {
        host: serverConfig.host,
        port: serverConfig.port,
        databaseUrl: serverConfig.databaseUrl
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
    console.error("[server] failed to start", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
