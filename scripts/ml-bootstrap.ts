import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";
import {
  assertHeuristicImitationTrainingQuality,
  assertObservedOutcomeTrainingQuality,
  assertTrainingDecisionQuality,
  assertCandidateArtifactsExist,
  readEvaluationSummary,
  readTrainingReportQualitySummary,
  resolveCandidateBackendPort
} from "./ml-live-bootstrap.ts";

export type MlBootstrapOptions = {
  runId?: string | null;
  gameIdPrefix: string;
  outputDir: string;
  backendUrl: string;
  provider: "local" | "server_heuristic" | "lightgbm_model";
  evaluateGames: number;
  evaluateMinGamesForGate: number;
  candidateBackendPort: number;
  evaluateMinLightgbmServedDecisions: number;
  evaluateMinLightgbmServiceRate: number;
  skipBuildServer?: boolean;
};

export type MlBootstrapStep = {
  label: "ml:export" | "ml:train" | "build:server" | "ml:evaluate";
  command: string;
  args: string[];
};

export type MlBootstrapPlan = {
  outputDir: string;
  datasetPath: string;
  manifestPath: string;
  modelPath: string;
  modelMetaPath: string;
  trainingReportPath: string;
  featureImportancePath: string;
  evaluationReportPath: string;
  candidateBackendUrl: string;
  steps: MlBootstrapStep[];
};

export const DEFAULT_BOOTSTRAP_MIN_TRAINING_DECISIONS = 100;
export const DEFAULT_BOOTSTRAP_MIN_TRAINING_GAMES = 10;
export const DEFAULT_BOOTSTRAP_MIN_HEURISTIC_TOP1_RECALL = 0.6;

const TRAINING_DATABASE_ENV_KEYS = [
  "TRAINING_DATABASE_URL",
  "TICHU_TRAINING_DATABASE_URL",
  "DATABASE_URL"
] as const;

function requireNonEmpty(value: string, flag: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Expected a non-empty ${flag}.`);
  }
  return normalized;
}

function readArg(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function readNumberArg(argv: string[], flag: string, fallback: number): number {
  const value = readArg(argv, flag);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFloatArg(argv: string[], flag: string, fallback: number): number {
  const value = readArg(argv, flag);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requirePositiveInteger(value: number, flag: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected ${flag} to be a positive integer.`);
  }
  return value;
}

