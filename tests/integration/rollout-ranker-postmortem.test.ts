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

describe("rollout ranker postmortem", () => {
  it(
    "writes markdown and json diagnostics for a failed rollout ranker run",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollout-ranker-postmortem-"));
      const runRoot = join(tempDir, "training-runs", "rollout-ranker-quality-20260629c");
      const mlDir = join(runRoot, "ml");
      const datasetPath = join(mlDir, "train.jsonl");
      const manifestPath = join(mlDir, "dataset_metadata.json");
      const modelPath = join(mlDir, "lightgbm_action_model.txt");
      const metaPath = join(mlDir, "lightgbm_action_model.meta.json");
      const reportPath = join(mlDir, "training-report.json");
      const importancePath = join(mlDir, "feature-importance.csv");
      const evaluationPath = join(runRoot, "evaluation-report.json");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "dataset.parent.mkdir(parents=True, exist_ok=True)",
            "frame = pd.DataFrame([",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'actor_seat': 'seat-0', 'chosen_action_type': 'play_cards', 'rollout_mean_actor_team_delta': 120.0, 'actor_team_score': 140.0, 'opponent_team_score': 60.0, 'pass_action_flag': 0, 'action_rank': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'actor_seat': 'seat-0', 'chosen_action_type': 'pass_turn', 'rollout_mean_actor_team_delta': -20.0, 'actor_team_score': 120.0, 'opponent_team_score': 80.0, 'pass_action_flag': 1, 'action_rank': 2},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'actor_seat': 'seat-1', 'chosen_action_type': 'pass_turn', 'rollout_mean_actor_team_delta': 60.0, 'actor_team_score': 95.0, 'opponent_team_score': 105.0, 'pass_action_flag': 1, 'action_rank': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'actor_seat': 'seat-1', 'chosen_action_type': 'play_cards', 'rollout_mean_actor_team_delta': -40.0, 'actor_team_score': 90.0, 'opponent_team_score': 110.0, 'pass_action_flag': 0, 'action_rank': 2},",
            "    {'phase': 'trick_play', 'game_id': 'g3', 'decision_id': 'd3', 'actor_seat': 'seat-2', 'chosen_action_type': 'play_cards', 'rollout_mean_actor_team_delta': 80.0, 'actor_team_score': 130.0, 'opponent_team_score': 70.0, 'pass_action_flag': 0, 'action_rank': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g3', 'decision_id': 'd3', 'actor_seat': 'seat-2', 'chosen_action_type': 'pass_turn', 'rollout_mean_actor_team_delta': -80.0, 'actor_team_score': 118.0, 'opponent_team_score': 82.0, 'pass_action_flag': 1, 'action_rank': 2},",
            "    {'phase': 'trick_play', 'game_id': 'g4', 'decision_id': 'd4', 'actor_seat': 'seat-3', 'chosen_action_type': 'pass_turn', 'rollout_mean_actor_team_delta': 50.0, 'actor_team_score': 84.0, 'opponent_team_score': 116.0, 'pass_action_flag': 1, 'action_rank': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g4', 'decision_id': 'd4', 'actor_seat': 'seat-3', 'chosen_action_type': 'play_cards', 'rollout_mean_actor_team_delta': -55.0, 'actor_team_score': 82.0, 'opponent_team_score': 118.0, 'pass_action_flag': 0, 'action_rank': 2},",
            "])",
            "frame.to_json(dataset, orient='records', lines=True)",
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
                "action_rank",
              ],
            },
            null,
            2
          ),
          "utf8"
        );

        const trainResult = spawnSync(
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
            "--phase",
            "trick_play",
            "--objective",
            "rollout_ranker",
            "--validation-fraction",
            "0.5",
            "--random-state",
            "3",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );
        expect(trainResult.status).toBe(0);

        writeFileSync(
          evaluationPath,
          JSON.stringify(
            {
              gate: {
                applied: true,
                passed: false,
                challenger_provider: "lightgbm_model",
                baseline_provider: "server_heuristic",
                checks: [
                  {
                    name: "beats_baseline",
                    passed: false,
                    details:
                      "win_rate=0, average_score_delta=-841, comparison_fallbacks=12, baseline_fallbacks=0",
                  },
                ],
              },
              combined_comparison: {
                provider_a: "lightgbm_model",
                provider_b: "server_heuristic",
                total_games: 40,
                provider_a_match_wins: 0,
                provider_b_match_wins: 40,
                average_score_delta_provider_a_minus_b: -841,
              },
              comparison_run: {
                fallback_count: 12,
                invalid_decision_count: 0,
              },
              baseline_run: {
                fallback_count: 0,
                invalid_decision_count: 0,
              },
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
            "scripts/rollout_ranker_postmortem.py",
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
        expect(parsed.objective).toBe("rollout_ranker");
        expect(parsed.validation_metrics.pairwise_accuracy).toBeTypeOf("number");
        expect(parsed.baselines.action_rank_descending.validation.ndcg_at_1).toBeTypeOf(
          "number"
        );
        expect(parsed.evaluation.gate_passed).toBe(false);
        expect(parsed.evaluation.contaminated_by_fallbacks).toBe(true);
        expect(parsed.bad_decisions.length).toBeGreaterThan(0);
        expect(parsed.failure_classification.primary).toBeTruthy();

        const jsonOutput = join(
          runRoot,
          "diagnostics",
          "rollout_ranker_postmortem.json"
        );
        const markdownOutput = join(
          runRoot,
          "diagnostics",
          "rollout_ranker_postmortem.md"
        );
        expect(existsSync(jsonOutput)).toBe(true);
        expect(existsSync(markdownOutput)).toBe(true);

        const markdown = readFileSync(markdownOutput, "utf8");
        expect(markdown).toContain("Evaluation Contamination");
        expect(markdown).toContain("Bad Decisions");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    20000
  );
});
