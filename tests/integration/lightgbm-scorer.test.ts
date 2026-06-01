import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerConfig, type ServerConfig } from "../../apps/server/src/config/env";
import {
  parseJsonObjectAllowingNonFiniteLiterals,
  PythonLightgbmScorer
} from "../../apps/server/src/ml/lightgbm-scorer";

function createTestConfig(
  tempDir: string,
  inferScript: string,
  overrides: Partial<ServerConfig> = {}
): ServerConfig {
  const resolved = loadServerConfig({}, { repoRoot: process.cwd() });
  return {
    ...resolved,
    repoRoot: tempDir,
    pythonExecutable: resolved.pythonExecutable,
    lightgbmInferScript: inferScript,
    lightgbmModelPath: path.join(tempDir, "fake-model.txt"),
    lightgbmModelMetaPath: path.join(tempDir, "fake-model.meta.json"),
    ...overrides
  };
}

describe("lightgbm scorer protocol", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs.splice(0)) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          break;
        } catch (error) {
          const isPermissionRace =
            error instanceof Error && String(error.message).includes("EPERM");
          if (!isPermissionRace) {
            throw error;
          }
          if (attempt === 39) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
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

    try {
      await expect(
        scorer.score({
          stateRaw: {},
          actorSeat: "seat-0",
          phase: "trick_play",
          legalActions: [],
          stateFeatures: {} as never,
          candidateFeatures: []
        })
      ).rejects.toThrow(/invalid json|process exited/i);
    } finally {
      await scorer.close();
    }
  });

  it("retries a transient inference error once before surfacing a fallback", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lightgbm-scorer-test-"));
    tempDirs.push(tempDir);
    const inferScript = path.join(tempDir, "fake-infer.py");
    fs.writeFileSync(
      inferScript,
      [
        "import json",
        "import sys",
        "",
        "attempt = 0",
        "for line in sys.stdin:",
        "    request = json.loads(line)",
        "    attempt += 1",
        "    if attempt == 1:",
        "        sys.stdout.write(json.dumps({'id': request['id'], 'error': 'transient warmup failure'}) + '\\n')",
        "    else:",
        "        sys.stdout.write(json.dumps({'id': request['id'], 'scores': [0.75], 'model_metadata': {'objective': 'rollout_ranker'}, 'runtime_metadata': {'attempt': attempt}}) + '\\n')",
        "    sys.stdout.flush()",
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(tempDir, "fake-model.txt"), "model", "utf8");
    fs.writeFileSync(path.join(tempDir, "fake-model.meta.json"), "{}", "utf8");

    const scorer = new PythonLightgbmScorer(createTestConfig(tempDir, inferScript));

    try {
      await expect(
        scorer.score({
          stateRaw: {},
          actorSeat: "seat-0",
          phase: "trick_play",
          legalActions: [{} as never],
          stateFeatures: null,
          candidateFeatures: [null]
        })
      ).resolves.toMatchObject({
        scores: [0.75],
        modelMetadata: { objective: "rollout_ranker" },
        runtimeMetadata: { attempt: 2 }
      });
    } finally {
      await scorer.close();
    }
  });

  it("warms the inference process before the first scored request", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lightgbm-scorer-test-"));
    tempDirs.push(tempDir);
    const inferScript = path.join(tempDir, "fake-infer.py");
    fs.writeFileSync(
      inferScript,
      [
        "import json",
        "import sys",
        "import time",
        "",
        "time.sleep(1.2)",
        "",
        "for line in sys.stdin:",
        "    request = json.loads(line)",
        "    if request.get('kind') == 'ping':",
        "        sys.stdout.write(json.dumps({'id': request['id'], 'ready': True, 'runtime_metadata': {'warmed': True}}) + '\\n')",
        "    else:",
        "        sys.stdout.write(json.dumps({'id': request['id'], 'scores': [0.5], 'model_metadata': {}, 'runtime_metadata': {'warmed': True}}) + '\\n')",
        "    sys.stdout.flush()",
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(tempDir, "fake-model.txt"), "model", "utf8");
    fs.writeFileSync(path.join(tempDir, "fake-model.meta.json"), "{}", "utf8");

    const scorer = new PythonLightgbmScorer(createTestConfig(tempDir, inferScript));

    try {
      await expect(scorer.warmup()).resolves.toBeUndefined();

      const startedAt = Date.now();
      await expect(
        scorer.score({
          stateRaw: {},
          actorSeat: "seat-0",
          phase: "trick_play",
          legalActions: [{} as never],
          stateFeatures: null,
          candidateFeatures: [null]
        })
      ).resolves.toMatchObject({
        scores: [0.5],
        runtimeMetadata: { warmed: true }
      });
      expect(Date.now() - startedAt).toBeLessThan(1000);
    } finally {
      await scorer.close();
    }
  });

  it("times out a slow inference request and recovers on the next score", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lightgbm-scorer-test-"));
    tempDirs.push(tempDir);
    const inferScript = path.join(tempDir, "fake-infer.py");
    const slowMarkerPath = path.join(tempDir, "slow-request.marker");
    fs.writeFileSync(
      inferScript,
      [
        "import json",
        "import os",
        "import sys",
        "import time",
        "",
        `marker_path = ${JSON.stringify(slowMarkerPath)}`,
        "",
        "for line in sys.stdin:",
        "    request = json.loads(line)",
        "    if request.get('kind') == 'ping':",
        "        sys.stdout.write(json.dumps({'id': request['id'], 'ready': True}) + '\\n')",
        "        sys.stdout.flush()",
        "        continue",
        "    if not os.path.exists(marker_path):",
        "        open(marker_path, 'w').close()",
        "        time.sleep(1.2)",
        "    sys.stdout.write(json.dumps({'id': request['id'], 'scores': [0.5], 'model_metadata': {}, 'runtime_metadata': {'marker_exists': os.path.exists(marker_path)}}) + '\\n')",
        "    sys.stdout.flush()",
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(tempDir, "fake-model.txt"), "model", "utf8");
    fs.writeFileSync(path.join(tempDir, "fake-model.meta.json"), "{}", "utf8");

    const scorer = new PythonLightgbmScorer(
      createTestConfig(tempDir, inferScript, {
        lightgbmScoringTimeoutMs: 200
      })
    );

    try {
      const startedAt = Date.now();
      await expect(
        scorer.score({
          stateRaw: {},
          actorSeat: "seat-0",
          phase: "trick_play",
          legalActions: [{} as never],
          stateFeatures: null,
          candidateFeatures: [null]
        })
      ).rejects.toThrow(/timed out/i);
      expect(Date.now() - startedAt).toBeLessThan(1000);

      await expect(
        scorer.score({
          stateRaw: {},
          actorSeat: "seat-0",
          phase: "trick_play",
          legalActions: [{} as never],
          stateFeatures: null,
          candidateFeatures: [null]
        })
      ).resolves.toMatchObject({
        scores: [0.5],
        runtimeMetadata: { marker_exists: true }
      });
    } finally {
      await scorer.close();
    }
  });
});
