import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerConfig } from "../../apps/server/src/config/env";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

async function createTempRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tichuml-server-config-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, "apps/server"), { recursive: true });
  return root;
}

describe("server config env loading", () => {
  it("loads repo and server env files when process env is missing", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      [
        "DATABASE_URL=postgres://from-root:pw@localhost:5433/rootdb",
        "PORT=5001"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(repoRoot, "apps/server/.env"),
      [
        "HOST=127.0.0.1",
        "CORS_ALLOW_ORIGIN=http://localhost:5173"
      ].join("\n")
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.databaseUrl).toBe("postgres://from-root:pw@localhost:5433/rootdb");
    expect(config.port).toBe(5001);
    expect(config.host).toBe("127.0.0.1");
    expect(config.allowedOrigin).toBe("http://localhost:5173");
  });

  it("lets process env override file defaults", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      "PORT=5001\nDATABASE_URL=postgres://from-root:pw@localhost:5433/rootdb\n"
    );

    const config = loadServerConfig(
      {
        PORT: "6111",
        DATABASE_URL: "postgres://override:pw@localhost:5444/override"
      },
      { repoRoot }
    );

    expect(config.port).toBe(6111);
    expect(config.databaseUrl).toBe(
      "postgres://override:pw@localhost:5444/override"
    );
  });

  it("loads runtime admin control flag from env", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      "ENABLE_RUNTIME_ADMIN_CONTROL=true\n"
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.runtimeAdminControlEnabled).toBe(true);
  });

  it("parses quoted env values without shell sourcing", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      [
        'DATABASE_URL="postgres://quoted:pw@localhost:5433/root db"',
        "CORS_ALLOW_ORIGIN='http://host name:5173'",
        "PORT=5002 # inline comment"
      ].join("\n")
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.databaseUrl).toBe(
      "postgres://quoted:pw@localhost:5433/root db"
    );
    expect(config.allowedOrigin).toBe("http://host name:5173");
    expect(config.port).toBe(5002);
  });

  it("uses backend base URL override fields when enabled", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      [
        "PORT=4310",
        "BACKEND_BASE_URL_OVERRIDE_ENABLED=true",
        "BACKEND_BASE_URL_OVERRIDE=http://192.168.50.44:4310"
      ].join("\n")
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.backendBaseUrl).toBe("http://192.168.50.44:4310");
    expect(config.simDefaultBackendUrl).toBe("http://127.0.0.1:4310");
  });

  it("uses explicit SIM_BACKEND_URL for simulator telemetry transport", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      [
        "PORT=4310",
        "BACKEND_LOCAL_URL=http://127.0.0.1:4310",
        "SIM_BACKEND_URL=http://192.168.50.44:4310"
      ].join("\n")
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.simDefaultBackendUrl).toBe("http://192.168.50.44:4310");
  });

  it("loads request body and telemetry post limits from env", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      [
        "REQUEST_BODY_LIMIT=32mb",
        "MAX_REQUEST_BODY_MB=12",
        "TELEMETRY_MODE=full",
        "TELEMETRY_MAX_POST_BYTES=1234567",
        "TELEMETRY_POST_TIMEOUT_MS=1234",
        "TELEMETRY_RETRY_ATTEMPTS=4",
        "TELEMETRY_RETRY_DELAY_MS=345",
        "TELEMETRY_BACKOFF_MS=4567",
        "TELEMETRY_INGEST_QUEUE_MAX_DEPTH=234",
        "TELEMETRY_PERSISTENCE_BATCH_SIZE=12",
        "TELEMETRY_PERSISTENCE_CONCURRENCY=3",
        "SIM_PROVIDER=server_heuristic",
        "SIM_BACKEND_URL=http://192.168.50.44:4310",
        "SIM_WORKER_COUNT=4",
        "SIM_GAMES_PER_BATCH=9"
      ].join("\n")
    );

    const config = loadServerConfig({}, { repoRoot });

    expect(config.requestBodyLimitBytes).toBe(32 * 1024 * 1024);
    expect(config.requestBodyLimitLabel).toBe("32mb");
    expect(config.telemetryMode).toBe("full");
    expect(config.telemetryMaxPostBytes).toBe(1234567);
    expect(config.telemetryPostTimeoutMs).toBe(1234);
    expect(config.telemetryRetryAttempts).toBe(4);
    expect(config.telemetryRetryDelayMs).toBe(345);
    expect(config.telemetryBackoffMs).toBe(4567);
    expect(config.telemetryIngestQueueMaxDepth).toBe(234);
    expect(config.telemetryPersistenceBatchSize).toBe(12);
    expect(config.telemetryPersistenceConcurrency).toBe(3);
    expect(config.simDefaultProvider).toBe("server_heuristic");
    expect(config.simDefaultBackendUrl).toBe("http://192.168.50.44:4310");
    expect(config.simDefaultWorkerCount).toBe(4);
    expect(config.simDefaultGamesPerBatch).toBe(9);
  });

  it("uses MAX_REQUEST_BODY_MB when REQUEST_BODY_LIMIT is absent", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "MAX_REQUEST_BODY_MB=7\n");

    const config = loadServerConfig({}, { repoRoot });

    expect(config.requestBodyLimitBytes).toBe(7 * 1024 * 1024);
    expect(config.requestBodyLimitLabel).toBe("7mb");
  });
});
