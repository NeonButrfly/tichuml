import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
  evaluateGames: number;
  evaluateMinGamesForGate: number;
  evaluateBaselineProvider: ProviderMode;
  candidateBackendPort: number;
  skipEvaluate: boolean;
};

export type LiveMlBootstrapStep = {
  label: "ml:export" | "ml:rollouts" | "ml:train" | "build:server" | "ml:evaluate";
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
  evaluationReportPath: string;
  candidateBackendUrl: string | null;
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
  const evaluateGames = requirePositiveInteger(
    options.evaluateGames,
    "--evaluate-games"
  );
  const evaluateMinGamesForGate = requirePositiveInteger(
    options.evaluateMinGamesForGate,
    "--evaluate-min-games-for-gate"
  );
  const candidateBackendPort = requirePositiveInteger(
    options.candidateBackendPort,
    "--candidate-backend-port"
  );
  const datasetPath = path.join(outputDir, "train.parquet");
  const manifestPath = path.join(outputDir, "dataset_metadata.json");
  const rolloutPath = path.join(outputDir, "rollout_rows.jsonl");
  const modelPath = path.join(outputDir, "lightgbm_action_model.txt");
  const modelMetaPath = path.join(outputDir, "lightgbm_action_model.meta.json");
  const trainingReportPath = path.join(outputDir, "training-report.json");
  const featureImportancePath = path.join(outputDir, "feature-importance.csv");
  const evaluationReportPath = path.join(outputDir, "evaluation-report.json");
  const candidateBackendUrl = options.skipEvaluate
    ? null
    : `http://127.0.0.1:${candidateBackendPort}`;

  const exportArgs = [
    "run",
    "ml:export:raw",
    "--",
    "--phase",
    "trick_play",
    "--source",
    telemetrySource,
    "--format",
    "parquet",
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

  const steps: LiveMlBootstrapStep[] = [
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
  ];

  if (!options.skipEvaluate) {
    steps.push({
      label: "build:server",
      command: "npm",
      args: ["run", "build", "-w", "@tichuml/server"],
    });
    steps.push({
      label: "ml:evaluate",
      command: "npm",
      args: [
        "run",
        "ml:evaluate",
        "--",
        "--games",
        String(evaluateGames),
        "--min-games-for-gate",
        String(evaluateMinGamesForGate),
        "--ns-provider",
        "lightgbm_model",
        "--ew-provider",
        options.evaluateBaselineProvider,
        "--mirror-seats",
        "true",
        "--telemetry",
        "false",
        "--backend-url",
        candidateBackendUrl ?? "",
        "--output",
        evaluationReportPath,
      ],
    });
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
    evaluationReportPath,
    candidateBackendUrl,
    steps,
  };
}

function runCommand(
  command: string,
  args: string[],
  envOverrides?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...(envOverrides ?? {}),
      },
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

export function assertCandidateArtifactsExist(config: {
  modelPath: string;
  modelMetaPath: string;
}): void {
  const missingPaths = [config.modelPath, config.modelMetaPath].filter(
    (candidatePath) => !fs.existsSync(candidatePath)
  );
  if (missingPaths.length > 0) {
    throw new Error(
      `Candidate model artifacts were not written: ${missingPaths.join(", ")}`
    );
  }
}

export function readEvaluationSummary(reportPath: string): {
  gatePassed: boolean;
  modelFile: string | null;
} {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Evaluation report was not written to ${reportPath}.`);
  }
  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    gate?: { passed?: unknown };
    model_file?: unknown;
  };
  return {
    gatePassed: parsed.gate?.passed === true,
    modelFile:
      typeof parsed.model_file === "string" && parsed.model_file.trim().length > 0
        ? parsed.model_file
        : null,
  };
}

export async function assertCandidateBackendPortAvailable(
  port: number,
  host = "127.0.0.1"
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EADDRINUSE"
      ) {
        reject(
          new Error(
            `Candidate backend port ${port} on ${host} is already in use.`
          )
        );
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for candidate backend health at ${url}. Last error: ${lastError ?? "unknown"}.`
  );
}

async function stopChildProcess(
  child: ChildProcessWithoutNullStreams | null
): Promise<void> {
  if (!child || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once("close", () => resolve());
    child.kill();
  });
}

function startCandidateBackend(config: {
  repoRoot: string;
  backendPort: number;
  modelPath: string;
  modelMetaPath: string;
}): ChildProcessWithoutNullStreams {
  return spawn("npm", ["run", "start:server"], {
    cwd: config.repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(config.backendPort),
      BACKEND_BASE_URL: `http://127.0.0.1:${config.backendPort}`,
      LIGHTGBM_MODEL_PATH: config.modelPath,
      LIGHTGBM_MODEL_META_PATH: config.modelMetaPath,
    },
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const provider = readArg(argv, "--provider");
  const repoRoot = process.cwd();
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
    evaluateGames: readOptionalIntegerArg(argv, "--evaluate-games") ?? 8,
    evaluateMinGamesForGate:
      readOptionalIntegerArg(argv, "--evaluate-min-games-for-gate") ?? 8,
    evaluateBaselineProvider:
      (readArg(argv, "--evaluate-baseline-provider") as ProviderMode | null) ??
      "server_heuristic",
    candidateBackendPort:
      readOptionalIntegerArg(argv, "--candidate-backend-port") ?? 4312,
    skipEvaluate: argv.includes("--skip-evaluate"),
  });

  let candidateBackend: ChildProcessWithoutNullStreams | null = null;
  try {
    for (const step of plan.steps) {
      if (step.label === "ml:evaluate") {
        const backendUrl = plan.candidateBackendUrl;
        if (!backendUrl) {
          throw new Error("Candidate backend URL was not configured for evaluation.");
        }
        assertCandidateArtifactsExist({
          modelPath: plan.modelPath,
          modelMetaPath: plan.modelMetaPath,
        });
        const candidateBackendPort = Number.parseInt(
          backendUrl.split(":").at(-1) ?? "",
          10
        );
        await assertCandidateBackendPortAvailable(candidateBackendPort);
        candidateBackend = startCandidateBackend({
          repoRoot,
          backendPort: candidateBackendPort,
          modelPath: path.resolve(plan.modelPath),
          modelMetaPath: path.resolve(plan.modelMetaPath),
        });
        await waitForHealth(`${backendUrl}/health`);
        await runCommand(step.command, step.args);
        const evaluationSummary = readEvaluationSummary(plan.evaluationReportPath);
        if (
          evaluationSummary.modelFile === null ||
          path.resolve(evaluationSummary.modelFile) !== path.resolve(plan.modelPath)
        ) {
          throw new Error(
            `Evaluation report used ${evaluationSummary.modelFile ?? "no model_file"} instead of candidate model ${path.resolve(plan.modelPath)}.`
          );
        }
        if (!evaluationSummary.gatePassed) {
          throw new Error("Live gameplay bootstrap evaluation gate did not pass.");
        }
        await stopChildProcess(candidateBackend);
        candidateBackend = null;
        continue;
      }
      await runCommand(step.command, step.args);
    }
  } finally {
    await stopChildProcess(candidateBackend);
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
        evaluation_report_path: plan.evaluationReportPath,
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
