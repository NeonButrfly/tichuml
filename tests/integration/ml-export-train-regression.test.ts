import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO_ROOT = "C:\\tichu\\tichuml";

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

describe("ml export and training regressions", () => {
  it("fails fast when rollout export mode is requested without rollout labels", () => {
    const result = spawnSync(
      process.execPath,
      [
        join("node_modules", "tsx", "dist", "cli.mjs"),
        "scripts/run-python.ts",
        "ml/export_training_rows.py",
        "--label-mode",
        "rollout",
        "--validate-only",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--rollout-input");
  });

  it("writes parquet across chunks when the first chunk only has null numeric values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ml-export-schema-"));
    const outputPath = join(tempDir, "schema-drift.parquet");

    try {
      const result = runPythonSnippet(
        [
          "from pathlib import Path",
          "import sys",
          "sys.path.insert(0, str(Path('ml').resolve()))",
          "from export_training_rows import DatasetWriter",
          "output = Path(__import__('sys').argv[1])",
          "writer = DatasetWriter(output, 'parquet')",
          "writer.write_rows([{'actor_team_score': None, 'opponent_team_score': None, 'outcome_reward': None}])",
          "writer.write_rows([{'actor_team_score': 12.0, 'opponent_team_score': 8.0, 'outcome_reward': 4.0}])",
          "writer.close()",
          "print('ok')",
        ].join("; "),
        [outputPath]
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ok");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it(
    "trains on exported numeric feature columns even when parquet stored them as strings",
    () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ml-train-dtypes-"));
    const datasetPath = join(tempDir, "train.parquet");
    const manifestPath = join(tempDir, "dataset_metadata.json");
    const modelPath = join(tempDir, "model.txt");
    const metaPath = join(tempDir, "model.meta.json");
    const reportPath = join(tempDir, "training-report.json");
    const importancePath = join(tempDir, "feature-importance.csv");

    try {
      const buildDataset = runPythonSnippet(
        [
          "from pathlib import Path",
          "import pandas as pd",
          "dataset = Path(__import__('sys').argv[1])",
          "frame = pd.DataFrame([",
          "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'outcome_reward': 1.0, 'actor_team_score': '100', 'opponent_team_score': '80', 'pass_action_flag': 0},",
          "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'outcome_reward': 0.0, 'actor_team_score': '90', 'opponent_team_score': '110', 'pass_action_flag': 1},",
          "])",
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
          "--phase",
          "trick_play",
          "--objective",
          "observed_outcome_regression",
          "--target-column",
          "outcome_reward",
          "--validation-fraction",
          "0",
        ],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
        }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"accepted": true');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
    },
    15000
  );

  it(
    "trains rollout_ranker on continuous rollout values by deriving relevance labels",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "ml-ranker-rollout-"));
      const datasetPath = join(tempDir, "train.parquet");
      const manifestPath = join(tempDir, "dataset_metadata.json");
      const modelPath = join(tempDir, "model.txt");
      const metaPath = join(tempDir, "model.meta.json");
      const reportPath = join(tempDir, "training-report.json");
      const importancePath = join(tempDir, "feature-importance.csv");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "frame = pd.DataFrame([",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 90.0, 'actor_team_score': 100.0, 'opponent_team_score': 80.0, 'pass_action_flag': 0},",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 15.0, 'actor_team_score': 95.0, 'opponent_team_score': 85.0, 'pass_action_flag': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': 40.0, 'actor_team_score': 88.0, 'opponent_team_score': 102.0, 'pass_action_flag': 0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': -10.0, 'actor_team_score': 84.0, 'opponent_team_score': 106.0, 'pass_action_flag': 1},",
            "])",
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
            "--phase",
            "trick_play",
            "--objective",
            "rollout_ranker",
            "--validation-fraction",
            "0",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('"accepted": true');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    15000
  );

  it(
    "filters low-spread rollout decisions before ranker training when requested",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "ml-ranker-rollout-filter-"));
      const datasetPath = join(tempDir, "train.parquet");
      const manifestPath = join(tempDir, "dataset_metadata.json");
      const modelPath = join(tempDir, "model.txt");
      const metaPath = join(tempDir, "model.meta.json");
      const reportPath = join(tempDir, "training-report.json");
      const importancePath = join(tempDir, "feature-importance.csv");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "frame = pd.DataFrame([",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 100.0, 'actor_team_score': 100.0, 'opponent_team_score': 80.0, 'pass_action_flag': 0},",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 0.0, 'actor_team_score': 95.0, 'opponent_team_score': 85.0, 'pass_action_flag': 1},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': 14.0, 'actor_team_score': 88.0, 'opponent_team_score': 102.0, 'pass_action_flag': 0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': 10.0, 'actor_team_score': 84.0, 'opponent_team_score': 106.0, 'pass_action_flag': 1},",
            "])",
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
            "--phase",
            "trick_play",
            "--objective",
            "rollout_ranker",
            "--min-rollout-decision-spread",
            "20",
            "--validation-fraction",
            "0",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('"accepted": true');
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        expect(meta.row_count).toBe(2);
        expect(meta.decision_count).toBe(1);
        expect(meta.filtered_out_decision_count).toBe(1);
        expect(meta.min_rollout_decision_spread).toBe(20);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    15000
  );

  it("switches scoped rollout exports onto candidate-action rows", () => {
    const result = runPythonSnippet(
      [
        "from pathlib import Path",
        "import sys",
        "sys.path.insert(0, str(Path('ml').resolve()))",
        "from export_training_rows import resolve_export_mode",
        "print(resolve_export_mode('rollout', True, True))",
      ].join("; ")
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("candidate_rows");
  });

  it("adds gameplay source filtering to ml export queries", () => {
    const result = runPythonSnippet(
      [
        "from pathlib import Path",
        "import sys",
        "sys.path.insert(0, str(Path('ml').resolve()))",
        "from export_training_rows import build_query",
        "query, params = build_query('trick_play', None, None, None, None, 'gameplay')",
        "print(\"telemetry_source\" in query)",
        "print('gameplay' in [str(value) for value in params])",
      ].join("\n")
    );

    expect(result.status).toBe(0);
    const lines = result.stdout
      .replace(/\r?\n/gu, "\n")
      .trim()
      .split("\n")
      .map((line) => line.trim());
    expect(lines).toEqual(["True", "True"]);
  });

  it("derives observed hand outcomes from attributed decision hand_result when roundSummary is absent", () => {
    const result = runPythonSnippet(
      [
        "from pathlib import Path",
        "import sys",
        "sys.path.insert(0, str(Path('ml').resolve()))",
        "from export_training_rows import derive_hand_outcome_from_decision, observed_outcomes_for_actor",
        "decision = {",
        "  'hand_result': {",
        "    'finish_order': ['seat-0', 'seat-2', 'seat-1'],",
        "    'double_victory': None,",
        "    'tichu_bonuses': [],",
        "    'scoring_breakdown': {",
        "      'hand_team_scores': {'team-0': 80, 'team-1': 20}",
        "    }",
        "  }",
        "}",
        "hand = derive_hand_outcome_from_decision(decision)",
        "observed = observed_outcomes_for_actor('seat-0', hand, {'observed_match_outcome_available': False})",
        "print(hand['observed_hand_outcome_available'])",
        "print(observed['observed_actor_team_hand_delta'])",
      ].join("\n")
    );

    expect(result.status).toBe(0);
    const lines = result.stdout
      .replace(/\r?\n/gu, "\n")
      .trim()
      .split("\n")
      .map((line) => line.trim());
    expect(lines).toEqual(["True", "60.0"]);
  });

  it(
    "prefers rollout_input values over null placeholder rollout columns in candidate exports",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "ml-rollout-merge-"));
      const datasetPath = join(tempDir, "train.jsonl");
      const rolloutPath = join(tempDir, "rollout.jsonl");
      const manifestPath = join(tempDir, "dataset_metadata.json");
      const modelPath = join(tempDir, "model.txt");
      const metaPath = join(tempDir, "model.meta.json");
      const reportPath = join(tempDir, "training-report.json");
      const importancePath = join(tempDir, "feature-importance.csv");

      try {
        writeFileSync(
          datasetPath,
          [
            JSON.stringify({
              phase: "trick_play",
              game_id: "g1",
              decision_id: 1,
              candidate_action_key: "a",
              rollout_mean_actor_team_delta: null,
              actor_team_score: 100,
              opponent_team_score: 80,
              pass_action_flag: 0
            }),
            JSON.stringify({
              phase: "trick_play",
              game_id: "g1",
              decision_id: 1,
              candidate_action_key: "b",
              rollout_mean_actor_team_delta: null,
              actor_team_score: 96,
              opponent_team_score: 84,
              pass_action_flag: 1
            }),
            JSON.stringify({
              phase: "trick_play",
              game_id: "g2",
              decision_id: 2,
              candidate_action_key: "a",
              rollout_mean_actor_team_delta: null,
              actor_team_score: 88,
              opponent_team_score: 102,
              pass_action_flag: 0
            }),
            JSON.stringify({
              phase: "trick_play",
              game_id: "g2",
              decision_id: 2,
              candidate_action_key: "b",
              rollout_mean_actor_team_delta: null,
              actor_team_score: 84,
              opponent_team_score: 106,
              pass_action_flag: 1
            }),
          ].join("\n") + "\n",
          "utf8"
        );

        writeFileSync(
          rolloutPath,
          [
            JSON.stringify({
              decision_id: 1,
              candidate_action_key: "a",
              rollout_mean_actor_team_delta: 100
            }),
            JSON.stringify({
              decision_id: 1,
              candidate_action_key: "b",
              rollout_mean_actor_team_delta: 0
            }),
            JSON.stringify({
              decision_id: 2,
              candidate_action_key: "a",
              rollout_mean_actor_team_delta: 40
            }),
            JSON.stringify({
              decision_id: 2,
              candidate_action_key: "b",
              rollout_mean_actor_team_delta: -10
            }),
          ].join("\n") + "\n",
          "utf8"
        );

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
            "--rollout-input",
            rolloutPath,
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
            "0",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('"accepted": true');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    15000
  );

  it(
    "excludes delegated call_tichu rollout rows from runtime_raw trick-play training by default",
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), "ml-runtime-delegated-filter-"));
      const datasetPath = join(tempDir, "train.parquet");
      const manifestPath = join(tempDir, "dataset_metadata.json");
      const modelPath = join(tempDir, "model.txt");
      const metaPath = join(tempDir, "model.meta.json");
      const reportPath = join(tempDir, "training-report.json");
      const importancePath = join(tempDir, "feature-importance.csv");

      try {
        const buildDataset = runPythonSnippet(
          [
            "from pathlib import Path",
            "import pandas as pd",
            "dataset = Path(__import__('sys').argv[1])",
            "frame = pd.DataFrame([",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 120.0, 'action_type_call_tichu': 1, 'action_type_play_cards': 0, 'pass_action_flag': 0, 'actor_team_score': 100.0, 'opponent_team_score': 80.0},",
            "    {'phase': 'trick_play', 'game_id': 'g1', 'decision_id': 'd1', 'rollout_mean_actor_team_delta': 60.0, 'action_type_call_tichu': 0, 'action_type_play_cards': 1, 'pass_action_flag': 0, 'actor_team_score': 98.0, 'opponent_team_score': 82.0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': 40.0, 'action_type_call_tichu': 0, 'action_type_play_cards': 1, 'pass_action_flag': 0, 'actor_team_score': 90.0, 'opponent_team_score': 88.0},",
            "    {'phase': 'trick_play', 'game_id': 'g2', 'decision_id': 'd2', 'rollout_mean_actor_team_delta': -10.0, 'action_type_call_tichu': 0, 'action_type_play_cards': 0, 'pass_action_flag': 1, 'actor_team_score': 84.0, 'opponent_team_score': 96.0},",
            "])",
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
                "action_type_call_tichu",
                "action_type_play_cards",
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
            "--phase",
            "trick_play",
            "--objective",
            "rollout_ranker",
            "--validation-fraction",
            "0",
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(0);
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        expect(meta.row_count).toBe(3);
        expect(meta.filtered_out_delegated_action_row_count).toBe(1);
        expect(meta.excluded_delegated_action_types).toEqual([
          "action_type_call_tichu",
        ]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    15000
  );
});
