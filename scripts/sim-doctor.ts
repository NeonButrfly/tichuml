import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

type Layer =
  | "backend_health"
  | "db_connection"
  | "telemetry_decision_post"
  | "telemetry_event_post"
  | "persistence_decision"
  | "persistence_event"
  | "persistence_match"
  | "flush"
  | "orphan_process";

type CheckResult = {
  layer: Layer;
  ok: boolean;
  detail: Record<string, unknown>;
};

type TelemetryHealth = {
  queue_pending?: number;
  queue_in_flight?: number;
  queue_accepted?: number;
  queue_persisted?: number;
  persistence_failures?: number;
  last_failure_message?: string | null;
  db_decisions_count?: number;
  db_events_count?: number;
  db_matches_count?: number;
  stats?: {
    decisions?: number;
    events?: number;
    matches?: number;
  };
};

function argValue(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

function parseBooleanArg(argv: string[], name: string, fallback: boolean): boolean {
  const index = argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = argv[index + 1]?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text.length > 0 ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function counts(health: TelemetryHealth): {
  decisions: number;
  events: number;
  matches: number;
} {
  return {
    decisions: health.db_decisions_count ?? health.stats?.decisions ?? 0,
    events: health.db_events_count ?? health.stats?.events ?? 0,
    matches: health.db_matches_count ?? health.stats?.matches ?? 0
  };
}

function decisionPayload(gameId: string) {
  return {
    ts: new Date().toISOString(),
    game_id: gameId,
    hand_id: `${gameId}-hand`,
    phase: "trick_play",
    actor_seat: "seat-0",
    decision_index: 1,
    schema_version: 2,
    engine_version: "sim-doctor",
    sim_version: "sim-doctor",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    policy_name: "sim-doctor",
    policy_source: "local_heuristic",
    state_raw: {},
    state_norm: null,
    legal_actions: [{ type: "pass_turn", seat: "seat-0" }],
    chosen_action: { type: "pass_turn", seat: "seat-0" },
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
    metadata: {
      source: "selfplay",
      diagnostic: "sim-doctor",
      telemetry_mode: "minimal",
      strict_telemetry: true
    },
    antipattern_tags: []
  };
}

function eventPayload(gameId: string) {
  return {
    ts: new Date().toISOString(),
    game_id: gameId,
    hand_id: `${gameId}-hand`,
    phase: "trick_play",
    event_type: "sim_doctor_probe",
    actor_seat: "seat-0",
    event_index: 1,
    schema_version: 2,
    engine_version: "sim-doctor",
    sim_version: "sim-doctor",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    state_norm: null,
    payload: { ok: true },
    metadata: {
      source: "selfplay",
      diagnostic: "sim-doctor",
      telemetry_mode: "minimal",
      strict_telemetry: true
    }
  };
}

async function waitForFlush(baseUrl: string): Promise<TelemetryHealth> {
  let latest = await fetchJson<TelemetryHealth>(`${baseUrl}/api/telemetry/health`);
  for (let index = 0; index < 100; index += 1) {
    if ((latest.queue_pending ?? 0) === 0 && (latest.queue_in_flight ?? 0) === 0) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await fetchJson<TelemetryHealth>(`${baseUrl}/api/telemetry/health`);
  }
  return latest;
}

async function waitForCountIncrease(
  baseUrl: string,
  before: { decisions: number; events: number },
  kind: "decisions" | "events"
): Promise<TelemetryHealth> {
  let latest = await waitForFlush(baseUrl);
  for (let index = 0; index < 50; index += 1) {
    const current = counts(latest);
    if (current[kind] > before[kind]) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await waitForFlush(baseUrl);
  }
  return latest;
}

function runBoundedSim(config: {
  backendUrl: string;
  timeoutMs: number;
  seed: string;
}): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(
      process.execPath,
      [
        tsxCli,
        "apps/sim-runner/src/cli.ts",
        "--games",
        "1",
        "--provider",
        "local",
        "--seed",
        config.seed,
        "--telemetry",
        "true",
        "--strict-telemetry",
        "true",
        "--trace-backend",
        "true",
        "--backend-url",
        config.backendUrl,
        "--quiet"
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, SIM_DIAGNOSTICS: "1" },
        windowsHide: true
      }
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore"
          });
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        child.kill("SIGKILL");
      }
    }, config.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
  const backendUrl = argValue(
    process.argv.slice(2),
    "--backend-url",
    "http://127.0.0.1:4310"
  ).replace(/\/$/u, "");
  const timeoutMs = Number(argValue(process.argv.slice(2), "--timeout-ms", "90000"));
  const runSim = parseBooleanArg(process.argv.slice(2), "--run-sim", true);
  const checks: CheckResult[] = [];
  const startedAt = new Date().toISOString();
  const probeGameId = `sim-doctor-${Date.now()}`;

  let before = {} as TelemetryHealth;
  try {
    const health = await fetchJson<Record<string, unknown>>(`${backendUrl}/health`);
    checks.push({ layer: "backend_health", ok: true, detail: health });
    before = await fetchJson<TelemetryHealth>(`${backendUrl}/api/telemetry/health`);
    checks.push({ layer: "db_connection", ok: true, detail: counts(before) });
  } catch (error) {
    checks.push({
      layer: "backend_health",
      ok: false,
      detail: { message: error instanceof Error ? error.message : String(error) }
    });
  }

  const beforeCounts = counts(before);
  try {
    await fetchJson(`${backendUrl}/api/telemetry/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decisionPayload(probeGameId))
    });
    checks.push({ layer: "telemetry_decision_post", ok: true, detail: {} });
  } catch (error) {
    checks.push({
      layer: "telemetry_decision_post",
      ok: false,
      detail: { message: error instanceof Error ? error.message : String(error) }
    });
  }

  try {
    await fetchJson(`${backendUrl}/api/telemetry/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload(probeGameId))
    });
    checks.push({ layer: "telemetry_event_post", ok: true, detail: {} });
  } catch (error) {
    checks.push({
      layer: "telemetry_event_post",
      ok: false,
      detail: { message: error instanceof Error ? error.message : String(error) }
    });
  }

  let afterProbe = await waitForCountIncrease(
    backendUrl,
    beforeCounts,
    "decisions"
  ).catch(() => before);
  afterProbe = await waitForCountIncrease(
    backendUrl,
    beforeCounts,
    "events"
  ).catch(() => afterProbe);
  const afterProbeCounts = counts(afterProbe);
  checks.push({
    layer: "persistence_decision",
    ok: afterProbeCounts.decisions > beforeCounts.decisions,
    detail: { before: beforeCounts.decisions, after: afterProbeCounts.decisions }
  });
  checks.push({
    layer: "persistence_event",
    ok: afterProbeCounts.events > beforeCounts.events,
    detail: { before: beforeCounts.events, after: afterProbeCounts.events }
  });
  checks.push({
    layer: "persistence_match",
    ok: afterProbeCounts.matches > beforeCounts.matches,
    detail: { before: beforeCounts.matches, after: afterProbeCounts.matches }
  });

  let simResult:
    | { exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }
    | null = null;
  let afterSim = afterProbe;
  if (runSim) {
    simResult = await runBoundedSim({
      backendUrl,
      timeoutMs,
      seed: `sim-doctor-${Date.now()}`
    });
    afterSim = await waitForFlush(backendUrl).catch(() => afterProbe);
  }
  const afterSimCounts = counts(afterSim);
  checks.push({
    layer: "flush",
    ok:
      (afterSim.queue_pending ?? 0) === 0 &&
      (afterSim.queue_in_flight ?? 0) === 0 &&
      (afterSim.persistence_failures ?? 0) === 0,
    detail: {
      queue_pending: afterSim.queue_pending ?? null,
      queue_in_flight: afterSim.queue_in_flight ?? null,
      persistence_failures: afterSim.persistence_failures ?? null,
      last_failure_message: afterSim.last_failure_message ?? null
    }
  });
  checks.push({
    layer: "orphan_process",
    ok: true,
    detail: simResult ?? { run_sim: false }
  });

  if (runSim) {
    checks.push({
      layer: "persistence_decision",
      ok: afterSimCounts.decisions > afterProbeCounts.decisions,
      detail: {
        scope: "one_game_sim",
        before: afterProbeCounts.decisions,
        after: afterSimCounts.decisions
      }
    });
    checks.push({
      layer: "persistence_event",
      ok: afterSimCounts.events > afterProbeCounts.events,
      detail: {
        scope: "one_game_sim",
        before: afterProbeCounts.events,
        after: afterSimCounts.events
      }
    });
    checks.push({
      layer: "persistence_match",
      ok: afterSimCounts.matches > afterProbeCounts.matches,
      detail: {
        scope: "one_game_sim",
        before: afterProbeCounts.matches,
        after: afterSimCounts.matches
      }
    });
  }

  const failedLayers = checks.filter((check) => !check.ok).map((check) => check.layer);
  const summary = {
    ok: failedLayers.length === 0,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    backend_url: backendUrl,
    failed_layers: failedLayers,
    before_counts: beforeCounts,
    after_probe_counts: afterProbeCounts,
    after_sim_counts: afterSimCounts,
    checks
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.log(
    JSON.stringify(
      {
        ok: false,
        failed_layers: ["backend_health"],
        fatal: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
