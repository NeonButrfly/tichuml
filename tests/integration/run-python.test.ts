import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.cwd();

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
        cwd: REPO_ROOT,
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"value": 7');
  });

  it("sanitizes non-finite JSON values before emitting python-side metadata", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join("node_modules", "tsx", "dist", "cli.mjs"),
        "scripts/run-python.ts",
        "-c",
        "import math, sys; sys.path.insert(0, 'ml'); from json_utils import dumps_json_safe; print(dumps_json_safe({'metric': math.nan, 'nested': [math.inf, -math.inf, 7.0]}))",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("NaN");
    expect(result.stdout).not.toContain("Infinity");
    expect(JSON.parse(result.stdout.trim())).toEqual({
      metric: null,
      nested: [null, null, 7]
    });
  });
});
