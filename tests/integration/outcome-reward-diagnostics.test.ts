import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

describe("outcome reward diagnostics", () => {
  it(
    "writes markdown and json diagnostics for a completed run root",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "outcome-reward-diagnostics-"));
      const runRoot = join(tempDir, "training-runs", "large-lightgbm-20260607a");
      const mlDir = join(runRoot, "ml");
      const datasetPath = join(mlDir, "train.parquet");
      const metaPath = join(mlDir, "lightgbm_action_model.meta.json");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "dataset.parent.mkdir(parents=True, exist_ok=True)",
            "frame = pd.DataFrame([",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'actor_seat': 'seat-0', 'actor_team': 'team-0', 'chosen_action_type': 'play_cards', 'outcome_reward': 180.0, 'actor_team_score': 100.0, 'opponent_team_score': 80.0},",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd2', 'actor_seat': 'seat-1', 'actor_team': 'team-1', 'chosen_action_type': 'pass_turn', 'outcome_reward': 0.0, 'actor_team_score': 80.0, 'opponent_team_score': 100.0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd3', 'actor_seat': 'seat-2', 'actor_team': 'team-0', 'chosen_action_type': 'play_cards', 'outcome_reward': 220.0, 'actor_team_score': 110.0, 'opponent_team_score': 70.0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd4', 'actor_seat': 'seat-3', 'actor_team': 'team-1', 'chosen_action_type': 'pass_turn', 'outcome_reward': -40.0, 'actor_team_score': 70.0, 'opponent_team_score': 110.0},",
            "    {'phase': 'trick_play', 'game_id': 'g3', 'decision_id': 'd5', 'actor_seat': 'seat-0', 'actor_team': 'team-0', 'chosen_action_type': 'play_cards', 'outcome_reward': 200.0, 'actor_team_score': 105.0, 'opponent_team_score': 75.0},",
            "    {'phase': 'trick_play', 'game_id': 'g3', 'decision_id': 'd6', 'actor_seat': 'seat-1', 'actor_team': 'team-1', 'chosen_action_type': 'pass_turn', 'outcome_reward': -20.0, 'actor_team_score': 75.0, 'opponent_team_score': 105.0},",
            "])",
            "frame.to_parquet(dataset, index=False)",
            "print('dataset-ok')",
          ].join("\n"),
          [datasetPath]
        );
        expect(buildDataset.status).toBe(0);

        writeFileSync(
          metaPath,
          JSON.stringify(
            {
              objective: "observed_outcome_regression",
              target_column: "outcome_reward",
              feature_profile: "runtime_raw",
              feature_columns: [
                "actor_team_score",
                "opponent_team_score",
              ],
              source_dataset_path: datasetPath,
              train_validation_split_method: "row_holdout",
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
            "scripts/outcome_reward_diagnostics.py",
            "--run-root",
            runRoot,
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        const parsed = JSON.parse(
          result.stdout
            .trim()
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .at(-1) ?? ""
        );
        expect(parsed.accepted).toBe(true);
        expect(parsed.target_column).toBe("outcome_reward");
        expect(parsed.row_count).toBe(6);
        expect(parsed.feature_count).toBe(2);
        expect(parsed.split_strategy.problem).toBe(true);
        expect(parsed.baselines.global_mean.validation.rmse).toBeTypeOf("number");
        expect(parsed.validation_metric_drift.metric_mismatch_problem).toBe(false);
        expect(parsed.grouped_target_summaries.seat).toBeTruthy();

        const jsonOutput = join(
          runRoot,
          "diagnostics",
          "outcome_reward_diagnostics.json"
        );
        const markdownOutput = join(
          runRoot,
          "diagnostics",
          "outcome_reward_diagnostics.md"
        );
        expect(existsSync(jsonOutput)).toBe(true);
        expect(existsSync(markdownOutput)).toBe(true);

        const jsonPayload = JSON.parse(readFileSync(jsonOutput, "utf8"));
        expect(jsonPayload.target_distribution.p50).toBeTypeOf("number");
        expect(jsonPayload.failure_classification.primary).toBeTruthy();
        expect(readFileSync(markdownOutput, "utf8")).toContain(
          "Target Distribution"
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    20000
  );
});
