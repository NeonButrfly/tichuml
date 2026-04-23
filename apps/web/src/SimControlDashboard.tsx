import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_CONFIRMATION_VALUE,
  DEFAULT_BACKEND_BASE_URL,
  normalizeBackendBaseUrl,
  type DecisionMode,
  type SimControllerRequestPayload,
  type SimControllerResponse,
  type SimControllerRuntimeState
} from "@tichuml/shared";
import {
  getBackendSettingsDefaults,
  loadBackendSettings,
  resolveBrowserBackendBaseUrl
} from "./backend/settings";
import {
  BackendRequestError,
  getSimControllerStatus,
  postSimControllerAction,
  testBackendHealth
} from "./backend/client";

type FormState = {
  provider: DecisionMode;
  gamesPerBatch: number;
  telemetryEnabled: boolean;
  telemetryMode: "minimal" | "full";
  telemetryMaxBytes: number;
  telemetryTimeoutMs: number;
  telemetryRetryAttempts: number;
  telemetryRetryDelayMs: number;
  telemetryBackoffMs: number;
  backendUrl: string;
  seedNamespace: string;
  manualSeedOverrideEnabled: boolean;
  manualSeedOverride: string;
  sleepSeconds: number;
  workerCount: number;
  confirmToken: string;
};

function resolveSameOriginBackendUrl(): string | null {
  return resolveBrowserBackendBaseUrl(
    typeof window === "undefined" ? undefined : window.location
  );
}

export function resolveSimDashboardControlApiBaseUrl(config: {
  settingsBackendBaseUrl: string;
  sameOriginBackendUrl: string | null;
}): string {
  return (
    config.sameOriginBackendUrl ??
    (config.settingsBackendBaseUrl || DEFAULT_BACKEND_BASE_URL)
  );
}

function shouldUseSameOriginDefault(
  backendUrl: string,
  sameOriginBackendUrl: string | null
): sameOriginBackendUrl is string {
  return (
    sameOriginBackendUrl !== null &&
    normalizeBackendBaseUrl(backendUrl) === DEFAULT_BACKEND_BASE_URL
  );
}

function createInitialForm(): FormState {
  const settings =
    typeof window === "undefined"
      ? getBackendSettingsDefaults()
      : loadBackendSettings();
  const sameOriginBackendUrl = resolveSameOriginBackendUrl();
  const backendUrl = shouldUseSameOriginDefault(
    settings.backendBaseUrl,
    sameOriginBackendUrl
  )
    ? sameOriginBackendUrl
    : settings.backendBaseUrl || DEFAULT_BACKEND_BASE_URL;
  return {
    provider: settings.decisionMode,
    gamesPerBatch: 1,
    telemetryEnabled: settings.telemetryEnabled,
    telemetryMode: "minimal",
    telemetryMaxBytes: 24 * 1024 * 1024,
    telemetryTimeoutMs: 10_000,
    telemetryRetryAttempts: 2,
    telemetryRetryDelayMs: 250,
    telemetryBackoffMs: 15_000,
    backendUrl,
    seedNamespace: "controller",
    manualSeedOverrideEnabled: false,
    manualSeedOverride: "",
    sleepSeconds: 5,
    workerCount: 1,
    confirmToken: ADMIN_CONFIRMATION_VALUE
  };
}

function toPayload(form: FormState): SimControllerRequestPayload {
  return {
    provider: form.provider,
    games_per_batch: form.gamesPerBatch,
    telemetry_enabled: form.telemetryEnabled,
    telemetry_mode: form.telemetryMode,
    telemetry_max_bytes: form.telemetryMaxBytes,
    telemetry_timeout_ms: form.telemetryTimeoutMs,
    telemetry_retry_attempts: form.telemetryRetryAttempts,
    telemetry_retry_delay_ms: form.telemetryRetryDelayMs,
    telemetry_backoff_ms: form.telemetryBackoffMs,
    backend_url: form.backendUrl,
    seed_namespace: form.seedNamespace,
    manual_seed_override_enabled: form.manualSeedOverrideEnabled,
    manual_seed_override: form.manualSeedOverride,
    sleep_seconds: form.sleepSeconds,
    worker_count: form.workerCount,
    quiet: true,
    progress: false
  };
}

function formatRelative(ts: string | null): string {
  if (!ts) {
    return "never";
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000));
  if (!Number.isFinite(ageSeconds)) {
    return ts;
  }
  return `${ageSeconds}s ago`;
}

