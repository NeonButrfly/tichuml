import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertCandidateArtifactsExist,
  assertCandidateBackendPortAvailable,
  buildLiveMlBootstrapPlan,
  readEvaluationSummary,
} from "../../scripts/ml-live-bootstrap.js";

describe("live ml bootstrap orchestration", () => {
  it("builds a gameplay export, rollout, and training plan for mixed live data", () => {
    const plan = buildLiveMlBootstrapPlan({
      outputDir: "training-runs/live-20260601-000001/ml",
      backendUrl: "http://127.0.0.1:4310",
      telemetrySource: "gameplay",
      provider: null,
      allowMixedProviders: true,
      exportLimit: 5000,
      rolloutMaxDecisions: 250,
      continuationProvider: "server_heuristic",
      rolloutsPerAction: 2,
      featureProfile: "runtime_raw",
      objective: "rollout_ranker",
      minRolloutDecisionSpread: 20,
      minRolloutSamples: 2,
      minRolloutStddev: 10,
      evaluateGames: 8,
      evaluateMinGamesForGate: 8,
      evaluateBaselineProvider: "server_heuristic",
      candidateBackendPort: 4312,
      skipEvaluate: false,
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:rollouts",
      "ml:train",
      "build:server",
      "ml:evaluate",
    ]);
    expect(plan.datasetPath).toBe(
      join("training-runs", "live-20260601-000001", "ml", "train.jsonl")
    );
    expect(plan.steps[0]?.args).toEqual([
      "run",
      "ml:export:raw",
      "--",
      "--phase",
      "trick_play",
      "--source",
      "gameplay",
      "--format",
      "jsonl",
      "--include-rollouts",
      "--output-dir",
      "training-runs/live-20260601-000001/ml",
      "--allow-mixed-providers",
      "--limit",
      "5000",
    ]);
    expect(plan.steps[1]?.args).toEqual([
      "run",
      "ml:rollouts",
      "--",
      "--input-export",
      plan.datasetPath,
      "--output",
      plan.rolloutPath,
      "--phase",
      "trick_play",
      "--continuation-provider",
      "server_heuristic",
      "--rollouts-per-action",
      "2",
      "--backend-url",
      "http://127.0.0.1:4310",
      "--max-decisions",
      "250",
    ]);
    expect(plan.steps[2]?.args).toEqual([
      "run",
      "ml:train",
      "--",
      "--input",
      plan.datasetPath,
      "--manifest-input",
      plan.manifestPath,
      "--rollout-input",
      plan.rolloutPath,
      "--phase",
      "trick_play",
      "--objective",
      "rollout_ranker",
      "--feature-profile",
      "runtime_raw",
      "--output",
      plan.modelPath,
      "--meta-output",
      plan.modelMetaPath,
      "--report-output",
      plan.trainingReportPath,
      "--feature-importance-output",
      plan.featureImportancePath,
      "--min-rollout-decision-spread",
      "20",
      "--min-rollout-samples",
      "2",
      "--min-rollout-stddev",
      "10",
    ]);
    expect(plan.steps[3]?.args).toEqual(["run", "build", "-w", "@tichuml/server"]);
    expect(plan.steps[4]?.args).toEqual([
      "run",
      "ml:evaluate",
      "--",
      "--games",
      "8",
      "--min-games-for-gate",
      "8",
      "--ns-provider",
      "lightgbm_model",
      "--ew-provider",
      "server_heuristic",
      "--mirror-seats",
      "true",
      "--telemetry",
      "false",
      "--decision-timeout-ms",
      "5000",
      "--backend-url",
      "http://127.0.0.1:4312",
      "--output",
      plan.evaluationReportPath,
    ]);
  });

  it("switches to a single-provider gameplay slice when requested", () => {
    const plan = buildLiveMlBootstrapPlan({
      outputDir: "training-runs/live-human-only/ml",
      backendUrl: "http://127.0.0.1:4310",
      telemetrySource: "gameplay",
      provider: "human_ui",
      allowMixedProviders: false,
      exportLimit: null,
      rolloutMaxDecisions: null,
      continuationProvider: "server_heuristic",
      rolloutsPerAction: 1,
      featureProfile: "runtime_raw",
      objective: "rollout_ranker",
      minRolloutDecisionSpread: 0,
      minRolloutSamples: 0,
      minRolloutStddev: 0,
      evaluateGames: 8,
      evaluateMinGamesForGate: 8,
      evaluateBaselineProvider: "server_heuristic",
      candidateBackendPort: 4312,
      skipEvaluate: true,
    });

    expect(plan.steps[0]?.args).toContain("--provider");
    expect(plan.steps[0]?.args).toContain("human_ui");
    expect(plan.steps[0]?.args).not.toContain("--allow-mixed-providers");
    expect(plan.steps[1]?.args).not.toContain("--max-decisions");
    expect(plan.steps[2]?.args).not.toContain("--min-rollout-decision-spread");
    expect(plan.steps[2]?.args).not.toContain("--min-rollout-samples");
    expect(plan.steps[2]?.args).not.toContain("--min-rollout-stddev");
    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:rollouts",
      "ml:train",
    ]);
  });

  it("requires a non-empty output directory", () => {
    expect(() =>
      buildLiveMlBootstrapPlan({
        outputDir: "",
        backendUrl: "http://127.0.0.1:4310",
        telemetrySource: "gameplay",
        provider: null,
        allowMixedProviders: true,
        exportLimit: null,
        rolloutMaxDecisions: null,
        continuationProvider: "server_heuristic",
        rolloutsPerAction: 1,
        featureProfile: "runtime_raw",
        objective: "rollout_ranker",
        minRolloutDecisionSpread: 0,
        minRolloutSamples: 0,
        minRolloutStddev: 0,
        evaluateGames: 8,
        evaluateMinGamesForGate: 8,
        evaluateBaselineProvider: "server_heuristic",
        candidateBackendPort: 4312,
        skipEvaluate: false,
      })
    ).toThrow(/output-dir/i);
  });

  it("fails fast when the candidate model artifacts are missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ml-live-bootstrap-missing-"));

    try {
      expect(() =>
        assertCandidateArtifactsExist({
          modelPath: join(tempDir, "lightgbm_action_model.txt"),
          modelMetaPath: join(tempDir, "lightgbm_action_model.meta.json"),
        })
      ).toThrow(/candidate model artifacts/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads the evaluation summary and preserves the evaluated model path", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ml-live-bootstrap-report-"));
    const reportPath = join(tempDir, "evaluation-report.json");

    try {
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            gate: { passed: true },
            model_file: "/tmp/candidate/lightgbm_action_model.txt",
          },
          null,
          2
        ),
        "utf8"
      );

      expect(readEvaluationSummary(reportPath)).toEqual({
        gatePassed: true,
        modelFile: "/tmp/candidate/lightgbm_action_model.txt",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects an occupied candidate backend port", async () => {
    const server = createServer();
    await new Promise<void>((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolvePromise());
    });

    const address = server.address();
    const port =
      address && typeof address === "object" ? address.port : null;

    try {
      expect(port).not.toBeNull();
      await expect(
        assertCandidateBackendPortAvailable(port ?? 0)
      ).rejects.toThrow(/already in use/i);
    } finally {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      });
    }
  });

  it("accepts a free candidate backend port", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ml-live-bootstrap-free-"));
    const modelDir = join(tempDir, "ml");
    mkdirSync(modelDir, { recursive: true });
    const modelPath = join(modelDir, "lightgbm_action_model.txt");
    const metaPath = join(modelDir, "lightgbm_action_model.meta.json");

    try {
      writeFileSync(modelPath, "model", "utf8");
      writeFileSync(metaPath, "{}", "utf8");

      assertCandidateArtifactsExist({ modelPath, modelMetaPath: metaPath });

      const server = createServer();
      const freePort = await new Promise<number>((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address !== "object") {
            reject(new Error("failed to allocate test port"));
            return;
          }
          const selectedPort = address.port;
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolvePromise(selectedPort);
          });
        });
      });

      await expect(
        assertCandidateBackendPortAvailable(freePort)
      ).resolves.toBeUndefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
