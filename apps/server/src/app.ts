import http from "node:http";
import type { ServerConfig } from "./config/env.js";
import { createRouter } from "./routes/router.js";
import type { TelemetryRepository } from "./services/telemetry-repository.js";

export function createAppServer(config: {
  serverConfig: ServerConfig;
  repository: TelemetryRepository;
}): http.Server {
  return http.createServer(
    createRouter({
      config: config.serverConfig,
      repository: config.repository
    })
  );
}
