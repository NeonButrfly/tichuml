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

function makeFixture(): {
  tempDir: string;
  scriptPath: string;
  binDir: string;
} {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "tichuml-install-backend-lock-")
  );
  cleanupPaths.push(tempDir);
  const scriptsDir = path.join(tempDir, "scripts");
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot(), "scripts", "install-backend.sh"),
    path.join(scriptsDir, "install-backend.sh")
  );
  fs.chmodSync(path.join(scriptsDir, "install-backend.sh"), 0o755);
  return {
    tempDir,
    scriptPath: path.join(scriptsDir, "install-backend.sh"),
    binDir
  };
}

function writeMockPgrep(binDir: string, content: string): void {
  const mockPath = path.join(binDir, "pgrep");
  fs.writeFileSync(mockPath, content, "utf8");
  fs.chmodSync(mockPath, 0o755);
}

bashDescribe("install-backend apt lock detection", () => {
  it("ignores broad false-positive pgrep matches like thermald when exact package-manager names are absent", () => {
    const fixture = makeFixture();
    writeMockPgrep(
      fixture.binDir,
      `#!/usr/bin/env bash
if [ "$1" = "-a" ] && [ "$2" = "-f" ] && [ "$3" = "apt|dpkg|unattended-upgrade" ]; then
  echo "1234 thermald --adaptive"
  exit 0
fi
exit 1
`
    );

    const result = spawnSync(
      bashPath!,
      [
        "-lc",
        [
          "script_path=\"$0\"",
          "source <(sed '/^main \"\\$@\"/d' \"$script_path\")",
          "snapshot=\"$(package_manager_process_snapshot || true)\"",
          "if [ -z \"$snapshot\" ]; then echo SNAPSHOT_EMPTY; else printf '%s\\n' \"$snapshot\"; fi"
        ].join("; "),
        fixture.scriptPath
      ],
      {
        cwd: fixture.tempDir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SNAPSHOT_EMPTY");
    expect(result.stdout).not.toContain("thermald");
  });

  it("still reports real package-manager processes when an exact apt-get match exists", () => {
    const fixture = makeFixture();
    writeMockPgrep(
      fixture.binDir,
      `#!/usr/bin/env bash
if [ "$1" = "-a" ] && [ "$2" = "-x" ] && [ "$3" = "apt-get" ]; then
  echo "4242 apt-get update"
  exit 0
fi
exit 1
`
    );

    const result = spawnSync(
      bashPath!,
      [
        "-lc",
        [
          "script_path=\"$0\"",
          "source <(sed '/^main \"\\$@\"/d' \"$script_path\")",
          "snapshot=\"$(package_manager_process_snapshot || true)\"",
          "if [ -z \"$snapshot\" ]; then echo SNAPSHOT_EMPTY; else printf '%s\\n' \"$snapshot\"; fi"
        ].join("; "),
        fixture.scriptPath
      ],
      {
        cwd: fixture.tempDir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("apt-get update");
  });
});
