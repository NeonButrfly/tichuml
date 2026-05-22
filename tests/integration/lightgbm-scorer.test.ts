import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerConfig, type ServerConfig } from "../../apps/server/src/config/env";
import {
  parseJsonObjectAllowingNonFiniteLiterals,
  PythonLightgbmScorer
} from "../../apps/server/src/ml/lightgbm-scorer";

function createTestConfig(tempDir: string, inferScript: string): ServerConfig {
  const resolved = loadServerConfig({}, { repoRoot: process.cwd() });
  return {
    ...resolved,
    repoRoot: tempDir,
    pythonExecutable: resolved.pythonExecutable,
    lightgbmInferScript: inferScript,
    lightgbmModelPath: path.join(tempDir, "fake-model.txt"),
    lightgbmModelMetaPath: path.join(tempDir, "fake-model.meta.json")
  };
}

describe("lightgbm scorer protocol", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs.splice(0)) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          break;
        } catch (error) {
          if (
            attempt === 9 ||
            !(error instanceof Error) ||
            !String(error.message).includes("EPERM")
          ) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }
  });

  it("parses non-finite literals in model metadata without throwing", () => {
    expect(
      parseJsonObjectAllowingNonFiniteLiterals(
        '{"id":"score-1","scores":[1.5],"model_metadata":{"validation_metrics":{"spearman":NaN,"upper":Infinity,"lower":-Infinity},"label":"NaN stays in strings"},"runtime_metadata":{}}'
      )
    ).toEqual({
      id: "score-1",
      scores: [1.5],
      model_metadata: {
        validation_metrics: {
          spearman: null,
          upper: null,
          lower: null
        },
        label: "NaN stays in strings"
      },
      runtime_metadata: {}
    });
  });

  it("rejects malformed inference output without hanging pending requests", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lightgbm-scorer-test-"));
    tempDirs.push(tempDir);
    const inferScript = path.join(tempDir, "fake-infer.py");
    fs.writeFileSync(
      inferScript,
      [
        "import json",
        "import sys",
        "",
        "for line in sys.stdin:",
        "    request = json.loads(line)",
        "    sys.stdout.write('{\"id\": \"%s\", \"scores\": [0.5], \"model_metadata\": {\"broken\": }\\n' % request['id'])",
        "    sys.stdout.flush()",
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(tempDir, "fake-model.txt"), "model", "utf8");
    fs.writeFileSync(path.join(tempDir, "fake-model.meta.json"), "{}", "utf8");

    const scorer = new PythonLightgbmScorer(createTestConfig(tempDir, inferScript));

    await expect(
      scorer.score({
        stateRaw: {},
        actorSeat: "seat-0",
        phase: "trick_play",
        legalActions: [],
        stateFeatures: {} as never,
        candidateFeatures: []
      })
    ).rejects.toThrow(/invalid json/i);

    await scorer.close();
  });
});
