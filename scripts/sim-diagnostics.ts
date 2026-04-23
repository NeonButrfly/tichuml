import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  buildDiagnosticsComparison,
  createDiagnosticsAccumulator,
  finalizeDiagnosticsSummary,
  processDiagnosticsLine,
  recordRuntimeSnapshot,
  renderDiagnosticsReport,
  tryParseSummaryFromOutput,
  writeDiagnosticsSessionArtifacts,
  type DiagnosticsRunDescriptor,
  type DiagnosticsRunTarget,
  type DiagnosticsSummary
} from "../apps/sim-runner/src/sim-diagnostics.js";
import { generateEntropySeed } from "../apps/server/src/entropy/index.js";

type ProviderName = "local" | "server_heuristic";
type HarnessMode = "single" | "quick" | "full";
type HarnessCase = {
  id: string;
  label: string;
  target: DiagnosticsRunTarget;
  provider: ProviderName;
  telemetryEnabled: boolean;
  telemetryMode: "minimal" | "full";
  serverFallbackEnabled: boolean;
  workerCount: number;
  gamesRequested: number | null;
  gamesPerBatch: number | null;
  controllerSeconds: number | null;
  traceBackend: boolean;
  maxDecisionsPerGame: number | null;
  wallClockSeconds: number;
};

type CliOptions = {
  mode: HarnessMode;
  caseIds: string[];
  providers: Set<ProviderName>;
  includeController: boolean;
  backendUrl: string;
  outputRoot: string;
  gamesOverride: number | null;
  controllerSeconds: number;
  workersLow: number;
  workersHigh: number;
  verbose: boolean;
  quiet: boolean;
  manualSeedOverride: string | null;
  seedNamespace: string;
};

type RunSeedInfo = DiagnosticsRunDescriptor["seed"];

function nowIso(): string {
  return new Date().toISOString();
}

function toTimestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "quick",
    caseIds: [],
    providers: new Set<ProviderName>(),
    includeController: false,
    backendUrl: process.env.BACKEND_BASE_URL?.trim() || "http://127.0.0.1:4310",
    outputRoot: path.join(process.cwd(), "diagnostics", "sim-runs"),
    gamesOverride: null,
    controllerSeconds: 10,
    workersLow: 1,
    workersHigh: 4,
    verbose: false,
    quiet: false,
    manualSeedOverride: null,
    seedNamespace: "diagnostics"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--mode":
        if (next === "single" || next === "quick" || next === "full") {
          options.mode = next;
          index += 1;
        } else {
          throw new Error(`Invalid --mode value: ${next ?? ""}`);
        }
        break;
      case "--case":
        if (!next) {
          throw new Error("Missing value for --case.");
        }
        options.caseIds.push(next);
        index += 1;
        break;
      case "--provider":
        if (next === "local" || next === "server_heuristic") {
          options.providers.add(next);
          index += 1;
        } else {
          throw new Error(`Invalid --provider value: ${next ?? ""}`);
        }
        break;
      case "--include-controller":
        options.includeController = parseBooleanFlag(next, true);
        index += 1;
        break;
      case "--backend-url":
        if (!next) {
          throw new Error("Missing value for --backend-url.");
        }
        options.backendUrl = next;
        index += 1;
        break;
      case "--output-root":
        if (!next) {
          throw new Error("Missing value for --output-root.");
        }
        options.outputRoot = path.resolve(next);
        index += 1;
        break;
      case "--games":
        options.gamesOverride = Math.max(1, Number(next ?? 1));
        index += 1;
        break;
      case "--controller-seconds":
        options.controllerSeconds = Math.max(1, Number(next ?? 10));
        index += 1;
        break;
      case "--workers-low":
        options.workersLow = Math.max(1, Number(next ?? 1));
        index += 1;
        break;
      case "--workers-high":
        options.workersHigh = Math.max(1, Number(next ?? 4));
        index += 1;
        break;
      case "--manual-seed":
        options.manualSeedOverride = next ?? null;
        index += 1;
        break;
      case "--seed-namespace":
        options.seedNamespace = next?.trim() || options.seedNamespace;
        index += 1;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      default:
        break;
    }
  }

  if (options.mode === "full" && !argv.includes("--include-controller")) {
    options.includeController = true;
  }

  return options;
}

