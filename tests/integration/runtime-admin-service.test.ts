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
      BACKEND_PUBLIC_URL: "http://host name:4311"
    });

    expect(result.accepted).toBe(true);
    expect(result.restart_required).toBe(true);
    const envText = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
    expect(envText).toContain("# keep this comment");
    expect(envText).toContain("PORT=4311");
    expect(envText).toContain("BACKEND_PUBLIC_URL='http://host name:4311'");
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
});
