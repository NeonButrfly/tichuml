import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

function resolveUsableBash(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
        ]
      : ["bash"];

  for (const candidate of candidates) {
    if (candidate === "bash") {
      const result = spawnSync("bash", ["-lc", "echo ok"], {
        cwd: repoRoot(),
        encoding: "utf8"
      });
      if (result.status === 0 && result.stdout.includes("ok")) {
        return candidate;
      }
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
});

const bashPath = resolveUsableBash();
const bashDescribe = bashPath !== null ? describe : describe.skip;

bashDescribe("backend-common remote database startup", () => {
  it("skips local docker postgres checks when DATABASE_URL points remote", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tichuml-backend-common-remote-db-")
    );
    cleanupPaths.push(tempDir);

    const scriptsDir = path.join(tempDir, "scripts");
    const binDir = path.join(tempDir, "bin");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      '{ "name": "tichuml-backend-common-remote-db-fixture" }\n',
      "utf8"
    );
    fs.copyFileSync(
      path.join(repoRoot(), "scripts", "backend-common.sh"),
      path.join(scriptsDir, "backend-common.sh")
    );
    fs.copyFileSync(
      path.join(repoRoot(), "scripts", "database-target.mjs"),
      path.join(scriptsDir, "database-target.mjs")
    );

    const dockerLog = path.join(tempDir, "docker.log");
    const psqlLog = path.join(tempDir, "psql.log");

    fs.writeFileSync(
      path.join(binDir, "docker"),
      `#!/usr/bin/env bash\necho docker_called >> "${dockerLog.replace(/\\/g, "/")}"\nexit 99\n`,
      { encoding: "utf8", mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(binDir, "psql"),
      `#!/usr/bin/env bash\necho \"$*\" >> "${psqlLog.replace(/\\/g, "/")}"\nexit 0\n`,
      { encoding: "utf8", mode: 0o755 }
    );

    const result = spawnSync(
      bashPath!,
      [
        "-lc",
        [
          "export DATABASE_URL='postgres://tichu:tichu_dev_password@192.168.50.196:54329/tichu'",
          "export POSTGRES_CONTAINER_NAME='tichu-postgres'",
          "export POSTGRES_USER='tichu'",
          "export POSTGRES_DB='tichu'",
          "export POSTGRES_PORT='54329'",
          "source ./backend-common.sh",
          "start_postgres",
          "wait_for_postgres",
          "echo remote_ok"
        ].join(" && ")
      ],
      {
        cwd: scriptsDir,
        encoding: "utf8",
        env: {
          ...process.env,
          BACKEND_REPO_ROOT: tempDir,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("remote_ok");
    expect(fs.existsSync(dockerLog)).toBe(false);
    expect(fs.readFileSync(psqlLog, "utf8")).toContain("SELECT 1");
  });
});