function buildHarnessCases(options: CliOptions): HarnessCase[] {
  const directGames =
    options.gamesOverride ?? (options.mode === "full" ? 3 : 1);
  const directDecisionLimit = options.mode === "full" ? 250 : 120;
  const directWallClockSeconds = options.mode === "full" ? 90 : 20;
  const baseCases: HarnessCase[] = [
    {
      id: "server-heuristic-telemetry-off",
      label: "server_heuristic telemetry off",
      target: "oneshot",
      provider: "server_heuristic",
      telemetryEnabled: false,
      telemetryMode: "minimal",
      serverFallbackEnabled: true,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: true,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    },
    {
      id: "server-heuristic-telemetry-on",
      label: "server_heuristic telemetry on",
      target: "oneshot",
      provider: "server_heuristic",
      telemetryEnabled: true,
      telemetryMode: "minimal",
      serverFallbackEnabled: true,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: true,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    },
    {
      id: "server-heuristic-telemetry-full",
      label: "server_heuristic telemetry full",
      target: "oneshot",
      provider: "server_heuristic",
      telemetryEnabled: true,
      telemetryMode: "full",
      serverFallbackEnabled: true,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: true,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    },
    {
      id: "server-heuristic-fallback-off",
      label: "server_heuristic fallback off",
      target: "oneshot",
      provider: "server_heuristic",
      telemetryEnabled: false,
      telemetryMode: "minimal",
      serverFallbackEnabled: false,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: true,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    },
    {
      id: "local-telemetry-off",
      label: "local telemetry off",
      target: "oneshot",
      provider: "local",
      telemetryEnabled: false,
      telemetryMode: "minimal",
      serverFallbackEnabled: true,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: false,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    },
    {
      id: "local-telemetry-on",
      label: "local telemetry on",
      target: "oneshot",
      provider: "local",
      telemetryEnabled: true,
      telemetryMode: "minimal",
      serverFallbackEnabled: true,
      workerCount: 1,
      gamesRequested: directGames,
      gamesPerBatch: null,
      controllerSeconds: null,
      traceBackend: true,
      maxDecisionsPerGame: directDecisionLimit,
      wallClockSeconds: directWallClockSeconds
    }
  ];

  if (options.includeController) {
    baseCases.push(
      {
        id: "controller-local-workers-low",
        label: `controller local workers ${options.workersLow}`,
        target: "controller",
        provider: "local",
        telemetryEnabled: false,
        telemetryMode: "minimal",
        serverFallbackEnabled: true,
        workerCount: options.workersLow,
        gamesRequested: null,
        gamesPerBatch: 1,
        controllerSeconds: options.controllerSeconds,
        traceBackend: false,
        maxDecisionsPerGame: directDecisionLimit,
        wallClockSeconds: options.controllerSeconds + 20
      },
      {
        id: "controller-local-workers-high",
        label: `controller local workers ${options.workersHigh}`,
        target: "controller",
        provider: "local",
        telemetryEnabled: false,
        telemetryMode: "minimal",
        serverFallbackEnabled: true,
        workerCount: options.workersHigh,
        gamesRequested: null,
        gamesPerBatch: 1,
        controllerSeconds: options.controllerSeconds,
        traceBackend: false,
        maxDecisionsPerGame: directDecisionLimit,
        wallClockSeconds: options.controllerSeconds + 20
      }
    );
  }

  let filtered = baseCases;
  if (options.providers.size > 0) {
    filtered = filtered.filter((testCase) => options.providers.has(testCase.provider));
  }
  if (options.caseIds.length > 0) {
    filtered = filtered.filter((testCase) => options.caseIds.includes(testCase.id));
  }
  if (options.mode === "single") {
    filtered = filtered.slice(0, 1);
  }
  if (filtered.length === 0) {
    throw new Error("No diagnostics runs matched the requested filters.");
  }
  return filtered;
}