function formFromRuntimeConfig(
  current: FormState,
  config: SimControllerRuntimeState["config"]
): FormState {
  return {
    ...current,
    provider: config.provider,
    gamesPerBatch: config.games_per_batch,
    telemetryEnabled: config.telemetry_enabled,
    telemetryMode: config.telemetry_mode,
    telemetryMaxBytes: config.telemetry_max_bytes,
    telemetryTimeoutMs: config.telemetry_timeout_ms,
    telemetryRetryAttempts: config.telemetry_retry_attempts,
    telemetryRetryDelayMs: config.telemetry_retry_delay_ms,
    telemetryBackoffMs: config.telemetry_backoff_ms,
    backendUrl: config.backend_url,
    seedNamespace: config.seed_namespace ?? config.seed_prefix,
    manualSeedOverrideEnabled: config.manual_seed_override_enabled ?? false,
    manualSeedOverride: config.manual_seed_override ?? "",
    sleepSeconds: config.sleep_seconds,
    workerCount: config.worker_count
  };
}

function formatSeedMode(
  seed: SimControllerRuntimeState["active_run_seed"] | SimControllerRuntimeState["last_run_seed"]
): string {
  if (!seed) {
    return "Automatic entropy";
  }
  return seed.mode === "manual_override" ? "Manual override" : "Automatic entropy";
}

function StatePill({ state, stale }: { state: string; stale?: boolean }) {
  return (
    <span className={`sim-pill sim-pill--${stale ? "stale" : state}`}>
      {stale ? "stale" : state}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="sim-metric">
      <span>{label}</span>
      <strong>{value ?? "n/a"}</strong>
    </div>
  );
}

