import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerConfig } from "../../apps/server/src/config/env";
import { FileRuntimeAdminService } from "../../apps/server/src/services/runtime-admin-service";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function createTempRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tichuml-runtime-admin-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, ".runtime"), { recursive: true });
  return root;
}

function createConfig(repoRoot: string): ServerConfig {
  return {
    port: 4310,
    host: "0.0.0.0",
    databaseUrl: "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
    pgBootstrapUrl: "postgres://tichu:tichu_dev_password@localhost:54329/postgres",
    allowedOrigin: "*",
    autoBootstrapDatabase: true,
    autoMigrate: true,
    backendBaseUrl: "http://localhost:4310",
    destructiveAdminEndpointsEnabled: false,
    adminSimControlEnabled: false,
    runtimeAdminControlEnabled: true,
    traceDecisionRequests: false,
    requestBodyLimitBytes: 25 * 1024 * 1024,
    requestBodyLimitLabel: "25mb",
    telemetryMode: "minimal",
    telemetryMaxPostBytes: 24 * 1024 * 1024,
    telemetryPostTimeoutMs: 10000,
    telemetryIngestQueueMaxDepth: 5000,
    telemetryPersistenceBatchSize: 100,
    telemetryPersistenceConcurrency: 2,
    simDefaultProvider: "local",
    simDefaultBackendUrl: "http://localhost:4310",
    simDefaultWorkerCount: 1,
    simDefaultGamesPerBatch: 1,
    simControllerRuntimeDir: path.join(repoRoot, ".runtime", "sim-controller"),
    repoRoot,
    pythonExecutable: "python",
    lightgbmInferScript: path.join(repoRoot, "ml", "infer.py"),
    lightgbmModelPath: path.join(
      repoRoot,
      "ml",
      "model_registry",
      "lightgbm_action_model.txt"
    ),
    lightgbmModelMetaPath: path.join(
      repoRoot,
      "ml",
      "model_registry",
      "lightgbm_action_model.meta.json"
    )
  };
}

describe("runtime admin config manager", () => {
  it("writes shell-safe env values and marks restart-required changes", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      ["# keep this comment", "PORT=4310", "BACKEND_PUBLIC_URL=http://old:4310"].join(
        "\n"
      )
    );
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    const result = await service.saveConfig({
      PORT: "4311",
      BACKEND_PUBLIC_URL: "http://host-name:4311"
    });

    expect(result.accepted).toBe(true);
    expect(result.restart_required).toBe(true);
    const envText = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
    expect(envText).toContain("# keep this comment");
    expect(envText).toContain("PORT=4311");
    expect(envText).toContain("BACKEND_PUBLIC_URL_OVERRIDE_ENABLED=true");
    expect(envText).toContain("BACKEND_PUBLIC_URL_OVERRIDE=http://host-name:4311");
    const status = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".runtime", "config-status.json"), "utf8")
    ) as { pending_restart: boolean };
    expect(status.pending_restart).toBe(true);
  });

  it("rejects multiline env values", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "PORT=4310\n");
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    await expect(
      service.saveConfig({
        BACKEND_PUBLIC_URL: "http://ok\nMALICIOUS=true"
      })
    ).rejects.toThrow(/cannot contain newlines/u);
  });

  it("renders boolean config as boolean entries and rejects non-boolean values", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, ".env"),
      "ENABLE_RUNTIME_ADMIN_CONTROL=true\nAUTO_MIGRATE=false\n"
    );
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    const config = await service.readConfig();
    expect(config.entries.find((entry) => entry.key === "AUTO_MIGRATE")?.type).toBe(
      "boolean"
    );
    expect(config.entries.some((entry) => entry.key === "ENABLE_RUNTIME_ADMIN_CONTROL")).toBe(
      false
    );
    expect(
      config.entries.find((entry) => entry.key === "ENABLE_ADMIN_SIM_CONTROL")
        ?.savedValue
    ).toBe("false");

    await expect(
      service.saveConfig({
        AUTO_MIGRATE: "yes"
      })
    ).rejects.toThrow(/Expected true or false/u);
  });

  it("uses detected host IPs when no override is saved", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "PORT=4310\n");
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    const config = await service.readConfig();
    const hostIp = config.entries.find((entry) => entry.key === "BACKEND_HOST_IP");

    expect(hostIp?.value).toBe("");
    expect(hostIp?.effectiveValue).toBeTruthy();
    expect(hostIp?.overrideEnabled).toBe(false);
  });

  it("stores only override state and value for automated fields", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "PORT=4310\n");
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    await service.saveConfig({
      BACKEND_HOST_IP: {
        overrideEnabled: true,
        overrideValue: "192.168.50.44"
      }
    });

    const envText = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
    expect(envText).toContain("BACKEND_HOST_IP_OVERRIDE_ENABLED=true");
    expect(envText).toContain("BACKEND_HOST_IP_OVERRIDE=192.168.50.44");
    expect(envText).not.toContain("BACKEND_HOST_IP=192.168.50.44");
  });

  it("persists admin safety lock state as config", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "ENABLE_RUNTIME_ADMIN_CONTROL=true\n");
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    const result = await service.setAdminSafetyLocked(true);

    expect(result.locked).toBe(true);
    const envText = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
    expect(envText).toContain("ENABLE_RUNTIME_ADMIN_CONTROL=false");
  });

  it("persists simulator and telemetry runtime defaults with restart-pending based on real deltas", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env"), "ENABLE_RUNTIME_ADMIN_CONTROL=true\n");
    const service = new FileRuntimeAdminService(createConfig(repoRoot));

    const before = await service.readConfig();
    expect(before.pending_restart).toBe(false);
    expect(before.entries.find((entry) => entry.key === "SIM_PROVIDER")?.input).toBe(
      "select"
    );
    expect(before.entries.find((entry) => entry.key === "TELEMETRY_MODE")?.input).toBe(
      "select"
    );

    const result = await service.saveConfig({
      SIM_PROVIDER: "server_heuristic",
      SIM_WORKER_COUNT: "3",
      SIM_GAMES_PER_BATCH: "5",
      SIM_BACKEND_URL: "http://192.168.50.44:4310",
      TELEMETRY_MODE: "full",
      TELEMETRY_MAX_POST_BYTES: "123456"
    });

    expect(result.accepted).toBe(true);
    expect(result.restart_required).toBe(true);
    expect(result.config.pending_restart).toBe(true);
    const envText = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
    expect(envText).toContain("SIM_PROVIDER=server_heuristic");
    expect(envText).toContain("SIM_WORKER_COUNT=3");
    expect(envText).toContain("SIM_GAMES_PER_BATCH=5");
    expect(envText).toContain("SIM_BACKEND_URL=http://192.168.50.44:4310");
    expect(envText).toContain("TELEMETRY_MODE=full");
    expect(envText).toContain("TELEMETRY_MAX_POST_BYTES=123456");
  });
});
