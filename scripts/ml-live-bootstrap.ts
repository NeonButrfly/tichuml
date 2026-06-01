import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type ProviderMode = "local" | "server_heuristic" | "lightgbm_model";
type FeatureProfile = "runtime_raw" | "full";
type TrainingObjective = "rollout_ranker" | "rollout_regression";

export type LiveMlBootstrapOptions = {
  outputDir: string;
  backendUrl: string;
  telemetrySource: string;
  provider: string | null;
  allowMixedProviders: boolean;
  exportLimit: number | null;
  rolloutMaxDecisions: number | null;
  continuationProvider: ProviderMode;
  rolloutsPerAction: number;
  featureProfile: FeatureProfile;
  objective: TrainingObjective;
  minRolloutDecisionSpread: number;
};

export type LiveMlBootstrapStep = {
  label: "ml:export" | "ml:rollouts" | "ml:train";
  command: string;
  args: string[];
};

export type LiveMlBootstrapPlan = {
  outputDir: string;
  datasetPath: string;
  manifestPath: string;
  rolloutPath: string;
  modelPath: string;
  modelMetaPath: string;
  trainingReportPath: string;
  featureImportancePath: string;
  steps: LiveMlBootstrapStep[];
};

function requireNonEmpty(value: string, flag: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Expected a non-empty ${flag}.`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, flag: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected ${flag} to be a positive integer.`);
  }
  return value;
}

function requireNonNegativeNumber(value: number, flag: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Expected ${flag} to be a non-negative number.`);
  }
  return value;
}

function readArg(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function readOptionalIntegerArg(argv: string[], flag: string): number | null {
  const value = readArg(argv, flag);
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalNumberArg(argv: string[], flag: string): number | null {
  const value = readArg(argv, flag);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendOptionalFlag(
  args: string[],
  flag: string,
  value: string | number | null | undefined
): void {
  if (value === null || value === undefined) {
    return;
  }
  args.push(flag, String(value));
}

export function buildLiveMlBootstrapPlan(
  options: LiveMlBootstrapOptions
): LiveMlBootstrapPlan {
  const outputDir = requireNonEmpty(options.outputDir, "--output-dir");
  const backendUrl = requireNonEmpty(options.backendUrl, "--backend-url");
  const telemetrySource = requireNonEmpty(options.telemetrySource, "--source");
  const rolloutsPerAction = requirePositiveInteger(
    options.rolloutsPerAction,
    "--rollouts-per-action"
  );
  const exportLimit =
    options.exportLimit === null
      ? null
      : requirePositiveInteger(options.exportLimit, "--export-limit");
  const rolloutMaxDecisions =
    options.rolloutMaxDecisions === null
      ? null
      : requirePositiveInteger(
          options.rolloutMaxDecisions,
          "--rollout-max-decisions"
        );
  const minRolloutDecisionSpread = requireNonNegativeNumber(
    options.minRolloutDecisionSpread,
    "--min-rollout-decision-spread"
  );
  const datasetPath = path.join(outputDir, "train.jsonl");
  const manifestPath = path.join(outputDir, "dataset_metadata.json");
  const rolloutPath = path.join(outputDir, "rollout_rows.jsonl");
  const modelPath = path.join(outputDir, "lightgbm_action_model.txt");
  const modelMetaPath = path.join(outputDir, "lightgbm_action_model.meta.json");
  const trainingReportPath = path.join(outputDir, "training-report.json");
  const featureImportancePath = path.join(outputDir, "feature-importance.csv");

  const exportArgs = [
    "run",
    "ml:export",
    "--",
    "--phase",
    "trick_play",
    "--source",
    telemetrySource,
    "--format",
    "jsonl",
    "--include-rollouts",
    "--output-dir",
    outputDir,
  ];
  if (options.provider) {
    exportArgs.push("--provider", options.provider);
  } else if (options.allowMixedProviders) {
    exportArgs.push("--allow-mixed-providers");
  }
  appendOptionalFlag(exportArgs, "--limit", exportLimit);

  const rolloutArgs = [
    "run",
    "ml:rollouts",
    "--",
    "--input-export",
    datasetPath,
    "--output",
    rolloutPath,
    "--phase",
    "trick_play",
    "--continuation-provider",
    options.continuationProvider,
    "--rollouts-per-action",
    String(rolloutsPerAction),
    "--backend-url",
    backendUrl,
  ];
  appendOptionalFlag(rolloutArgs, "--max-decisions", rolloutMaxDecisions);

  const trainArgs = [
    "run",
    "ml:train",
    "--",
    "--input",
    datasetPath,
    "--manifest-input",
    manifestPath,
    "--rollout-input",
    rolloutPath,
    "--phase",
    "trick_play",
    "--objective",
    options.objective,
    "--feature-profile",
    options.featureProfile,
    "--output",
    modelPath,
    "--meta-output",
    modelMetaPath,
    "--report-output",
    trainingReportPath,
    "--feature-importance-output",
    featureImportancePath,
  ];
  if (minRolloutDecisionSpread > 0) {
    trainArgs.push(
      "--min-rollout-decision-spread",
      String(minRolloutDecisionSpread)
    );
  }

  return {
    outputDir,
    datasetPath,
    manifestPath,
    rolloutPath,
    modelPath,
    modelMetaPath,
    trainingReportPath,
    featureImportancePath,
    steps: [
      {
        label: "ml:export",
        command: "npm",
        args: exportArgs,
      },
      {
        label: "ml:rollouts",
        command: "npm",
        args: rolloutArgs,
      },
      {
        label: "ml:train",
        command: "npm",
        args: trainArgs,
      },
    ],
  };
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code ?? "unknown"}.`
        )
      );
    });

    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const provider = readArg(argv, "--provider");
  const plan = buildLiveMlBootstrapPlan({
    outputDir: readArg(argv, "--output-dir") ?? "",
    backendUrl: readArg(argv, "--backend-url") ?? "http://127.0.0.1:4310",
    telemetrySource: readArg(argv, "--source") ?? "gameplay",
    provider: provider ? provider.trim() : null,
    allowMixedProviders:
      argv.includes("--allow-mixed-providers") || provider === null,
    exportLimit: readOptionalIntegerArg(argv, "--export-limit"),
    rolloutMaxDecisions: readOptionalIntegerArg(argv, "--rollout-max-decisions"),
    continuationProvider:
      (readArg(argv, "--continuation-provider") as ProviderMode | null) ??
      "server_heuristic",
    rolloutsPerAction: readOptionalIntegerArg(argv, "--rollouts-per-action") ?? 1,
    featureProfile:
      (readArg(argv, "--feature-profile") as FeatureProfile | null) ??
      "runtime_raw",
    objective:
      (readArg(argv, "--objective") as TrainingObjective | null) ??
      "rollout_ranker",
    minRolloutDecisionSpread:
      readOptionalNumberArg(argv, "--min-rollout-decision-spread") ?? 0,
  });

  for (const step of plan.steps) {
    await runCommand(step.command, step.args);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        accepted: true,
        output_dir: plan.outputDir,
        dataset_path: plan.datasetPath,
        rollout_path: plan.rolloutPath,
        model_path: plan.modelPath,
        model_meta_path: plan.modelMetaPath,
        training_report_path: plan.trainingReportPath,
      },
      null,
      2
    )}\n`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
