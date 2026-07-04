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
      evaluateGames: 40,
      evaluateMinGamesForGate: 12,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:train",
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
      plan.modelPath,
      "--meta-output",
      plan.modelMetaPath,
      "--report-output",
      plan.trainingReportPath,
      "--feature-importance-output",
      plan.featureImportancePath
    ]);
    expect(plan.steps[2]?.args).toEqual(["run", "build", "-w", "@tichuml/server"]);
    expect(plan.steps[3]?.args).toEqual([
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
      "--telemetry",
      "false",
      "--decision-timeout-ms",
      "5000",
      "--backend-url",
      "http://127.0.0.1:4312",
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
      evaluateGames: 40,
      evaluateMinGamesForGate: 12,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1
    });

    expect(plan.steps[3]?.args).toEqual([
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
      "--telemetry",
      "false",
      "--decision-timeout-ms",
      "5000",
      "--backend-url",
      "http://127.0.0.1:4312",
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
      DATABASE_URL: "postgres://db"
    });

    expect(
      resolveMlBootstrapCommandEnv({
        DATABASE_URL: "",
        TRAINING_DATABASE_URL: "postgres://training-db",
        TICHU_TRAINING_DATABASE_URL: ""
      })
    ).toEqual({
      TRAINING_DATABASE_URL: "postgres://training-db"
    });
  });

  it("can skip the server rebuild when the host already has fresh dist artifacts", () => {
    const plan = buildMlBootstrapPlan({
      runId: "",
      gameIdPrefix: "bootstrap-integrity",
      outputDir: "training-runs/bootstrap-integrity/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      evaluateGames: 3,
      evaluateMinGamesForGate: 3,
      candidateBackendPort: 4312,
      evaluateMinLightgbmServedDecisions: 50,
      evaluateMinLightgbmServiceRate: 0.1,
      skipBuildServer: true
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:train",
      "ml:evaluate"
    ]);
  });

  it("keeps bootstrap quality floors above tiny smoke-scale training sets", () => {
    expect(DEFAULT_BOOTSTRAP_MIN_TRAINING_DECISIONS).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_BOOTSTRAP_MIN_TRAINING_GAMES).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_BOOTSTRAP_MIN_HEURISTIC_TOP1_RECALL).toBeGreaterThanOrEqual(0.6);
  });
});