async function resolveRunSeedInfo(options: CliOptions): Promise<RunSeedInfo> {
  if (options.manualSeedOverride) {
    return {
      mode: "manual_override",
      resolved_run_seed: options.manualSeedOverride,
      derivation_namespace: options.seedNamespace,
      manual_override_enabled: true,
      manual_override_seed: options.manualSeedOverride,
      generated_at: nowIso(),
      entropy_game_id: null,
      audit_hash_hex: null,
      primary_provider: "manual_override",
      local_fallback_used: null,
      source_summary: null
    };
  }

  const entropy = await generateEntropySeed({ roundIndex: 0 });
  return {
    mode: "automatic_entropy",
    resolved_run_seed: entropy.shuffleSeedHex,
    derivation_namespace: options.seedNamespace,
    manual_override_enabled: false,
    manual_override_seed: null,
    generated_at: nowIso(),
    entropy_game_id: entropy.gameId,
    audit_hash_hex: entropy.auditHashHex,
    primary_provider: entropy.provenance.primaryProvider,
    local_fallback_used: entropy.provenance.localFallbackUsed,
    source_summary: entropy.sourceSummary as unknown as Record<string, unknown>
  };
}

function makeRunDescriptor(config: {
  testCase: HarnessCase;
  sessionRoot: string;
  runSeedInfo: RunSeedInfo;
  backendUrl: string;
}): DiagnosticsRunDescriptor {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const runtimeDir =
    config.testCase.target === "controller"
      ? path.join(config.sessionRoot, config.testCase.id, "runtime")
      : null;
  const args = [
    "run",
    "sim",
    "--"
  ];
  if (config.testCase.target === "controller") {
    args.push(
      "--forever",
      "--provider",
      config.testCase.provider,
      "--games-per-batch",
      String(config.testCase.gamesPerBatch ?? 1),
      "--sleep-seconds",
      "0",
      "--worker-count",
      String(config.testCase.workerCount)
    );
  } else {
    args.push(
      "--games",
      String(config.testCase.gamesRequested ?? 1),
      "--provider",
      config.testCase.provider
    );
  }
  args.push(
    "--seed",
    config.runSeedInfo.resolved_run_seed,
    "--seed-prefix",
    config.runSeedInfo.derivation_namespace,
    "--telemetry",
    String(config.testCase.telemetryEnabled),
    "--server-fallback",
    String(config.testCase.serverFallbackEnabled),
    "--strict-telemetry",
    "false",
      "--trace-backend",
      String(config.testCase.traceBackend),
      "--telemetry-mode",
      config.testCase.telemetryMode,
      "--backend-url",
      config.backendUrl,
      "--quiet"
    );
  if (config.testCase.maxDecisionsPerGame !== null) {
    args.push(
      "--max-decisions-per-game",
      String(config.testCase.maxDecisionsPerGame)
    );
  }

  if (runtimeDir) {
    args.push(
      "--runtime-file",
      path.join(runtimeDir, "state.json"),
      "--lock-file",
      path.join(runtimeDir, "controller.lock"),
      "--pause-file",
      path.join(runtimeDir, "pause"),
      "--stop-file",
      path.join(runtimeDir, "stop"),
      "--log-file",
      path.join(runtimeDir, "controller.ndjson")
    );
  }

  const display = `${npmCommand} ${args.join(" ")}`;
  return {
    run_id: config.testCase.id,
    label: config.testCase.label,
    target: config.testCase.target,
    provider: config.testCase.provider,
    telemetry_enabled: config.testCase.telemetryEnabled,
    telemetry_mode: config.testCase.telemetryMode,
    server_fallback_enabled: config.testCase.serverFallbackEnabled,
    worker_count: config.testCase.workerCount,
    games_requested: config.testCase.gamesRequested,
    games_per_batch: config.testCase.gamesPerBatch,
    backend_url: config.backendUrl,
    command: {
      executable: npmCommand,
      args,
      display
    },
    resolved_config: {
      provider: config.testCase.provider,
      telemetry_enabled: config.testCase.telemetryEnabled,
      telemetry_mode: config.testCase.telemetryMode,
      server_fallback_enabled: config.testCase.serverFallbackEnabled,
      worker_count: config.testCase.workerCount,
      games_requested: config.testCase.gamesRequested,
      games_per_batch: config.testCase.gamesPerBatch,
      target: config.testCase.target,
      controller_seconds: config.testCase.controllerSeconds,
      backend_url: config.backendUrl,
      diagnostics_enabled: true,
      trace_backend: config.testCase.traceBackend,
      max_decisions_per_game: config.testCase.maxDecisionsPerGame,
      wall_clock_seconds: config.testCase.wallClockSeconds
    },
    seed: config.runSeedInfo
  };
}

function terminateProcessTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore"
      });
    } catch {
      // best effort for diagnostics cleanup
    }
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore best-effort cleanup errors
  }
}

async function checkBackendHealth(backendUrl: string): Promise<{
  checked_at: string;
  ok: boolean;
  status: number | null;
  detail: string;
}> {
  const checkedAt = nowIso();
  try {
    const response = await fetch(`${backendUrl.replace(/\/+$/u, "")}/health`);
    const text = await response.text();
    return {
      checked_at: checkedAt,
      ok: response.ok,
      status: response.status,
      detail: text.slice(0, 500)
    };
  } catch (error) {
    return {
      checked_at: checkedAt,
      ok: false,
      status: null,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function createChunkCapture(config: {
  stream: NodeJS.ReadableStream | null;
  filePath: string;
  onLine: (line: string) => void;
}): Promise<void> {
  return new Promise((resolve) => {
    if (!config.stream) {
      fs.writeFileSync(config.filePath, "", "utf8");
      resolve();
      return;
    }
    fs.mkdirSync(path.dirname(config.filePath), { recursive: true });
    const writer = fs.createWriteStream(config.filePath, { encoding: "utf8" });
    let remainder = "";
    config.stream.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      writer.write(text);
      const parts = `${remainder}${text}`.split(/\r?\n/u);
      remainder = parts.pop() ?? "";
      for (const part of parts) {
        config.onLine(part);
      }
    });
    config.stream.on("end", () => {
      if (remainder.length > 0) {
        config.onLine(remainder);
      }
      writer.end(() => resolve());
    });
  });
}

function writeEvent(
  eventsWriter: fs.WriteStream,
  payload: Record<string, unknown>
): void {
  eventsWriter.write(`${JSON.stringify(payload)}${os.EOL}`);
}

async function runCase(config: {
  testCase: HarnessCase;
  descriptor: DiagnosticsRunDescriptor;
  sessionRoot: string;
  options: CliOptions;
}): Promise<DiagnosticsSummary> {
  const runDir = path.join(config.sessionRoot, config.testCase.id);
  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const eventsPath = path.join(runDir, "events.ndjson");
  const summaryPath = path.join(runDir, "summary.json");
  fs.mkdirSync(runDir, { recursive: true });
  const eventsWriter = fs.createWriteStream(eventsPath, { encoding: "utf8" });
  const accumulator = createDiagnosticsAccumulator(config.descriptor);

  const descriptorWithHealth: DiagnosticsRunDescriptor = {
    ...config.descriptor,
    ...(config.descriptor.backend_url &&
    (config.testCase.provider !== "local" || config.testCase.telemetryEnabled)
      ? { backend_preflight: await checkBackendHealth(config.descriptor.backend_url) }
      : {})
  };
  accumulator.descriptor = descriptorWithHealth;

  writeEvent(eventsWriter, {
    ts: nowIso(),
    stream: "meta",
    event: "run_start",
    run_id: config.testCase.id,
    descriptor: descriptorWithHealth
  });

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SIM_DIAGNOSTICS: "1",
    SIM_RUN_SEED_INFO_JSON: JSON.stringify(descriptorWithHealth.seed)
  };
  let runtimePaths:
    | {
        runtimeFile: string;
        stopFile: string;
        logFile: string;
      }
    | null = null;
  if (config.testCase.target === "controller") {
    runtimePaths = {
      runtimeFile: path.join(runDir, "runtime", "state.json"),
      stopFile: path.join(runDir, "runtime", "stop"),
      logFile: path.join(runDir, "runtime", "controller.ndjson")
    };
    childEnv.SIM_CONTROLLER_SESSION_ID = randomUUID();
  }

  const child =
    process.platform === "win32"
      ? spawn(descriptorWithHealth.command.display, {
          cwd: process.cwd(),
          env: childEnv,
          stdio: ["ignore", "pipe", "pipe"],
          shell: true
        })
      : spawn(
          descriptorWithHealth.command.executable,
          descriptorWithHealth.command.args,
          {
            cwd: process.cwd(),
            env: childEnv,
            stdio: ["ignore", "pipe", "pipe"]
          }
        );

  const stdoutCapture = createChunkCapture({
    stream: child.stdout,
    filePath: stdoutPath,
    onLine: (line) => {
      const processed = processDiagnosticsLine(accumulator, "stdout", line);
      if (processed) {
        writeEvent(eventsWriter, processed.eventRecord);
      }
    }
  });
  const stderrCapture = createChunkCapture({
    stream: child.stderr,
    filePath: stderrPath,
    onLine: (line) => {
      const processed = processDiagnosticsLine(accumulator, "stderr", line);
      if (processed) {
        writeEvent(eventsWriter, processed.eventRecord);
      }
    }
  });

  let controllerLogLineCount = 0;
  let lastRuntimeContent = "";
  let stopRequested = false;
  let forceKilled = false;
  const hardStopInterval = setInterval(() => {
    if (
      !forceKilled &&
      Date.now() - accumulator.startedAt >=
        config.testCase.wallClockSeconds * 1000
    ) {
      forceKilled = true;
      terminateProcessTree(child.pid ?? 0);
      writeEvent(eventsWriter, {
        ts: nowIso(),
        stream: "meta",
        event: "run_wall_clock_timeout",
        wall_clock_seconds: config.testCase.wallClockSeconds
      });
    }
  }, 1000);
  const controllerInterval =
    runtimePaths === null
      ? null
      : setInterval(() => {
          if (fs.existsSync(runtimePaths.logFile)) {
            const content = fs.readFileSync(runtimePaths.logFile, "utf8");
            const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
            for (let index = controllerLogLineCount; index < lines.length; index += 1) {
              const processed = processDiagnosticsLine(
                accumulator,
                "controller_log",
                lines[index]
              );
              if (processed) {
                writeEvent(eventsWriter, processed.eventRecord);
              }
            }
            controllerLogLineCount = lines.length;
          }

          if (fs.existsSync(runtimePaths.runtimeFile)) {
            const runtimeContent = fs.readFileSync(runtimePaths.runtimeFile, "utf8");
            if (runtimeContent !== lastRuntimeContent) {
              lastRuntimeContent = runtimeContent;
              try {
                const state = JSON.parse(runtimeContent);
                const runtimeRecord = recordRuntimeSnapshot(
                  accumulator,
                  state,
                  nowIso()
                );
                writeEvent(eventsWriter, runtimeRecord);
              } catch {
                writeEvent(eventsWriter, {
                  ts: nowIso(),
                  stream: "runtime",
                  event: "runtime_parse_failure"
                });
              }
            }
          }

          if (
            runtimePaths &&
            config.testCase.controllerSeconds !== null &&
            !stopRequested &&
            Date.now() - accumulator.startedAt >=
              config.testCase.controllerSeconds * 1000
          ) {
            fs.mkdirSync(path.dirname(runtimePaths.stopFile), { recursive: true });
            fs.writeFileSync(runtimePaths.stopFile, nowIso(), "utf8");
            stopRequested = true;
            writeEvent(eventsWriter, {
              ts: nowIso(),
              stream: "meta",
              event: "controller_stop_requested"
            });
          }

          if (
            runtimePaths &&
            stopRequested &&
            !forceKilled &&
            Date.now() - accumulator.startedAt >=
              (config.testCase.controllerSeconds ?? 0) * 1000 + 15_000
          ) {
            forceKilled = true;
            child.kill();
            writeEvent(eventsWriter, {
              ts: nowIso(),
              stream: "meta",
              event: "controller_force_kill"
            });
          }
        }, 1000);

  const exit = await new Promise<{ code: number | null; signal: string | null }>(
    (resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }
  );

  if (controllerInterval) {
    clearInterval(controllerInterval);
  }
  clearInterval(hardStopInterval);
  if (runtimePaths?.logFile && fs.existsSync(runtimePaths.logFile)) {
    const content = fs.readFileSync(runtimePaths.logFile, "utf8");
    const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
    for (let index = controllerLogLineCount; index < lines.length; index += 1) {
      const processed = processDiagnosticsLine(accumulator, "controller_log", lines[index]);
      if (processed) {
        writeEvent(eventsWriter, processed.eventRecord);
      }
    }
  }
  if (runtimePaths?.runtimeFile && fs.existsSync(runtimePaths.runtimeFile)) {
    const runtimeContent = fs.readFileSync(runtimePaths.runtimeFile, "utf8");
    if (runtimeContent !== lastRuntimeContent) {
      try {
        const state = JSON.parse(runtimeContent);
        writeEvent(eventsWriter, recordRuntimeSnapshot(accumulator, state, nowIso()));
      } catch {
        // ignore final runtime parse failure in diagnostics tail
      }
    }
  }

  await Promise.all([stdoutCapture, stderrCapture]);

  if (!accumulator.parsedSummary && fs.existsSync(stdoutPath)) {
    const stdoutContent = fs.readFileSync(stdoutPath, "utf8");
    const parsed = tryParseSummaryFromOutput(stdoutContent);
    if (parsed) {
      accumulator.parsedSummary = parsed;
    }
  }

  const summary = finalizeDiagnosticsSummary({
    accumulator,
    endedAt: Date.now(),
    exitCode: exit.code,
    exitSignal: exit.signal,
    stdoutPath,
    stderrPath,
    eventsPath
  });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeEvent(eventsWriter, {
    ts: nowIso(),
    stream: "meta",
    event: "run_end",
    run_id: config.testCase.id,
    exit_code: exit.code,
    exit_signal: exit.signal,
    summary_path: summaryPath
  });
  await new Promise<void>((resolve) => eventsWriter.end(() => resolve()));
  return summary;
}

