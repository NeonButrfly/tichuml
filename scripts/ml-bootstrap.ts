import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "../apps/server/src/config/env-file.ts";

export type MlBootstrapOptions = {
  runId?: string | null;
  gameIdPrefix: string;
  outputDir: string;
  backendUrl: string;
  provider: "local" | "server_heuristic" | "lightgbm_model";
  evaluateGames: number;
  evaluateMinGamesForGate: number;
};

export type MlBootstrapStep = {
  label: "ml:export" | "ml:train" | "ml:evaluate";
  command: string;
  args: string[];
};

export type MlBootstrapPlan = {
  outputDir: string;
  datasetPath: string;
  manifestPath: string;
  steps: MlBootstrapStep[];
};

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
  const datasetPath = path.join(outputDir, "train.parquet");
  const manifestPath = path.join(outputDir, "dataset_metadata.json");

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
          "observed_outcome_regression",
          "--target-column",
          "outcome_reward"
        ]
      },
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
          backendUrl
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

function readGatePassed(repoRoot: string): boolean {
  const latestSummaryPath = path.join(
    repoRoot,
    "eval",
    "results",
    "latest_summary.json"
  );
  if (!fs.existsSync(latestSummaryPath)) {
    throw new Error(
      `Evaluation latest summary was not written to ${latestSummaryPath}.`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(latestSummaryPath, "utf8")) as {
    gate_passed?: unknown;
  };
  return parsed.gate_passed === true;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const evaluateGames = readNumberArg(argv, "--evaluate-games", 100);
  const commandEnv = resolveMlBootstrapCommandEnv(process.env);
  const plan = buildMlBootstrapPlan({
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
    )
  });

  for (const step of plan.steps) {
    await runCommand(step.command, step.args, commandEnv);
  }

  if (!readGatePassed(process.cwd())) {
    throw new Error("ML bootstrap evaluation gate did not pass.");
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
