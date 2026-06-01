import { describe, expect, it } from "vitest";
import { buildLiveMlBootstrapPlan } from "../../scripts/ml-live-bootstrap.js";

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
        evaluateGames: 8,
        evaluateMinGamesForGate: 8,
        evaluateBaselineProvider: "server_heuristic",
        candidateBackendPort: 4312,
        skipEvaluate: false,
      })
    ).toThrow(/output-dir/i);
  });
});
