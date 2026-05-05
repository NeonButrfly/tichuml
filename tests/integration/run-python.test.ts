import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("run-python launcher", () => {
  it("forwards child stdout through the wrapper so parent callers can capture JSON output", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join("node_modules", "tsx", "dist", "cli.mjs"),
        "scripts/run-python.ts",
        "-c",
        "import json; print(json.dumps({'ok': True, 'value': 7}))",
      ],
      {
        cwd: "C:\\tichu\\tichuml",
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"value": 7');
  });
});