export function buildMlBootstrapPlan(
  options: MlBootstrapOptions
): MlBootstrapPlan {
  const runId = options.runId?.trim() ? requireNonEmpty(options.runId, "--run-id") : null;
  const gameIdPrefix = requireNonEmpty(options.gameIdPrefix, "--game-id-prefix");
  const outputDir = requireNonEmpty(options.outputDir, "--output-dir");
  const backendUrl = requireNonEmpty(options.backendUrl, "--backend-url");
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
  const evaluateMinLightgbmServedDecisions = requirePositiveInteger(
    options.evaluateMinLightgbmServedDecisions,
    "--min-lightgbm-served-decisions"
  );
  if (
    !Number.isFinite(options.evaluateMinLightgbmServiceRate) ||
    options.evaluateMinLightgbmServiceRate < 0 ||
    options.evaluateMinLightgbmServiceRate > 1
  ) {
    throw new Error(
      "Expected --min-lightgbm-service-rate to be a number between 0 and 1."
    );
  }
  const datasetPath = path.join(outputDir, "train.parquet");
  const manifestPath = path.join(outputDir, "dataset_metadata.json");
  const modelPath = path.join(outputDir, "lightgbm_action_model.txt");
  const modelMetaPath = path.join(outputDir, "lightgbm_action_model.meta.json");
  const trainingReportPath = path.join(outputDir, "training-report.json");
  const featureImportancePath = path.join(outputDir, "feature-importance.csv");
  const evaluationReportPath = path.join(outputDir, "evaluation-report.json");
  const candidateBackendUrl = `http://127.0.0.1:${candidateBackendPort}`;

  const exportArgs = [
    "run",
    "ml:export",
    "--",
    "--game-id-prefix",
    gameIdPrefix,
    "--output-dir",
    outputDir,
    "--provider",
    options.provider
  ];
  if (runId) {
    exportArgs.splice(3, 0, "--run-id", runId);
  }

  return {
    outputDir,
    datasetPath,
    manifestPath,
    modelPath,
    modelMetaPath,
    trainingReportPath,
    featureImportancePath,
    evaluationReportPath,
    candidateBackendUrl,
    steps: [
      {
        label: "ml:export",
        command: "npm",
        args: exportArgs
      },
      {
        label: "ml:train",
        command: "npm",
        args: [
          "run",
          "ml:train",
          "--",
          "--input",
          datasetPath,
          "--manifest-input",
          manifestPath,
          "--phase",
          "trick_play",
          "--objective",
          "imitation_binary",
          "--output",
          modelPath,
          "--meta-output",
          modelMetaPath,
          "--report-output",
          trainingReportPath,
          "--feature-importance-output",
          featureImportancePath
        ]
      },
      ...(options.skipBuildServer
        ? []
        : ([
            {
              label: "build:server",
              command: "npm",
              args: ["run", "build", "-w", "@tichuml/server"]
            }
          ] satisfies MlBootstrapStep[])),
      {
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
          "--min-lightgbm-served-decisions",
          String(evaluateMinLightgbmServedDecisions),
          "--min-lightgbm-service-rate",
          String(options.evaluateMinLightgbmServiceRate),
          "--ns-provider",
          "lightgbm_model",
          "--ew-provider",
          options.provider,
          "--mirror-seats",
          "true",
          "--telemetry",
          "false",
          "--decision-timeout-ms",
          "5000",
          "--backend-url",
          candidateBackendUrl,
          "--output",
          evaluationReportPath
        ]
      }
    ]
  };
}

export function resolveMlBootstrapCommandEnv(
  env: NodeJS.ProcessEnv,
  repoRoot = process.cwd()
): NodeJS.ProcessEnv {
  const diskEnv = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, "apps/server/.env"))
  };
  const resolvedEnv: NodeJS.ProcessEnv = {};
  for (const key of TRAINING_DATABASE_ENV_KEYS) {
    const explicitValue = env[key];
    if (typeof explicitValue === "string" && explicitValue.trim().length > 0) {
      resolvedEnv[key] = explicitValue;
      break;
    }
    const fileValue = diskEnv[key];
    if (typeof fileValue === "string" && fileValue.trim().length > 0) {
      resolvedEnv[key] = fileValue;
      break;
    }
  }
  return resolvedEnv;
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

