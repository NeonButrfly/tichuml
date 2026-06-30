import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO_ROOT = process.cwd();

function runPythonSnippet(snippet: string, args: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      join("node_modules", "tsx", "dist", "cli.mjs"),
      "scripts/run-python.ts",
      "-c",
      snippet,
      ...args,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }
  );
}

describe("lightgbm training summary", () => {
  it(
    "prints target distribution, baselines, and spearman interpretation for regression runs",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "lightgbm-summary-"));
      const datasetPath = join(tempDir, "train.parquet");
      const manifestPath = join(tempDir, "dataset_metadata.json");
      const modelPath = join(tempDir, "model.txt");
      const metaPath = join(tempDir, "model.meta.json");
      const reportPath = join(tempDir, "training-report.json");
      const importancePath = join(tempDir, "feature-importance.csv");
      const heartbeatPath = join(tempDir, "training-progress.json");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "rows = []",
            "for index in range(40):",
            "    play_cards = index % 2 == 0",
            "    actor_team_score = 70.0 + index * 2.0",
            "    opponent_team_score = 130.0 - index * 2.0",
            "    rows.append({",
            "        'phase': 'trick_play',",
            "        'game_id': f'g{index:02d}',",
            "        'decision_id': f'd{index:02d}',",
            "        'actor_seat': 'seat-0' if play_cards else 'seat-1',",
            "        'chosen_action_type': 'play_cards' if play_cards else 'pass_turn',",
            "        'outcome_reward': (actor_team_score - opponent_team_score) * 2.0 + (25.0 if play_cards else -25.0),",
            "        'actor_team_score': actor_team_score,",
            "        'opponent_team_score': opponent_team_score,",
            "        'pass_action_flag': 0 if play_cards else 1,",
            "    })",
            "frame = pd.DataFrame(rows)",
            "frame.to_parquet(dataset, index=False)",
            "print('dataset-ok')",
          ].join("\n"),
          [datasetPath]
        );
        expect(buildDataset.status).toBe(0);

        writeFileSync(
          manifestPath,
          JSON.stringify(
            {
              schema_version: 2,
              feature_columns: [
                "actor_team_score",
                "opponent_team_score",
                "pass_action_flag",
              ],
            },
            null,
            2
          ),
          "utf8"
        );

        const result = spawnSync(
          process.execPath,
          [
            join("node_modules", "tsx", "dist", "cli.mjs"),
            "scripts/run-python.ts",
            "ml/train_lightgbm.py",
            "--input",
            datasetPath,
            "--manifest-input",
            manifestPath,
            "--output",
            modelPath,
            "--meta-output",
            metaPath,
            "--report-output",
            reportPath,
            "--feature-importance-output",
            importancePath,
            "--heartbeat-output",
            heartbeatPath,
            "--phase",
            "trick_play",
            "--objective",
            "observed_outcome_regression",
            "--target-column",
            "outcome_reward",
            "--validation-fraction",
            "0.34",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        const outputLines = result.stdout
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        expect(outputLines.some((line) => line.includes("lightgbm_load_start"))).toBe(true);
        expect(outputLines.some((line) => line.includes("lightgbm_load_complete"))).toBe(true);
        expect(outputLines.some((line) => line.includes("lightgbm_training_start"))).toBe(true);
        expect(outputLines.some((line) => line.includes("lightgbm_training_complete"))).toBe(true);
        const payload = JSON.parse(outputLines.at(-1) ?? "");
        expect(payload.accepted).toBe(true);
        expect(payload.target_distribution.p50).toBeTypeOf("number");
        expect(payload.baseline_metrics.global_mean.validation.rmse).toBeTypeOf(
          "number"
        );
        expect(payload.validation_metrics).toHaveProperty("spearman");
        expect(payload.model_vs_baseline.best_baseline).toBeTruthy();
        expect(payload.spearman_interpretation.label).toBeTypeOf("string");

        const report = JSON.parse(readFileSync(reportPath, "utf8"));
        expect(report.target_distribution.p95).toBeTypeOf("number");
        expect(report.baseline_metrics.grouped_by_action_type).toBeTruthy();
        expect(report.model_vs_baseline.best_baseline.name).toBeTruthy();
        expect(report.spearman_interpretation.guidance).toContain("near 0");

        const heartbeat = JSON.parse(readFileSync(heartbeatPath, "utf8"));
        expect(heartbeat.event).toBe("lightgbm_training_complete");
        expect(heartbeat.phase).toBe("complete");
        expect(heartbeat.row_count).toBe(40);
        expect(heartbeat.objective).toBe("observed_outcome_regression");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    20000
  );

  it("computes spearman without misaligning validation indexes", () => {
    const result = runPythonSnippet(
      [
        "from pathlib import Path",
        "import sys",
        "import pandas as pd",
        "sys.path.insert(0, str(Path('ml').resolve()))",
        "from train_lightgbm import safe_spearman",
        "truth = pd.Series([1.0, 2.0, 3.0], index=[10, 20, 30])",
        "predictions = pd.Series([1.0, 2.0, 3.0], index=[0, 1, 2])",
        "print(safe_spearman(truth, predictions))",
      ].join("\n")
    );

    expect(result.status).toBe(0);
    expect(Number(result.stdout.trim())).toBeCloseTo(1, 6);
  });
});
