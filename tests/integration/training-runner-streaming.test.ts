import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runStreamingProcess } from "../../scripts/lib/training-runner.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("runStreamingProcess", () => {
  it("returns a nonzero exit code and error details when spawn fails", async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "training-runner-streaming-")
    );
    tempRoots.push(tempRoot);
    const logFile = path.join(tempRoot, "run.log");

    const result = await runStreamingProcess({
      command: "__missing_training_command__",
      args: ["--definitely-not-real"],
      cwd: tempRoot,
      logFile,
      mirrorToParent: false
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.signal).toBeNull();
    expect(result.errorMessage).toMatch(/missing|not found|ENOENT/i);
    expect(result.outputTail.join("\n")).toMatch(
      /__missing_training_command__|missing|not found|ENOENT/i
    );
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const logText = fs.readFileSync(logFile, "utf8");
    expect(logText).toContain("__missing_training_command__");
  });
});
