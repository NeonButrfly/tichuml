import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

function hasCommand(name: string): boolean {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [name], {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function resolveGitBashPath(): string | null {
  if (process.platform !== "win32") {
    return hasCommand("bash") ? "bash" : null;
  }
  const candidates = [
    process.env.GIT_BASH_PATH,
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "bash.exe")
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  expect(trimmed.startsWith("{")).toBe(true);
  return JSON.parse(trimmed) as Record<string, unknown>;
}

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
};

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
  }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command} ${args.join(" ")}`));
        return;
      }
      resolve({
        status: code,
        stdout,
        stderr,
        signal
      });
    });
  });
}

function scopedCount(report: Record<string, unknown>, key: string): number {
  const value = report[key];
  return typeof value === "number" ? value : 0;
}

function buildSessionName(prefix: string): string {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return `${prefix}-${token}`.toLowerCase();
}

function stopWindowsTrainingSession(root: string, sessionName: string): void {
  spawnSync(
    "powershell",
    [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(root, "scripts", "stop-training.ps1"),
      "-SessionName",
      sessionName,
      "-Force",
      "-TimeoutSeconds",
      "30"
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "ignore"
    }
  );
}

function stopLinuxTrainingSession(root: string, bashPath: string, sessionName: string): void {
  spawnSync(
    bashPath,
    [path.join(root, "scripts", "stop-training.sh"), "--session", sessionName, "--force", "--timeout-seconds", "30"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "ignore"
    }
  );
}

const runSmoke = process.env.TICHUML_RUN_TRAINING_START_SMOKE === "1";
const gitBashPath = resolveGitBashPath();
const sharedSmokeCommands = ["npx", "psql", "git", "tar"];
const canRunWindowsSmoke =
  runSmoke &&
  process.platform === "win32" &&
  ["powershell", ...sharedSmokeCommands].every(hasCommand);
const canRunLinuxSmoke =
  runSmoke &&
  gitBashPath !== null &&
  sharedSmokeCommands.every(hasCommand);

const windowsDescribe = canRunWindowsSmoke ? describe : describe.skip;
const linuxDescribe = canRunLinuxSmoke ? describe : describe.skip;

windowsDescribe("Windows training start smoke", () => {
  it(
    "waits for verified scoped DB rows before reporting success",
    async () => {
      const root = repoRoot();
      const sessionName = buildSessionName("codex-training-smoke-win");
      const outputDir = path.join(root, ".runtime", "training-start-smoke", "windows");

      try {
        const startResult = await runCommand(
          "powershell",
          [
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(root, "scripts", "start-training.ps1"),
            "-SessionName",
            sessionName,
            "-Games",
            "1",
            "-Provider",
            "server_heuristic",
            "-BackendUrl",
            "http://127.0.0.1:4310",
            "-NoClear",
            "-ReplaceSession",
            "-SkipMlExportCheck",
            "-OutputDir",
            outputDir
          ],
          {
            cwd: root,
            timeoutMs: 240000
          }
        );

        expect(startResult.status).toBe(0);
        expect(startResult.stdout).toContain(`Training job verified: ${sessionName}`);
        expect(startResult.stdout).toContain("Scoped rows: matches=");

        const statusResult = await runCommand(
          "powershell",
          [
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(root, "scripts", "status-training.ps1"),
            "-SessionName",
            sessionName,
            "-TailLines",
            "5"
          ],
          {
            cwd: root,
            timeoutMs: 120000
          }
        );

        expect(statusResult.status).toBe(0);
        const status = parseJsonOutput(statusResult.stdout);
        expect(scopedCount(status, "completed_scoped_matches")).toBeGreaterThanOrEqual(1);
        expect(scopedCount(status, "completed_scoped_events")).toBeGreaterThanOrEqual(1);
        expect(scopedCount(status, "completed_scoped_decisions")).toBeGreaterThanOrEqual(1);
      } finally {
        stopWindowsTrainingSession(root, sessionName);
      }
    },
    300000
  );
});

linuxDescribe("Linux training start smoke", () => {
  it(
    "waits for verified scoped DB rows before reporting success",
    async () => {
      const root = repoRoot();
      const bashPath = gitBashPath ?? "bash";
      const sessionName = buildSessionName("codex-training-smoke-linux");
      const outputDir = path.join(root, ".runtime", "training-start-smoke", "linux");

      try {
        const startResult = await runCommand(
          bashPath,
          [
            path.join(root, "scripts", "start-training.sh"),
            "--session",
            sessionName,
            "--games",
            "1",
            "--provider",
            "server_heuristic",
            "--backend-url",
            "http://127.0.0.1:4310",
            "--no-clear",
            "--replace-session",
            "--skip-ml-export-check",
            "--output-dir",
            outputDir
          ],
          {
            cwd: root,
            timeoutMs: 240000,
            env: {
              ...process.env,
              TMPDIR: process.env.TMPDIR ?? os.tmpdir()
            }
          }
        );

        expect(startResult.status).toBe(0);
        expect(startResult.stdout).toContain(`Training job verified: ${sessionName}`);
        expect(startResult.stdout).toContain("Scoped rows: matches=");

        const statusResult = await runCommand(
          bashPath,
          [path.join(root, "scripts", "status-training.sh"), "--session", sessionName, "--tail-lines", "5"],
          {
            cwd: root,
            timeoutMs: 120000
          }
        );

        expect(statusResult.status).toBe(0);
        const status = parseJsonOutput(statusResult.stdout);
        expect(scopedCount(status, "completed_scoped_matches")).toBeGreaterThanOrEqual(1);
        expect(scopedCount(status, "completed_scoped_events")).toBeGreaterThanOrEqual(1);
        expect(scopedCount(status, "completed_scoped_decisions")).toBeGreaterThanOrEqual(1);
      } finally {
        stopLinuxTrainingSession(root, bashPath, sessionName);
      }
    },
    300000
  );
});
