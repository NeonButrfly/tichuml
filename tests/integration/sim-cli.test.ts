import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../apps/sim-runner/src/cli";

async function invokeSimCli(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    log: (message?: unknown) => {
      stdout += `${String(message ?? "")}\n`;
    },
    info: () => undefined,
    warn: () => undefined,
    error: (message?: unknown) => {
      stderr += `${String(message ?? "")}\n`;
    }
  });
  return { exitCode, stdout, stderr };
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
    "uses the fileURLToPath main-module guard and completes one full local match through tsx",
    async () => {
    const cliSource = fs.readFileSync(
      path.join(process.cwd(), "apps", "sim-runner", "src", "cli.ts"),
      "utf8"
    );

    expect(cliSource).toContain("fileURLToPath(import.meta.url)");
    expect(cliSource).not.toContain("if (import.meta.main)");

    const result = await invokeSimCli(
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
        "3000"
      ]
    );

    expect(result.exitCode).toBe(0);
    const summary = extractLastJsonObject(result.stdout);
    expect(summary).toMatchObject({
      gamesPlayed: 1,
      errors: 0,
      maxDecisionLimitHit: 0
    });
    expect(summary.handsPlayed).toBeGreaterThan(1);
    expect(summary.lastCompletedGameId).toBeTruthy();
    expect(summary.lastCompletedMatchWinner).toBeTruthy();
    },
    60_000
  );

  it(
    "derives a unique training game id prefix from --run-id even without --batch-id",
    async () => {
      const runId = "goal-audit-run-123";
      const result = await invokeSimCli(
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
          "--run-id",
          runId,
          "--max-decisions-per-game",
          "3000"
        ]
      );

      expect(result.exitCode).toBe(0);
      const summary = extractLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        gamesPlayed: 1,
        errors: 0,
        maxDecisionLimitHit: 0
      });
      expect(summary.lastCompletedGameId).toBe(
        `selfplay-${runId}-game-000001`
      );
    },
    60_000
  );

  it(
    "fails loudly with a nonzero exit when the max decision guard trips",
    async () => {
    const result = await invokeSimCli(
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
      ]
    );

    expect(result.exitCode).toBe(1);
    expect(extractLastJsonObject(result.stdout)).toMatchObject({
      gamesPlayed: 1,
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
