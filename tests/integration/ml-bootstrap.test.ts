import { describe, expect, it } from "vitest";
import { buildMlBootstrapPlan } from "../../scripts/ml-bootstrap.js";

describe("ml bootstrap orchestration", () => {
  it("builds a scoped export-train-evaluate plan for an existing readiness run", () => {
    const plan = buildMlBootstrapPlan({
      runId: "training-20260522-135206-7ecc9aa3",
      gameIdPrefix: "selfplay-training-20260522-135206-7ecc9aa3",
      outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
      backendUrl: "http://127.0.0.1:4310",
      provider: "server_heuristic",
      evaluateGames: 40
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "ml:export",
      "ml:train",
      "ml:evaluate"
    ]);
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
    expect(plan.steps[1]?.args.some((value) => value.endsWith("train.parquet"))).toBe(true);
    expect(plan.steps[2]?.args).toEqual([
      "run",
      "ml:evaluate",
      "--",
      "--games",
      "40",
      "--ns-provider",
      "lightgbm_model",
      "--ew-provider",
      "server_heuristic",
      "--mirror-seats",
      "true",
      "--backend-url",
      "http://127.0.0.1:4310"
    ]);
  });

  it("requires both run scope fields", () => {
    expect(() =>
      buildMlBootstrapPlan({
        runId: "training-20260522-135206-7ecc9aa3",
        gameIdPrefix: "",
        outputDir: "training-runs/training-20260522-135206-7ecc9aa3/ml",
        backendUrl: "http://127.0.0.1:4310",
        provider: "server_heuristic",
        evaluateGames: 40
      })
    ).toThrow(/game-id-prefix/i);
  });
});
