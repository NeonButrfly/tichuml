import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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
  objective?: TrainingObjective | null;
  minRolloutDecisionSpread: number;
  minRolloutSamples: number;
  minRolloutStddev: number;
  evaluateGames: number;
  evaluateMinGamesForGate: number;
  evaluateBaselineProvider: ProviderMode;
  candidateBackendPort: number;
  skipEvaluate: boolean;
};

export type LiveMlBootstrapStep = {
  label:
    | "ml:export"
    | "ml:rollouts"
    | "ml:train"
    | "build:server"
    | "ml:evaluate";
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

export type TrainingReportSummary = {
  rowCount: number;
  decisionCount: number;
  gameCount: number;
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
  const minRolloutSamples = requireNonNegativeNumber(
    options.minRolloutSamples,
    "--min-rollout-samples"
  );
  const minRolloutStddev = requireNonNegativeNumber(
    options.minRolloutStddev,
    "--min-rollout-stddev"
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
  const objective = options.objective ?? "rollout_regression";
  const datasetPath = path.join(outputDir, "train.jsonl");
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
  const evaluationDecisionTimeoutMs = 5_000;
  const exportArgs = [
    "run",
    "ml:export:raw",
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
    objective,
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
  if (minRolloutSamples > 0) {
    trainArgs.push("--min-rollout-samples", String(minRolloutSamples));
  }
  if (minRolloutStddev > 0) {
    trainArgs.push("--min-rollout-stddev", String(minRolloutStddev));
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
    }
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
        "--decision-timeout-ms",
        String(evaluationDecisionTimeoutMs),
        "--backend-url",
        candidateBackendUrl ?? "",
        "--output",
        evaluationReportPath,
      ]
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
    steps
  };
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
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
        ...(envOverrides ?? {})
      }
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
      typeof parsed.model_file === "string" &&
      parsed.model_file.trim().length > 0
        ? parsed.model_file
        : null,
  };
}

export function readTrainingReportSummary(reportPath: string): TrainingReportSummary {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Training report was not written to ${reportPath}.`);
  }
  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    row_count?: unknown;
    decision_count?: unknown;
    game_count?: unknown;
  };
  const rowCount =
    typeof parsed.row_count === "number" && Number.isFinite(parsed.row_count)
      ? parsed.row_count
      : 0;
  const decisionCount =
    typeof parsed.decision_count === "number" &&
    Number.isFinite(parsed.decision_count)
      ? parsed.decision_count
      : 0;
  const gameCount =
    typeof parsed.game_count === "number" && Number.isFinite(parsed.game_count)
      ? parsed.game_count
      : 0;
  return {
    rowCount,
    decisionCount,
    gameCount,
  };
}

export function assertTrainingDecisionQuality(
  summary: TrainingReportSummary,
  config: {
    minDecisionCount: number;
    minGameCount: number;
  }
): void {
  const failures: string[] = [];
  if (summary.decisionCount < config.minDecisionCount) {
    failures.push(
      `decisions ${summary.decisionCount} < required ${config.minDecisionCount}`
    );
  }
  if (summary.gameCount < config.minGameCount) {
    failures.push(`games ${summary.gameCount} < required ${config.minGameCount}`);
  }
  if (failures.length === 0) {
    return;
  }
  throw new Error(
    `Training sample is too narrow for trustworthy candidate evaluation: ${failures.join(", ")}. ` +
      `Observed rows=${summary.rowCount}, decisions=${summary.decisionCount}, games=${summary.gameCount}.`
  );
}

export async function assertCandidateBackendPortAvailable(
  port: number,
  host = "127.0.0.1"
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (isAddressInUseError(error)) {
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

export async function resolveCandidateBackendPort(
  preferredPort: number,
  host = "127.0.0.1"
): Promise<number> {
  try {
    await assertCandidateBackendPortAvailable(preferredPort, host);
    return preferredPort;
  } catch (error) {
    if (!(error instanceof Error) || !/already in use/i.test(error.message)) {
      throw error;
    }
  }

  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Failed to allocate a free candidate backend port."));
        return;
      }
      const selectedPort = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(selectedPort);
      });
    });
  });
}

export function overrideEvaluationBackendUrl(
  plan: LiveMlBootstrapPlan,
  backendUrl: string
): LiveMlBootstrapPlan {
  return {
    ...plan,
    candidateBackendUrl: backendUrl,
    steps: plan.steps.map((step) => {
      if (step.label !== "ml:evaluate") {
        return step;
      }
      const args = [...step.args];
      const backendUrlIndex = args.indexOf("--backend-url");
      if (backendUrlIndex < 0 || backendUrlIndex + 1 >= args.length) {
        throw new Error("Evaluation step is missing --backend-url.");
      }
      args[backendUrlIndex + 1] = backendUrl;
      return {
        ...step,
        args,
      };
    }),
  };
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
  child: ChildProcess | null
): Promise<void> {
  if (!child) {
    return;
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const waitForClose = async (timeoutMs: number): Promise<boolean> =>
    await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (closed: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(closed);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      child.once("close", () => {
        clearTimeout(timer);
        finish(true);
      });
    });

  if (process.platform === "win32") {
    child.kill();
    if (!(await waitForClose(2_000)) && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await waitForClose(5_000);
    }
    return;
  }

  try {
    if (child.pid) {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
  if (await waitForClose(5_000)) {
    return;
  }
  try {
    if (child.pid) {
      process.kill(-child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    child.kill("SIGKILL");
  }
  await waitForClose(2_000);
}

function parsePortFromUrl(rawUrl: string): number {
  const parsed = new URL(rawUrl);
  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Expected ${rawUrl} to include a positive port.`);
  }
  return port;
}