function parsePortFromUrl(rawUrl: string): number {
  const parsed = new URL(rawUrl);
  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Expected ${rawUrl} to include a positive port.`);
  }
  return port;
}

function updateEvaluationBackendUrl(
  plan: MlBootstrapPlan,
  backendUrl: string
): MlBootstrapPlan {
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
        args
      };
    })
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
      LIGHTGBM_MODEL_META_PATH: config.modelMetaPath
    }
  });
}

async function stopChildProcess(child: ChildProcess | null): Promise<void> {
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
        windowsHide: true
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const evaluateGames = readNumberArg(argv, "--evaluate-games", 100);
  const minTrainingDecisionCountForEvaluate = readNumberArg(
    argv,
    "--min-training-decisions-for-evaluate",
    DEFAULT_BOOTSTRAP_MIN_TRAINING_DECISIONS
  );
  const minTrainingGameCountForEvaluate = readNumberArg(
    argv,
    "--min-training-games-for-evaluate",
    DEFAULT_BOOTSTRAP_MIN_TRAINING_GAMES
  );
  const minHeuristicTop1Recall = readFloatArg(
    argv,
    "--min-heuristic-top1-recall",
    DEFAULT_BOOTSTRAP_MIN_HEURISTIC_TOP1_RECALL
  );
  const commandEnv = resolveMlBootstrapCommandEnv(process.env);
  let runtimePlan = buildMlBootstrapPlan({
    runId: readArg(argv, "--run-id"),
    gameIdPrefix: readArg(argv, "--game-id-prefix") ?? "",
    outputDir: readArg(argv, "--output-dir") ?? "",
    backendUrl: readArg(argv, "--backend-url") ?? "http://127.0.0.1:4310",
    provider:
      (readArg(argv, "--provider") as MlBootstrapOptions["provider"] | null) ??
      "server_heuristic",
    evaluateGames,
    evaluateMinGamesForGate: readNumberArg(
      argv,
      "--evaluate-min-games-for-gate",
      evaluateGames
    ),
    candidateBackendPort: readNumberArg(argv, "--candidate-backend-port", 4312),
    evaluateMinLightgbmServedDecisions: readNumberArg(
      argv,
      "--min-lightgbm-served-decisions",
      50
    ),
    evaluateMinLightgbmServiceRate:
      Number(readArg(argv, "--min-lightgbm-service-rate") ?? "0.1"),
    skipBuildServer: argv.includes("--skip-build-server")
  });
  let candidateBackend: ChildProcess | null = null;
  try {
    for (const step of runtimePlan.steps) {
      if (step.label === "ml:train") {
        await runCommand(step.command, step.args, commandEnv);
        const trainingSummary = readTrainingReportQualitySummary(
          runtimePlan.trainingReportPath
        );
        assertTrainingDecisionQuality(trainingSummary, {
          minDecisionCount: minTrainingDecisionCountForEvaluate,
          minGameCount: minTrainingGameCountForEvaluate
        });
        assertHeuristicImitationTrainingQuality(trainingSummary, {
          minTop1ChosenActionRecall: minHeuristicTop1Recall
        });
        assertObservedOutcomeTrainingQuality(trainingSummary);
        continue;
      }
      if (step.label === "ml:evaluate") {
        assertCandidateArtifactsExist({
          modelPath: runtimePlan.modelPath,
          modelMetaPath: runtimePlan.modelMetaPath
        });
        const preferredPort = parsePortFromUrl(runtimePlan.candidateBackendUrl);
        const candidateBackendPort = await resolveCandidateBackendPort(
          preferredPort
        );
        if (candidateBackendPort !== preferredPort) {
          runtimePlan = updateEvaluationBackendUrl(
            runtimePlan,
            `http://127.0.0.1:${candidateBackendPort}`
          );
        }
        const evaluationStep = runtimePlan.steps.find(
          (candidateStep) => candidateStep.label === "ml:evaluate"
        );
        if (!evaluationStep) {
          throw new Error("Evaluation step was missing from the runtime plan.");
        }
        candidateBackend = startCandidateBackend({
          repoRoot: process.cwd(),
          backendPort: candidateBackendPort,
          modelPath: path.resolve(runtimePlan.modelPath),
          modelMetaPath: path.resolve(runtimePlan.modelMetaPath)
        });
        await waitForHealth(`${runtimePlan.candidateBackendUrl}/health`);
        await runCommand(evaluationStep.command, evaluationStep.args, commandEnv);
        const evaluationSummary = readEvaluationSummary(
          runtimePlan.evaluationReportPath
        );
        if (
          evaluationSummary.modelFile === null ||
          path.resolve(evaluationSummary.modelFile) !==
            path.resolve(runtimePlan.modelPath)
        ) {
          throw new Error(
            `Evaluation report used ${evaluationSummary.modelFile ?? "no model_file"} instead of candidate model ${path.resolve(runtimePlan.modelPath)}.`
          );
        }
        if (!evaluationSummary.gatePassed) {
          throw new Error("ML bootstrap evaluation gate did not pass.");
        }
        await stopChildProcess(candidateBackend);
        candidateBackend = null;
        continue;
      }
      await runCommand(step.command, step.args, commandEnv);
    }
  } finally {
    await stopChildProcess(candidateBackend);
  }
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
