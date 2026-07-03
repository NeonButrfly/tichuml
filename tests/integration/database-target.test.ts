import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDatabaseTarget } from "../../scripts/database-target.mjs";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

describe("database target helper", () => {
  it("treats localhost database URLs as local targets", () => {
    expect(
      parseDatabaseTarget(
        "postgres://tichu:tichu_dev_password@localhost:54329/tichu"
      )
    ).toMatchObject({
      database: "tichu",
      host: "localhost",
      isLocal: true,
      port: "54329",
      scope: "local"
    });
  });

  it("treats remote database URLs as remote targets", () => {
    expect(
      parseDatabaseTarget(
        "postgres://tichu:tichu_dev_password@192.168.50.196:54329/tichu"
      )
    ).toMatchObject({
      database: "tichu",
      host: "192.168.50.196",
      isLocal: false,
      port: "54329",
      scope: "remote"
    });
  });

  it("exposes CLI field and locality commands for shell helpers", () => {
    const scriptPath = path.join(repoRoot(), "scripts", "database-target.mjs");
    const databaseUrl =
      "postgres://tichu:tichu_dev_password@192.168.50.196:54329/tichu";

    const hostField = spawnSync(
      process.execPath,
      [scriptPath, "field", databaseUrl, "host"],
      {
        cwd: repoRoot(),
        encoding: "utf8"
      }
    );

    expect(hostField.status).toBe(0);
    expect(hostField.stdout.trim()).toBe("192.168.50.196");

    const locality = spawnSync(
      process.execPath,
      [scriptPath, "is-local", databaseUrl],
      {
        cwd: repoRoot(),
        encoding: "utf8"
      }
    );

    expect(locality.status).toBe(1);
  });
});
