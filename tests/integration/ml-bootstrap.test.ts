import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOTSTRAP_MIN_HEURISTIC_TOP1_RECALL,
  DEFAULT_BOOTSTRAP_MIN_TRAINING_DECISIONS,
  DEFAULT_BOOTSTRAP_MIN_TRAINING_GAMES,
  buildMlBootstrapPlan,
  resolveMlBootstrapCommandEnv
} from "../../scripts/ml-bootstrap.js";

describe("ml bootstrap orchestration", () => {
  it("builds a scoped export-train-evaluate plan for an existing readiness run", () => {
    const plan = buildMlBootstrapPlan({
      runId: "training-20260522-135206-7ecc9aa3",
      gameIdPrefix: "selfplay-training-20260522-135206-7ecc9aa3",
      outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      candidateObjective: "observed_outcome_regression",
      evaluateGames: 40,
      evaluateMinGamesForGate: 12,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:train_seed",
      "ml:train_candidate",
      "build:server",
      "ml:evaluate"
    ]);
    expect(plan.candidateBackendUrl).toBe("http://127.0.0.1:4312");
    expect(plan.steps[0]?.args).toEqual([
      "run",
      "ml:export",
      "--",
      "--run-id",
      "training-20260522-135206-7ecc9aa3",
      "--game-id-prefix",
      "selfplay-training-20260522-135206-7ecc9aa3",
      "--output-dir",
      "training-runs/training-20260522-135206-7ecc9aa3/ml",
      "--label-mode",
      "imitation",
      "--include-candidates",
      "--provider",
      "server_heuristic"
    ]);
    expect(plan.steps[1]?.args).toEqual([
      "run",
      "ml:train",
      "--",
      "--input",
      plan.datasetPath,
      "--manifest-input",
      plan.manifestPath,
      "--phase",
      "trick_play",
      "--objective",
      "imitation_binary",
      "--output",
      path.join(
        "training-runs",
        "training-20260522-135206-7ecc9aa3",
        "ml",
        "ml-seed",
        "lightgbm_action_model.txt"
      ),
      "--meta-output",
      path.join(
        "training-runs",
        "training-20260522-135206-7ecc9aa3",
        "ml",
        "ml-seed",
        "lightgbm_action_model.meta.json"
      ),
      "--report-output",
      path.join(
        "training-runs",
        "training-20260522-135206-7ecc9aa3",
        "ml",
        "ml-seed",
        "training-report.json"
      ),
      "--feature-importance-output",
      path.join(
        "training-runs",
        "training-20260522-135206-7ecc9aa3",
        "ml",
        "ml-seed",
        "feature-importance.csv"
      )
    ]);
    expect(plan.steps[2]?.args).toEqual([
      "run",
      "ml:train",
      "--",
      "--input",
      plan.datasetPath,
      "--manifest-input",
      plan.manifestPath,
      "--phase",
      "trick_play",
      "--objective",
      "observed_outcome_regression",
      "--output",
      plan.modelPath,
      "--meta-output",
      plan.modelMetaPath,
      "--report-output",
      plan.trainingReportPath,
      "--feature-importance-output",
      plan.featureImportancePath
    ]);
    expect(plan.steps[3]?.args).toEqual(["run", "build", "-w", "@tichuml/server"]);
    expect(plan.steps[4]?.args).toEqual([
      "run",
      "ml:evaluate",
      "--",
      "--games",
      "40",
      "--min-games-for-gate",
      "12",
      "--min-lightgbm-served-decisions",
      "50",
      "--min-lightgbm-service-rate",
      "0.1",
      "--ns-provider",
      "lightgbm_model",
      "--ew-provider",
      "server_heuristic",
      "--mirror-seats",
      "true",
      "--skip-heuristic-sanity",
      "true",
      "--telemetry",
      "false",
      "--decision-timeout-ms",
      "5000",
      "--backend-url",
      "http://127.0.0.1:4312",
      "--model-path",
      plan.modelPath,
      "--model-meta-path",
      plan.modelMetaPath,
      "--output",
      plan.evaluationReportPath
    ]);
  });

  it("requires a non-empty game id prefix", () => {
    expect(() =>
      buildMlBootstrapPlan({
        runId: "training-20260522-135206-7ecc9aa3",
        gameIdPrefix: "",
        outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
        backendUrl: "http://127.0.0.1:4310",
        provider: "server_heuristic",
        candidateObjective: "observed_outcome_regression",
        evaluateGames: 40,
        evaluateMinGamesForGate: 40,
        candidateBackendPort: 4312,
        evaluateMinLightgbmServedDecisions: 50,
        evaluateMinLightgbmServiceRate: 0.1
      })
    ).toThrow(/game-id-prefix/i);
  });

  it("rejects non-positive evaluation sample sizes", () => {
    expect(() =>
      buildMlBootstrapPlan({
        runId: "training-20260522-135206-7ecc9aa3",
        gameIdPrefix: "selfplay-training-20260522-135206-7ecc9aa3",
        outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
        backendUrl: "http://127.0.0.1:4310",
        provider: "server_heuristic",
        evaluateGames: 0,
        evaluateMinGamesForGate: 0,
        candidateBackendPort: 4312,
        evaluateMinLightgbmServedDecisions: 50,
        evaluateMinLightgbmServiceRate: 0.1
      })
    ).toThrow(/evaluate-games/i);
  });

  it("allows prefix-scoped bootstrap plans without a run id", () => {
    const plan = buildMlBootstrapPlan({
      runId: "",
      gameIdPrefix: "selfplay-self-play-game-",
      outputDir: "training-runs/clean-start-smoke/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      candidateObjective: "observed_outcome_regression",
      evaluateGames: 3,
      evaluateMinGamesForGate: 3,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps[0]?.args).toEqual([
      "run",
      "ml:export",
      "--",
      "--game-id-prefix",
      "selfplay-self-play-game-",
      "--output-dir",
      "training-runs/clean-start-smoke/ml",
      "--label-mode",
      "imitation",
      "--include-candidates",
      "--provider",
      "server_heuristic"
    ]);
  });

  it("uses bounded smoke evaluation args for bootstrap", () => {
    const plan = buildMlBootstrapPlan({
      runId: "training-20260522-135206-7ecc9aa3",
      gameIdPrefix: "selfplay-training-20260522-135206-7ecc9aa3",
      outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      candidateObjective: "observed_outcome_regression",
      evaluateGames: 40,
      evaluateMinGamesForGate: 12,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps[4]?.args).toEqual([
      "run",
      "ml:evaluate",
      "--",
      "--games",
      "40",
      "--min-games-for-gate",
      "12",
      "--min-lightgbm-served-decisions",
      "50",
      "--min-lightgbm-service-rate",
      "0.1",
      "--ns-provider",
      "lightgbm_model",
      "--ew-provider",
      "server_heuristic",
      "--mirror-seats",
      "true",
      "--skip-heuristic-sanity",
      "true",
      "--telemetry",
      "false",
      "--decision-timeout-ms",
      "5000",
      "--backend-url",
      "http://127.0.0.1:4312",
      "--model-path",
      plan.modelPath,
      "--model-meta-path",
      plan.modelMetaPath,
      "--output",
      plan.evaluationReportPath
    ]);
  });

  it("passes through explicit training database env for child commands", () => {
    expect(
      resolveMlBootstrapCommandEnv({
        DATABASE_URL: "postgres://db",
        TRAINING_DATABASE_URL: "",
        TICHU_TRAINING_DATABASE_URL: ""
      })
    ).toEqual({
      TRAINING_DATABASE_URL: "postgres://db",
      TICHU_TRAINING_DATABASE_URL: "postgres://db",
      DATABASE_URL: "postgres://db",
      DATABASE_URL_OVERRIDE_ENABLED: "true"
    });

    expect(
      resolveMlBootstrapCommandEnv({
        DATABASE_URL: "",
        TRAINING_DATABASE_URL: "postgres://training-db",
        TICHU_TRAINING_DATABASE_URL: ""
      })
    ).toEqual({
      TRAINING_DATABASE_URL: "postgres://training-db",
      TICHU_TRAINING_DATABASE_URL: "postgres://training-db",
      DATABASE_URL: "postgres://training-db",
      DATABASE_URL_OVERRIDE_ENABLED: "true"
    });
  });

  it("can skip the server rebuild when the host already has fresh dist artifacts", () => {
    const plan = buildMlBootstrapPlan({
      runId: "",
      gameIdPrefix: "bootstrap-integrity",
      outputDir: "training-runs/bootstrap-integrity/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      candidateObjective: "observed_outcome_regression",
      evaluateGames: 3,
      evaluateMinGamesForGate: 3,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1,
      skipBuildServer: true
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:train_seed",
      "ml:train_candidate",
      "ml:evaluate"
    ]);
  });

  it("defaults the evaluated candidate objective to observed outcomes instead of re-evaluating the imitation seed", () => {
    const plan = buildMlBootstrapPlan({
      runId: "training-20260522-135206-7ecc9aa3",
      gameIdPrefix: "selfplay-training-20260522-135206-7ecc9aa3",
      outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      candidateObjective: "observed_outcome_regression",
      evaluateGames: 12,
      evaluateMinGamesForGate: 12,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps[1]?.args).toContain("imitation_binary");
    expect(plan.steps[2]?.args).toContain("observed_outcome_regression");
    expect(plan.steps[4]?.args).toContain(plan.modelPath);
    expect(plan.steps[4]?.args).toContain(plan.modelMetaPath);
  });

  it("keeps bootstrap quality floors above tiny smoke-scale training sets", () => {
    expect(DEFAULT_BOOTSTRAP_MIN_TRAINING_DECISIONS).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_BOOTSTRAP_MIN_TRAINING_GAMES).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_BOOTSTRAP_MIN_HEURISTIC_TOP1_RECALL).toBeGreaterThanOrEqual(0.6);
  });
});
