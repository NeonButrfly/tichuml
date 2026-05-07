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

bashDescribe("linux simulator helper contract", () => {
  it("defines kill_sim_processes and allows a no-op cleanup run", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tichuml-linux-sim-helper-")
    );
    cleanupPaths.push(tempDir);

    fs.mkdirSync(path.join(tempDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      '{ "name": "tichuml-linux-sim-helper-fixture" }\n',
      "utf8"
    );
    fs.copyFileSync(
      path.join(repoRoot(), "scripts", "backend-common.sh"),
      path.join(tempDir, "scripts", "backend-common.sh")
    );

    const result = spawnSync(
      bashPath!,
      [
        "-lc",
        "source ./backend-common.sh && type kill_sim_processes >/dev/null 2>&1 && kill_sim_processes && echo helper_ok"
      ],
      {
        cwd: path.join(tempDir, "scripts"),
        encoding: "utf8",
        env: {
          ...process.env,
          BACKEND_REPO_ROOT: tempDir
        }
      }
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("helper_ok");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "kill_sim_processes: command not found"
    );
  });
});
