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
  });
});
