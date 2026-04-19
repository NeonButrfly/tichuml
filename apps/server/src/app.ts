import http from "node:http";
import type { ServerConfig } from "./config/env.js";
import type { LightgbmScorer } from "./ml/lightgbm-scorer.js";
import { createRouter } from "./routes/router.js";
import type { TelemetryRepository } from "./services/telemetry-repository.js";

export function createAppServer(config: {
  serverConfig: ServerConfig;
  repository: TelemetryRepository;
  lightgbmScorer?: LightgbmScorer;
}): http.Server {
  return http.createServer(
    createRouter(
      config.lightgbmScorer
        ? {
            config: config.serverConfig,
            repository: config.repository,
            lightgbmScorer: config.lightgbmScorer
          }
        : {
            config: config.serverConfig,
            repository: config.repository
          }
    )
  );
}
