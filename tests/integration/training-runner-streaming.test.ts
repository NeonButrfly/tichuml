import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeRemainingRequestedGames,
  runStreamingProcess
} from "../../scripts/lib/training-runner.js";

describe("training runner streaming execution", () => {
  it("streams large child output directly to the run log without ENOBUFS", async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tichuml-training-runner-stream-")
    );
    const runLog = path.join(tempRoot, "run.log");

    const result = await runStreamingProcess({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.stdout.write('stdout:'.padEnd(1_200_000, 'x'));",
          "process.stderr.write('stderr:'.padEnd(1_200_000, 'y'));"
        ].join("")
      ],
      cwd: process.cwd(),
      logFile: runLog,
      mirrorToParent: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.enobufsDetected).toBe(false);
    expect(fs.statSync(runLog).size).toBeGreaterThan(2_000_000);
  });

  it("keeps requesting the remaining scoped matches until the target is reached", () => {
    expect(
      computeRemainingRequestedGames({
        requestedGames: 3,
        scopedMatches: 0
      })
    ).toBe(3);
    expect(
      computeRemainingRequestedGames({
        requestedGames: 3,
        scopedMatches: 1
      })
    ).toBe(2);
    expect(
      computeRemainingRequestedGames({
        requestedGames: 3,
        scopedMatches: 3
      })
    ).toBe(0);
  });
});
