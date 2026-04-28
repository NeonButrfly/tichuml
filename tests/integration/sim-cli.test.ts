import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function runSimCli(
  args: string[],
  timeoutMs: number
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(process.cwd(), "apps", "sim-runner", "src", "cli.ts"),
        ...args
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "0"
        }
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`sim CLI timed out after ${timeoutMs}ms.\nstdout=${stdout}\nstderr=${stderr}`)
      );
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function extractLastJsonObject(stream: string): Record<string, unknown> {
  const lines = stream
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  const last = lines.at(-1);
  if (!last) {
    throw new Error(`No JSON object found in stream:\n${stream}`);
  }
  return JSON.parse(last) as Record<string, unknown>;
}

describe("sim CLI", () => {
  it(
    "uses the fileURLToPath main-module guard and completes one local game through tsx",
    async () => {
    const cliSource = fs.readFileSync(
      path.join(process.cwd(), "apps", "sim-runner", "src", "cli.ts"),
      "utf8"
    );

    expect(cliSource).toContain("fileURLToPath(import.meta.url)");
    expect(cliSource).not.toContain("if (import.meta.main)");

    const result = await runSimCli(
      [
        "--games",
        "1",
        "--provider",
        "local",
        "--telemetry",
        "false",
        "--quiet",
        "--telemetry-mode",
        "minimal",
        "--full-state",
        "false",
        "--max-decisions-per-game",
        "300"
      ],
      60_000
    );

    expect(result.exitCode).toBe(0);
    expect(extractLastJsonObject(result.stdout)).toMatchObject({
      gamesPlayed: 1,
      errors: 0,
      maxDecisionLimitHit: 0
    });
    },
    60_000
  );

  it(
    "fails loudly with a nonzero exit when the max decision guard trips",
    async () => {
    const result = await runSimCli(
      [
        "--games",
        "1",
        "--provider",
        "local",
        "--telemetry",
        "false",
        "--quiet",
        "--telemetry-mode",
        "minimal",
        "--full-state",
        "false",
        "--max-decisions-per-game",
        "1"
      ],
      30_000
    );

    expect(result.exitCode).toBe(1);
    expect(extractLastJsonObject(result.stdout)).toMatchObject({
      gamesPlayed: 0,
      errors: 1,
      maxDecisionLimitHit: 1,
      decisionsEvaluated: 1
    });
    expect(extractLastJsonObject(result.stderr)).toMatchObject({
      accepted: false,
      reason: "incomplete_sim_batch",
      maxDecisionLimitHit: 1
    });
    },
    30_000
  );
});
