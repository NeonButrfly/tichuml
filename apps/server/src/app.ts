import http from "node:http";
import type { ServerConfig } from "./config/env.js";
import type { LightgbmScorer } from "./ml/lightgbm-scorer.js";
import { createRouter } from "./routes/router.js";
import {
  FileRuntimeAdminService,
  type RuntimeAdminService
} from "./services/runtime-admin-service.js";
import { FileSimControllerService, type SimControllerService } from "./services/sim-controller-service.js";
import {
  TelemetryIngestQueue,
  type TelemetryQueueConfig
} from "./services/telemetry-ingest-queue.js";
import type { TelemetryRepository } from "./services/telemetry-repository.js";

export function createAppServer(config: {
  serverConfig: ServerConfig;
  repository: TelemetryRepository;
  lightgbmScorer?: LightgbmScorer;
  simController?: SimControllerService;
  runtimeAdmin?: RuntimeAdminService;
  telemetryQueue?: TelemetryIngestQueue;
}): http.Server {
  const simController =
    config.simController ?? new FileSimControllerService(config.serverConfig);
  const runtimeAdmin =
    config.runtimeAdmin ?? new FileRuntimeAdminService(config.serverConfig);
  const telemetryQueue =
    config.telemetryQueue ??
    new TelemetryIngestQueue(config.repository, {
      maxDepth: config.serverConfig.telemetryIngestQueueMaxDepth,
      batchSize: config.serverConfig.telemetryPersistenceBatchSize,
      concurrency: config.serverConfig.telemetryPersistenceConcurrency
    } satisfies TelemetryQueueConfig);
  const server = http.createServer(
    createRouter(
      config.lightgbmScorer
        ? {
            config: config.serverConfig,
            repository: config.repository,
            lightgbmScorer: config.lightgbmScorer,
            simController,
            runtimeAdmin,
            telemetryQueue
          }
        : {
            config: config.serverConfig,
            repository: config.repository,
            simController,
            runtimeAdmin,
            telemetryQueue
          }
    )
  );
  server.on("close", () => {
    void telemetryQueue.drain();
  });
  return server;
}