export function SimControlDashboard() {
  const [form, setForm] = useState<FormState>(() => createInitialForm());
  const [status, setStatus] = useState<SimControllerRuntimeState | null>(null);
  const [controlApiBaseUrl] = useState(() => {
    const settings =
      typeof window === "undefined"
        ? getBackendSettingsDefaults()
        : loadBackendSettings();
    return resolveSimDashboardControlApiBaseUrl({
      settingsBackendBaseUrl: settings.backendBaseUrl,
      sameOriginBackendUrl: resolveSameOriginBackendUrl()
    });
  });
  const [feedback, setFeedback] = useState<SimControllerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  const controlsDisabledReason = useMemo(() => {
    if (pendingAction) {
      return `${pendingAction} in progress`;
    }
    if (form.confirmToken.trim() !== ADMIN_CONFIRMATION_VALUE) {
      return "confirmation token required";
    }
    return null;
  }, [form.confirmToken, pendingAction]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const response = await getSimControllerStatus(controlApiBaseUrl);
      setStatus(response.runtime_state);
      setFeedback(response);
      if (!formDirty) {
        setForm((current) =>
          formFromRuntimeConfig(current, response.runtime_state.config)
        );
      }
      setLastUpdatedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load status.");
      if (caught instanceof BackendRequestError && caught.validationErrors) {
        setError(
          caught.validationErrors
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")
        );
      }
    }

    try {
      await testBackendHealth(controlApiBaseUrl);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  }, [controlApiBaseUrl, formDirty]);

  async function runAction(action: "start" | "pause" | "continue" | "stop" | "run-once") {
    setPendingAction(action);
    try {
      setError(null);
      const response = await postSimControllerAction(
        controlApiBaseUrl,
        action,
        toPayload(form),
        form.confirmToken
      );
      setFeedback(response);
      setStatus(response.runtime_state);
      setForm((current) => formFromRuntimeConfig(current, response.runtime_state.config));
      setFormDirty(false);
      setLastUpdatedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Control action failed.");
      if (caught instanceof BackendRequestError && caught.validationErrors) {
        setError(
          caught.validationErrors
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")
        );
      }
    } finally {
      setPendingAction(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, refresh]);

  const canPause = status?.status === "running" || status?.status === "pausing";
  const canContinue = status?.status === "paused" || status?.status === "pausing";
  const canStop =
    status?.status === "running" ||
    status?.status === "paused" ||
    status?.status === "pausing" ||
    status?.status === "starting";
  const liveWorkers = status?.workers ?? [];
  const currentBatchActive =
    (status?.status === "running" ||
      status?.status === "pausing" ||
      status?.status === "paused" ||
      status?.status === "starting") &&
    status?.current_batch_started_at !== null;

  const updateForm = useCallback((update: (current: FormState) => FormState) => {
    setForm((current) => update(current));
    setFormDirty(true);
  }, []);

  return (
    <main className="sim-dashboard">
      <section className="sim-topbar">
        <div>
          <p className="sim-kicker">TichuML Operations</p>
          <h1>Simulator Control</h1>
        </div>
        <div className="sim-topbar__actions">
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto refresh
          </label>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="sim-hero">
        <div className="sim-state-panel">
          <span>Current state</span>
          <StatePill
            state={status?.status ?? "unknown"}
            stale={status?.heartbeat_stale}
          />
          <strong>{status?.status ?? "unknown"}</strong>
          <p>
            Last heartbeat: {formatRelative(status?.last_heartbeat ?? null)}
            {status?.heartbeat_stale ? " - stale" : ""}
          </p>
        </div>
        <div className="sim-control-row">
          <button
            type="button"
            disabled={Boolean(controlsDisabledReason) || status?.status === "running"}
            title={controlsDisabledReason ?? "Start background controller"}
            onClick={() => void runAction("start")}
          >
            Start
          </button>
          <button
            type="button"
            disabled={Boolean(controlsDisabledReason) || !canPause}
            title={controlsDisabledReason ?? "Pause at safe boundary"}
            onClick={() => void runAction("pause")}
          >
            Pause
          </button>
          <button
            type="button"
            disabled={Boolean(controlsDisabledReason) || !canContinue}
            title={controlsDisabledReason ?? "Resume paused workers"}
            onClick={() => void runAction("continue")}
          >
            Continue
          </button>
          <button
            type="button"
            disabled={Boolean(controlsDisabledReason) || !canStop}
            title={controlsDisabledReason ?? "Stop at safe boundary"}
            onClick={() => void runAction("stop")}
          >
            Stop
          </button>
          <button
            type="button"
            disabled={Boolean(controlsDisabledReason)}
            title={controlsDisabledReason ?? "Run one batch"}
            onClick={() => void runAction("run-once")}
          >
            Run Once
          </button>
        </div>
        <div className="sim-metrics-grid">
          <Metric label="Workers" value={status?.worker_count ?? 0} />
          <Metric label="Running" value={status?.running_worker_count ?? 0} />
          <Metric label="Paused" value={status?.paused_worker_count ?? 0} />
          <Metric label="Errored" value={status?.errored_worker_count ?? 0} />
          <Metric label="Current batch" value={currentBatchActive ? "active" : "none"} />
          <Metric label="Backend" value={backendReachable === null ? "unknown" : backendReachable ? "ok" : "down"} />
          <Metric label="Telemetry failures" value={status?.telemetry_failures_total ?? 0} />
          <Metric label="Backoff" value={status?.telemetry_backoff_until ? "active" : "none"} />
        </div>
      </section>

      {error ? <section className="sim-alert">{error}</section> : null}
      {feedback ? (
        <section className="sim-feedback">
          <strong>{feedback.action}</strong>
          <span>
            {feedback.prior_status} {"->"} {feedback.current_status}:{" "}
            {feedback.message}
          </span>
        </section>
      ) : null}

      <section className="sim-grid">
        <form className="sim-panel sim-config" onSubmit={(event) => event.preventDefault()}>
          <h2>Config</h2>
          <label>
            Provider
            <select
              value={form.provider}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  provider: event.target.value as DecisionMode
                }))
              }
            >
              <option value="local">local</option>
              <option value="server_heuristic">server_heuristic</option>
              <option value="lightgbm_model">lightgbm_model</option>
            </select>
          </label>
          <label>
            Games per batch
            <input
              type="number"
              min={1}
              value={form.gamesPerBatch}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  gamesPerBatch: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Worker count
            <input
              type="number"
              min={1}
              value={form.workerCount}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  workerCount: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Sleep seconds
            <input
              type="number"
              min={0}
              value={form.sleepSeconds}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  sleepSeconds: Math.max(0, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Backend URL
            <input
              value={form.backendUrl}
              onChange={(event) =>
                updateForm((current) => ({ ...current, backendUrl: event.target.value }))
              }
            />
          </label>
          <div className="sim-seed-panel">
            <div className="sim-seed-row">
              <span className="sim-seed-label">Seed mode</span>
              <strong>{formatSeedMode(status?.active_run_seed ?? status?.last_run_seed ?? null)}</strong>
            </div>
            <label>
              Current run seed
              <input
                readOnly
                value={status?.active_run_seed?.resolved_run_seed ?? ""}
                placeholder="No active run"
              />
            </label>
            <label className="sim-toggle">
              <input
                type="checkbox"
                checked={form.manualSeedOverrideEnabled}
                onChange={(event) =>
                  updateForm((current) => ({
                    ...current,
                    manualSeedOverrideEnabled: event.target.checked
                  }))
                }
              />
              Manual seed override
            </label>
            <label>
              Override seed
              <input
                value={form.manualSeedOverride}
                disabled={!form.manualSeedOverrideEnabled}
                onChange={(event) =>
                  updateForm((current) => ({
                    ...current,
                    manualSeedOverride: event.target.value
                  }))
                }
              />
            </label>
            <details className="sim-advanced">
              <summary>Advanced derivation</summary>
              <label>
                Derivation namespace
                <input
                  value={form.seedNamespace}
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      seedNamespace: event.target.value
                    }))
                  }
                />
              </label>
            </details>
          </div>
          <label>
            Confirmation token
            <input
              value={form.confirmToken}
              onChange={(event) =>
                updateForm((current) => ({ ...current, confirmToken: event.target.value }))
              }
            />
          </label>
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={form.telemetryEnabled}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryEnabled: event.target.checked
                }))
              }
            />
            Telemetry enabled
          </label>
          <label>
            Telemetry mode
            <select
              value={form.telemetryMode}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryMode: event.target.value === "full" ? "full" : "minimal"
                }))
              }
            >
              <option value="minimal">minimal</option>
              <option value="full">full</option>
            </select>
          </label>
          <label>
            Telemetry max bytes
            <input
              type="number"
              min={1}
              value={form.telemetryMaxBytes}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryMaxBytes: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Telemetry timeout ms
            <input
              type="number"
              min={1}
              value={form.telemetryTimeoutMs}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryTimeoutMs: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Telemetry retries
            <input
              type="number"
              min={1}
              value={form.telemetryRetryAttempts}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryRetryAttempts: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Telemetry retry delay ms
            <input
              type="number"
              min={1}
              value={form.telemetryRetryDelayMs}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryRetryDelayMs: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
          <label>
            Telemetry backoff ms
            <input
              type="number"
              min={1}
              value={form.telemetryBackoffMs}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  telemetryBackoffMs: Math.max(1, Number(event.target.value))
                }))
              }
            />
          </label>
        </form>

        <section className="sim-panel">
          <h2>Totals</h2>
          <div className="sim-metrics-grid sim-metrics-grid--compact">
            <Metric label="Batches" value={status?.total_batches_completed ?? 0} />
            <Metric label="Games" value={status?.total_games_completed ?? 0} />
            <Metric label="Errors" value={status?.total_errors ?? 0} />
            <Metric label="Last batch" value={status?.last_batch_status ?? "n/a"} />
          </div>
          <p className="sim-detail">
            Current run seed: {status?.active_run_seed?.resolved_run_seed ?? "none"}
          </p>
          <p className="sim-detail">
            Last run seed: {status?.last_run_seed?.resolved_run_seed ?? "none"}
          </p>
          <p className="sim-detail">
            Seed mode: {formatSeedMode(status?.active_run_seed ?? status?.last_run_seed ?? null)}
          </p>
          <p className="sim-detail">
            Entropy summary:{" "}
            {status?.active_run_seed?.source_summary
              ? JSON.stringify(status.active_run_seed.source_summary)
              : status?.last_run_seed?.source_summary
                ? JSON.stringify(status.last_run_seed.source_summary)
                : "manual override / none"}
          </p>
          <p className="sim-detail">Last error: {status?.last_error ?? "none"}</p>
          <p className="sim-detail">
            Last shutdown reason: {status?.last_shutdown_reason ?? "none"}
          </p>
          <p className="sim-detail">Telemetry by kind: {JSON.stringify(status?.telemetry_failure_by_kind ?? {})}</p>
          <p className="sim-detail">Telemetry by endpoint: {JSON.stringify(status?.telemetry_failure_by_endpoint ?? {})}</p>
          <p className="sim-detail">Telemetry backoff until: {status?.telemetry_backoff_until ?? "none"}</p>
          <p className="sim-detail">Last updated: {lastUpdatedAt ?? "never"}</p>
          <p className="sim-detail">Control API: {controlApiBaseUrl}</p>
          <p className="sim-detail">Log path: {status?.log_path ?? "n/a"}</p>
          <p className="sim-detail">Runtime path: {status?.runtime_path ?? "n/a"}</p>
        </section>

        <section className="sim-panel sim-workers">
          <h2>Workers</h2>
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Status</th>
                <th>PID</th>
                <th>Batches</th>
                <th>Games</th>
                <th>Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {liveWorkers.length > 0 ? (
                liveWorkers.map((worker) => (
                  <tr key={worker.worker_id}>
                    <td>{worker.worker_id}</td>
                    <td>{worker.status}</td>
                    <td>{worker.pid ?? "n/a"}</td>
                    <td>{worker.total_batches_completed}</td>
                    <td>{worker.total_games_completed}</td>
                    <td>{formatRelative(worker.last_heartbeat)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No active workers.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="sim-panel">
          <h2>Recent Logs</h2>
          <pre>{(status?.recent_logs ?? []).join("\n") || "No logs yet."}</pre>
        </section>

        <section className="sim-panel">
          <h2>Runtime JSON</h2>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </section>
      </section>
    </main>
  );
}