function printUsage(): void {
  console.log(`Usage:
  npm run sim:diag -- --mode quick
  npm run sim:diag -- --mode full
  npm run sim:diag -- --mode quick --provider local
  npm run sim:diag -- --mode quick --provider server_heuristic --provider local
  npm run sim:diag -- --mode single --case server-heuristic-telemetry-on
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }
  const options = parseArgs(argv);
  const harnessCases = buildHarnessCases(options);
  const sessionRoot = path.join(options.outputRoot, toTimestampSlug());
  fs.mkdirSync(sessionRoot, { recursive: true });

  if (!options.quiet) {
    console.log(
      `Starting simulator diagnostics in ${sessionRoot} with ${harnessCases.length} run(s).`
    );
  }

  const summaries: DiagnosticsSummary[] = [];
  for (const testCase of harnessCases) {
    const runSeedInfo = await resolveRunSeedInfo(options);
    const descriptor = makeRunDescriptor({
      testCase,
      sessionRoot,
      runSeedInfo,
      backendUrl: options.backendUrl
    });
    if (!options.quiet) {
      console.log(`Running ${testCase.id}...`);
      if (options.verbose) {
        console.log(`  ${descriptor.command.display}`);
      }
    }
    const summary = await runCase({
      testCase,
      descriptor,
      sessionRoot,
      options
    });
    summaries.push(summary);
    if (!options.quiet) {
      console.log(
        `  completed in ${summary.duration_seconds}s, games/sec ${summary.throughput.games_per_sec}, clean=${summary.clean}`
      );
    }
  }

  const comparison = buildDiagnosticsComparison(sessionRoot, summaries);
  const reportMarkdown = renderDiagnosticsReport(sessionRoot, summaries, comparison);
  const artifacts = writeDiagnosticsSessionArtifacts({
    sessionRoot,
    summaries,
    comparison,
    reportMarkdown
  });

  if (!options.quiet) {
    console.log(`Diagnostics written to ${sessionRoot}`);
    console.log(`Index: ${artifacts.indexPath}`);
    console.log(`Comparison: ${artifacts.comparisonPath}`);
    console.log(`Report: ${artifacts.reportPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