function logInfo(event: string, payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ event, ...payload })}\n`);
}

function startCandidateBackend(config: {
  repoRoot: string;
  backendPort: number;
  modelPath: string;
  modelMetaPath: string;
}): ChildProcess {
  return spawn("npm", ["run", "start:server"], {
    cwd: config.repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
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
  const minTrainingDecisionCountForEvaluate =
    readOptionalIntegerArg(argv, "--min-training-decisions-for-evaluate") ?? 10;
  const minTrainingGameCountForEvaluate =
    readOptionalIntegerArg(argv, "--min-training-games-for-evaluate") ?? 3;
  const plan = buildLiveMlBootstrapPlan({
    outputDir: readArg(argv, "--output-dir") ?? "",
    backendUrl: readArg(argv, "--backend-url") ?? "http://127.0.0.1:4310",
    telemetrySource: readArg(argv, "--source") ?? "gameplay",
    provider: provider ? provider.trim() : null,
    allowMixedProviders:
      argv.includes("--allow-mixed-providers") || provider === null,
    exportLimit: readOptionalIntegerArg(argv, "--export-limit"),
    rolloutMaxDecisions: readOptionalIntegerArg(
      argv,
      "--rollout-max-decisions"
    ),
    continuationProvider:
      (readArg(argv, "--continuation-provider") as ProviderMode | null) ??
      "server_heuristic",
    rolloutsPerAction:
      readOptionalIntegerArg(argv, "--rollouts-per-action") ?? 1,
    featureProfile:
      (readArg(argv, "--feature-profile") as FeatureProfile | null) ??
      "runtime_raw",
    objective:
      (readArg(argv, "--objective")?.trim() as TrainingObjective | null) ??
      null,
    minRolloutDecisionSpread:
      readOptionalNumberArg(argv, "--min-rollout-decision-spread") ?? 0,
    minRolloutSamples:
      readOptionalIntegerArg(argv, "--min-rollout-samples") ?? 0,
    minRolloutStddev:
      readOptionalNumberArg(argv, "--min-rollout-stddev") ?? 0,
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

  const shouldEvaluate = !argv.includes("--skip-evaluate");
  let candidateBackend: ChildProcess | null = null;
  let runtimePlan = plan;
  let trainingSummary: TrainingReportSummary | null = null;
  try {
    for (const step of plan.steps) {
      if (step.label === "ml:train") {
        await runCommand(step.command, step.args);
        trainingSummary = readTrainingReportSummary(runtimePlan.trainingReportPath);
        logInfo("ml_live_bootstrap_training_summary", {
          row_count: trainingSummary.rowCount,
          decision_count: trainingSummary.decisionCount,
          game_count: trainingSummary.gameCount,
          min_decision_count_for_evaluate: minTrainingDecisionCountForEvaluate,
          min_game_count_for_evaluate: minTrainingGameCountForEvaluate,
        });
        if (shouldEvaluate) {
          assertTrainingDecisionQuality(trainingSummary, {
            minDecisionCount: minTrainingDecisionCountForEvaluate,
            minGameCount: minTrainingGameCountForEvaluate,
          });
        }
        continue;
      }
      if (step.label === "ml:evaluate") {
        const backendUrl = runtimePlan.candidateBackendUrl;
        if (!backendUrl) {
          throw new Error(
            "Candidate backend URL was not configured for evaluation."
          );
        }
        assertCandidateArtifactsExist({
          modelPath: runtimePlan.modelPath,
          modelMetaPath: runtimePlan.modelMetaPath,
        });
        const preferredCandidateBackendPort = parsePortFromUrl(backendUrl);
        const candidateBackendPort = await resolveCandidateBackendPort(
          preferredCandidateBackendPort
        );
        if (candidateBackendPort !== preferredCandidateBackendPort) {
          const resolvedBackendUrl = `http://127.0.0.1:${candidateBackendPort}`;
          runtimePlan = overrideEvaluationBackendUrl(runtimePlan, resolvedBackendUrl);
          logInfo("ml_live_bootstrap_candidate_backend_port_reassigned", {
            requested_port: preferredCandidateBackendPort,
            assigned_port: candidateBackendPort,
          });
        }
        const resolvedBackendUrl = runtimePlan.candidateBackendUrl;
        if (!resolvedBackendUrl) {
          throw new Error(
            "Candidate backend URL was not configured after port selection."
          );
        }
        const evaluationStep = runtimePlan.steps.find(
          (candidateStep) => candidateStep.label === "ml:evaluate"
        );
        if (!evaluationStep) {
          throw new Error("Evaluation step was missing from the runtime plan.");
        }
        candidateBackend = startCandidateBackend({
          repoRoot,
          backendPort: candidateBackendPort,
          modelPath: path.resolve(runtimePlan.modelPath),
          modelMetaPath: path.resolve(runtimePlan.modelMetaPath)
        });
        await waitForHealth(`${resolvedBackendUrl}/health`);
        await runCommand(evaluationStep.command, evaluationStep.args, {
          LIGHTGBM_MODEL_PATH: path.resolve(runtimePlan.modelPath),
          LIGHTGBM_MODEL_META_PATH: path.resolve(runtimePlan.modelMetaPath),
        });
        const evaluationSummary = readEvaluationSummary(runtimePlan.evaluationReportPath);
        if (
          evaluationSummary.modelFile === null ||
          path.resolve(evaluationSummary.modelFile) !== path.resolve(runtimePlan.modelPath)
        ) {
          throw new Error(
            `Evaluation report used ${evaluationSummary.modelFile ?? "no model_file"} instead of candidate model ${path.resolve(runtimePlan.modelPath)}.`
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
        output_dir: runtimePlan.outputDir,
        dataset_path: runtimePlan.datasetPath,
        rollout_path: runtimePlan.rolloutPath,
        model_path: runtimePlan.modelPath,
        model_meta_path: runtimePlan.modelMetaPath,
        training_report_path: runtimePlan.trainingReportPath,
        evaluation_report_path: runtimePlan.evaluationReportPath,
        candidate_backend_url: runtimePlan.candidateBackendUrl,
        training_quality: trainingSummary,
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
