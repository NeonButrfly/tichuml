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

function hasCommand(name: string): boolean {
  const probe = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(probe, [name], {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function toShellPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function writeExecutable(filePath: string, contents: string) {
  fs.writeFileSync(filePath, contents, "utf8");
  fs.chmodSync(filePath, 0o755);
}

const bashPath = resolveUsableBash();
const shouldRunBashLaunchers = bashPath !== null && hasCommand("node");
const bashDescribe = shouldRunBashLaunchers ? describe : describe.skip;
const cleanupPaths: string[] = [];

afterEach(() => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
});

bashDescribe("linux reset-db launcher", () => {
  it(
    "uses shared backend helpers and loads env before waiting on Postgres",
    () => {
      const root = repoRoot();
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "tichuml-linux-reset-db-")
      );
      cleanupPaths.push(tempDir);
      const binDir = path.join(tempDir, "bin");
      const logFile = path.join(tempDir, "invocations.log");
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(logFile, "", "utf8");

      writeExecutable(
        path.join(binDir, "docker"),
        `#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\\n' "$*" >> "${toShellPath(logFile)}"
exit 0
`
      );
      writeExecutable(
        path.join(binDir, "docker-compose"),
        `#!/usr/bin/env bash
set -euo pipefail
printf 'docker-compose %s\\n' "$*" >> "${toShellPath(logFile)}"
exit 0
`
      );
      writeExecutable(
        path.join(binDir, "npm"),
        `#!/usr/bin/env bash
set -euo pipefail
printf 'npm %s\\n' "$*" >> "${toShellPath(logFile)}"
exit 0
`
      );

      const result = spawnSync(bashPath!, ["./reset-db-linux.sh", "--yes"], {
        cwd: path.join(root, "scripts"),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      });

      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      const invocations = fs.readFileSync(logFile, "utf8");

      expect(result.status).toBe(0);
      expect(output).not.toContain("command not found");
      expect(output).not.toContain("unbound variable");
      expect(invocations).toContain("docker info");
      expect(invocations).toContain("docker compose version");
      expect(invocations).toContain("docker compose -f");
      expect(invocations).toContain("down -v --remove-orphans");
      expect(invocations).toContain("up -d postgres");
      expect(invocations).toContain("exec -T postgres pg_isready -U tichu -d tichu");
      expect(invocations).toContain("docker rm -f tichu-postgres");
      expect(invocations).toContain("npm run db:migrate");
    },
    30000
  );
});
