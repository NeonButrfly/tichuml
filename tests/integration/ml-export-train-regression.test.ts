import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
