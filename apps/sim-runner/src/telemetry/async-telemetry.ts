import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  TELEMETRY_DECISION_PATH,
  TELEMETRY_EVENT_PATH,
  normalizeBackendBaseUrl,
  type JsonObject,
  type TelemetryEndpointRuntimeState,
  type TelemetryRuntimeState
} from "@tichuml/shared";
import {
  createTelemetryFailureStats,
  createTelemetryFailureTracker,
  emitTelemetryDecision,
  emitTelemetryEvent,
  emitTelemetryFailureDiagnostic,
  recordTelemetryFailure,
  type TelemetryConfigInput,
  type TelemetryDecisionBuildResult,
  type TelemetryEventBuildResult,
  type TelemetryFailureKind,
  type TelemetryFailureStats,
  type TelemetryWriteResult
} from "@tichuml/telemetry";

type TelemetryRequestKind = "telemetry_decision" | "telemetry_event";

type TelemetryQueueItem =
  | {
      id: string;
      requestKind: "telemetry_decision";
      telemetry: TelemetryConfigInput;
      payloads: TelemetryDecisionBuildResult;
      context: JsonObject;
      strictTelemetry: boolean;
    }
  | {
      id: string;
      requestKind: "telemetry_event";
      telemetry: TelemetryConfigInput;
      payloads: TelemetryEventBuildResult;
      context: JsonObject;
      strictTelemetry: boolean;
    };

export type PersistedTelemetryRecord =
  | {
      schema_version: 1;
      saved_at: string;
      item_id: string;
      request_kind: "telemetry_decision";
      endpoint: string;
      failure_kind: TelemetryFailureKind;
      failure_message: string;
      strict_telemetry: boolean;
      telemetry: TelemetryConfigInput;
      payloads: TelemetryDecisionBuildResult;
      context: JsonObject;
    }
  | {
      schema_version: 1;
      saved_at: string;
      item_id: string;
      request_kind: "telemetry_event";
      endpoint: string;
      failure_kind: TelemetryFailureKind;
      failure_message: string;
      strict_telemetry: boolean;
      telemetry: TelemetryConfigInput;
      payloads: TelemetryEventBuildResult;
      context: JsonObject;
    };

export type ReplayTelemetrySummary = {
  scanned_files: number;
  replayed_files: number;
  replayed_records: number;
  failed_files: number;
  failed_records: number;
  pending_dir: string;
  replayed_dir: string;
};

type MutableEndpointState = TelemetryEndpointRuntimeState;

export type AsyncTelemetryManagerOptions = {
  enabled: boolean;
  storageRoot: string;
  quiet?: boolean;
  controllerMode?: boolean;
  maxConcurrency?: number;
  maxQueueDepth?: number;
  onSnapshot?: ((snapshot: TelemetryRuntimeState) => void) | undefined;
};

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDirSync(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
}

function createRecordId(): string {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function buildEndpoint(
  telemetry: TelemetryConfigInput,
  requestKind: TelemetryRequestKind
): string {
  const baseUrl = normalizeBackendBaseUrl(
    telemetry.backendBaseUrl ?? telemetry.backend_url ?? "http://localhost:4310"
  );
  return `${baseUrl}${
    requestKind === "telemetry_decision"
      ? TELEMETRY_DECISION_PATH
      : TELEMETRY_EVENT_PATH
  }`;
}

function pendingDir(storageRoot: string): string {
  return path.join(storageRoot, "pending");
}

function replayedDir(storageRoot: string): string {
  return path.join(storageRoot, "replayed");
}

function pendingFileCount(targetDir: string): number {
  if (!fs.existsSync(targetDir)) {
    return 0;
  }
  return fs
    .readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson")).length;
}

function createEndpointState(
  endpoint: string,
  requestKind: TelemetryRequestKind
): MutableEndpointState {
  return {
    endpoint,
    request_kind: requestKind,
    status: "connected",
    queue_depth: 0,
    accepted_count: 0,
    failed_count: 0,
    dropped_count: 0,
    pending_count: 0,
    last_success_at: null,
    last_failure_at: null,
    last_failure_reason: null,
    next_retry_at: null
  };
}

function shouldPersistFailure(kind: TelemetryFailureKind): boolean {
  return (
    kind === "timeout" ||
    kind === "network_failure" ||
    kind === "backend_error" ||
    kind === "backend_rejection" ||
    kind === "backoff_suppressed" ||
    kind === "unexpected_failure"
  );
}

function deriveEndpointStatus(state: MutableEndpointState): MutableEndpointState["status"] {
  if (state.next_retry_at && Date.parse(state.next_retry_at) > Date.now()) {
    return "backoff";
  }
  if (state.last_failure_at && state.accepted_count === 0) {
    return "offline";
  }
  if (state.failed_count > 0 || state.pending_count > 0 || state.dropped_count > 0) {
    return "degraded";
  }
  return "connected";
}

function deriveOverallStatus(
  enabled: boolean,
  endpoints: Iterable<MutableEndpointState>
): TelemetryRuntimeState["status"] {
  if (!enabled) {
    return "offline";
  }
  const states = [...endpoints];
  if (states.some((entry) => entry.status === "backoff")) {
    return "backoff";
  }
  if (states.some((entry) => entry.status === "offline")) {
    return "offline";
  }
  if (states.some((entry) => entry.status === "degraded")) {
    return "degraded";
  }
  return "connected";
}

export function createDefaultTelemetryStorageRoot(
  cwd = process.cwd()
): string {
  return path.join(cwd, ".runtime", "telemetry");
}

export class AsyncTelemetryManager {
  private readonly queue: TelemetryQueueItem[] = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private readonly tracker = createTelemetryFailureTracker();
  private readonly stats = createTelemetryFailureStats();
  private readonly endpointStates = new Map<string, MutableEndpointState>();
  private readonly maxConcurrency: number;
  private readonly maxQueueDepth: number;
  private readonly storageRoot: string;
  private readonly pendingRoot: string;
  private readonly replayedRoot: string;
  private inFlight = 0;
  private acceptedCount = 0;
  private failedCount = 0;
  private droppedCount = 0;
  private pendingCount = 0;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureReason: string | null = null;
  private fatalError: Error | null = null;
  private lastFailure: TelemetryWriteResult | undefined;

  constructor(private readonly options: AsyncTelemetryManagerOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 2);
    this.maxQueueDepth = Math.max(1, options.maxQueueDepth ?? 256);
    this.storageRoot = options.storageRoot;
    this.pendingRoot = pendingDir(this.storageRoot);
    this.replayedRoot = replayedDir(this.storageRoot);
    ensureDirSync(this.pendingRoot);
    ensureDirSync(this.replayedRoot);
    this.pendingCount = pendingFileCount(this.pendingRoot);
  }

  private endpointState(
    endpoint: string,
    requestKind: TelemetryRequestKind
  ): MutableEndpointState {
    const existing = this.endpointStates.get(endpoint);
    if (existing) {
      return existing;
    }
    const created = createEndpointState(endpoint, requestKind);
    this.endpointStates.set(endpoint, created);
    return created;
  }

  private updateQueueDepths(): void {
    const depth = this.queue.length + this.inFlight;
    for (const entry of this.endpointStates.values()) {
      entry.queue_depth = depth;
      entry.status = deriveEndpointStatus(entry);
    }
  }

  private emitSnapshot(): void {
    this.updateQueueDepths();
    if (!this.options.onSnapshot) {
      return;
    }
    this.options.onSnapshot(this.snapshot().runtimeState);
  }

  private recordFailure(result: TelemetryWriteResult, context: JsonObject): void {
    if (result.ok) {
      return;
    }
    recordTelemetryFailure(this.stats, result);
    this.failedCount += 1;
    this.lastFailure = result;
    this.lastFailureAt = nowIso();
    this.lastFailureReason = result.message;
    const endpoint = this.endpointState(result.endpoint, result.request_kind);
    endpoint.failed_count += 1;
    endpoint.last_failure_at = this.lastFailureAt;
    endpoint.last_failure_reason = result.message;
    endpoint.next_retry_at = result.backoff_until ?? null;
    endpoint.status = deriveEndpointStatus(endpoint);
    emitTelemetryFailureDiagnostic(
      {
        ...(this.options.quiet !== undefined ? { quiet: this.options.quiet } : {}),
        ...(this.options.controllerMode ? { controllerMode: true } : {})
      },
      this.tracker,
      result,
      context
    );
    this.emitSnapshot();
  }

  private recordSuccess(result: Extract<TelemetryWriteResult, { ok: true }>): void {
    this.acceptedCount += 1;
    this.lastSuccessAt = nowIso();
    const endpoint = this.endpointState(result.endpoint, result.request_kind);
    endpoint.accepted_count += 1;
    endpoint.last_success_at = this.lastSuccessAt;
    endpoint.next_retry_at = null;
    endpoint.status = deriveEndpointStatus(endpoint);
    this.emitSnapshot();
  }

  private async persistItem(
    item: TelemetryQueueItem,
    result: TelemetryWriteResult
  ): Promise<boolean> {
    const endpoint = buildEndpoint(item.telemetry, item.requestKind);
    const record: PersistedTelemetryRecord =
      item.requestKind === "telemetry_decision"
        ? {
            schema_version: 1,
            saved_at: nowIso(),
            item_id: item.id,
            request_kind: item.requestKind,
            endpoint,
            failure_kind: result.ok ? "unexpected_failure" : result.failure_kind,
            failure_message: result.ok ? "Unexpected success state." : result.message,
            strict_telemetry: item.strictTelemetry,
            telemetry: item.telemetry,
            payloads: item.payloads,
            context: item.context
          }
        : {
            schema_version: 1,
            saved_at: nowIso(),
            item_id: item.id,
            request_kind: item.requestKind,
            endpoint,
            failure_kind: result.ok ? "unexpected_failure" : result.failure_kind,
            failure_message: result.ok ? "Unexpected success state." : result.message,
            strict_telemetry: item.strictTelemetry,
            telemetry: item.telemetry,
            payloads: item.payloads,
            context: item.context
          };
    const filePath = path.join(
      this.pendingRoot,
      `${record.saved_at.replace(/[:.]/g, "-")}-${item.requestKind}-${item.id}.ndjson`
    );
    try {
      await fsp.writeFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
      this.pendingCount += 1;
      const endpointState = this.endpointState(endpoint, item.requestKind);
      endpointState.pending_count += 1;
      endpointState.status = deriveEndpointStatus(endpointState);
      this.emitSnapshot();
      return true;
    } catch (error) {
      this.droppedCount += 1;
      const endpointState = this.endpointState(endpoint, item.requestKind);
      endpointState.dropped_count += 1;
      endpointState.last_failure_at = nowIso();
      endpointState.last_failure_reason =
        error instanceof Error ? error.message : String(error);
      endpointState.status = deriveEndpointStatus(endpointState);
      this.emitSnapshot();
      if (item.strictTelemetry && this.fatalError === null) {
        this.fatalError = new Error(
          `Strict telemetry durable write failed for ${endpoint}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      return false;
    }
  }

  private async processItem(
    item: TelemetryQueueItem,
    signal: AbortSignal
  ): Promise<void> {
    const telemetry = {
      ...item.telemetry,
      strictTelemetry: false
    };
    const result =
      item.requestKind === "telemetry_decision"
        ? await emitTelemetryDecision({
            telemetry,
            payloads: item.payloads,
            signal
          })
        : await emitTelemetryEvent({
            telemetry,
            payloads: item.payloads,
            signal
          });

    if (result.ok) {
      this.recordSuccess(result);
      return;
    }

    this.recordFailure(result, item.context);
    if (shouldPersistFailure(result.failure_kind)) {
      await this.persistItem(item, result);
    }
  }

  private pump(): void {
    while (this.queue.length > 0 && this.inFlight < this.maxConcurrency) {
      const item = this.queue.shift();
      if (!item) {
        break;
      }
      this.inFlight += 1;
      const controller = new AbortController();
      this.controllers.add(controller);
      let task: Promise<void> | null = null;
      task = (async () => {
        try {
          await this.processItem(item, controller.signal);
        } catch (error) {
          const endpoint = buildEndpoint(item.telemetry, item.requestKind);
          await this.persistItem(item, {
            ok: false,
            endpoint,
            method: "POST",
            request_kind: item.requestKind,
            outcome: "failed",
            failure_kind: "unexpected_failure",
            message: error instanceof Error ? error.message : String(error),
            cause: error instanceof Error ? error.name : "unknown",
            diagnostics: []
          });
        } finally {
          this.controllers.delete(controller);
          this.inFlight -= 1;
          if (task) {
            this.pending.delete(task);
          }
          this.emitSnapshot();
          this.pump();
        }
      })();
      this.pending.add(task);
    }
    this.emitSnapshot();
  }

  throwIfFatal(): void {
    if (this.fatalError) {
      throw this.fatalError;
    }
  }

  async enqueueDecision(config: {
    telemetry: TelemetryConfigInput;
    payloads: TelemetryDecisionBuildResult;
    context: JsonObject;
    strictTelemetry: boolean;
  }): Promise<void> {
    await this.enqueue({
      id: createRecordId(),
      requestKind: "telemetry_decision",
      telemetry: config.telemetry,
      payloads: config.payloads,
      context: config.context,
      strictTelemetry: config.strictTelemetry
    });
  }

  async enqueueEvent(config: {
    telemetry: TelemetryConfigInput;
    payloads: TelemetryEventBuildResult;
    context: JsonObject;
    strictTelemetry: boolean;
  }): Promise<void> {
    await this.enqueue({
      id: createRecordId(),
      requestKind: "telemetry_event",
      telemetry: config.telemetry,
      payloads: config.payloads,
      context: config.context,
      strictTelemetry: config.strictTelemetry
    });
  }

  private async enqueue(item: TelemetryQueueItem): Promise<void> {
    this.throwIfFatal();
    if (!this.options.enabled) {
      return;
    }
    if (this.queue.length + this.inFlight >= this.maxQueueDepth) {
      const endpoint = buildEndpoint(item.telemetry, item.requestKind);
      await this.persistItem(item, {
        ok: false,
        endpoint,
        method: "POST",
        request_kind: item.requestKind,
        outcome: "failed",
        failure_kind: "unexpected_failure",
        message: "Telemetry background queue is full; persisted locally instead.",
        cause: "background_queue_full",
        diagnostics: []
      });
      return;
    }
    this.queue.push(item);
    this.emitSnapshot();
    this.pump();
  }

  async flush(timeoutMs: number): Promise<void> {
    const deadlineAt = Date.now() + Math.max(1, timeoutMs);
    while (this.queue.length > 0 || this.inFlight > 0) {
      if (Date.now() >= deadlineAt) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (this.queue.length === 0 && this.inFlight === 0) {
      this.emitSnapshot();
      return;
    }

    for (const controller of this.controllers) {
      controller.abort();
    }
    await Promise.allSettled(this.pending);

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        continue;
      }
      const endpoint = buildEndpoint(item.telemetry, item.requestKind);
      await this.persistItem(item, {
        ok: false,
        endpoint,
        method: "POST",
        request_kind: item.requestKind,
        outcome: "failed",
        failure_kind: "unexpected_failure",
        message: "Telemetry queue flush timed out; persisted locally.",
        cause: "flush_timeout",
        diagnostics: []
      });
    }
    this.emitSnapshot();
  }

  snapshot(): {
    stats: TelemetryFailureStats;
    runtimeState: TelemetryRuntimeState;
    telemetryBackoffUntil: string | null;
    lastFailure?: TelemetryWriteResult;
  } {
    const endpointStates = [...this.endpointStates.entries()].map(
      ([key, value]): [string, MutableEndpointState] => [
        key,
        {
          ...value,
          queue_depth: this.queue.length + this.inFlight,
          status: deriveEndpointStatus(value)
        }
      ]
    );
    const endpointValues = endpointStates.map(([, value]) => value);
    const nextRetry = endpointValues
      .map((value) => value.next_retry_at)
      .filter((value): value is string => typeof value === "string")
      .sort()[0] ?? null;
    const runtimeState: TelemetryRuntimeState = {
      enabled: this.options.enabled,
      status: deriveOverallStatus(this.options.enabled, endpointValues),
      queue_depth: this.queue.length + this.inFlight,
      accepted_count: this.acceptedCount,
      failed_count: this.failedCount,
      dropped_count: this.droppedCount,
      pending_count: this.pendingCount,
      last_success_at: this.lastSuccessAt,
      last_failure_at: this.lastFailureAt,
      last_failure_reason: this.lastFailureReason,
      storage_dir: this.pendingRoot,
      replayed_dir: this.replayedRoot,
      endpoints: Object.fromEntries(endpointStates)
    };

    return {
      stats: this.stats,
      runtimeState,
      telemetryBackoffUntil: nextRetry,
      ...(this.lastFailure ? { lastFailure: this.lastFailure } : {})
    };
  }
}

export async function replayPersistedTelemetry(config: {
  storageRoot?: string;
  quiet?: boolean;
} = {}): Promise<ReplayTelemetrySummary> {
  const storageRoot = config.storageRoot ?? createDefaultTelemetryStorageRoot();
  const pendingRoot = pendingDir(storageRoot);
  const replayedRoot = replayedDir(storageRoot);
  ensureDirSync(pendingRoot);
  ensureDirSync(replayedRoot);

  const files = (await fsp.readdir(pendingRoot))
    .filter((entry) => entry.endsWith(".ndjson"))
    .sort();

  const summary: ReplayTelemetrySummary = {
    scanned_files: files.length,
    replayed_files: 0,
    replayed_records: 0,
    failed_files: 0,
    failed_records: 0,
    pending_dir: pendingRoot,
    replayed_dir: replayedRoot
  };

  for (const fileName of files) {
    const sourcePath = path.join(pendingRoot, fileName);
    try {
      const rawText = await fsp.readFile(sourcePath, "utf8");
      const lines = rawText
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      let fileFailed = false;
      for (const line of lines) {
        const record = JSON.parse(line) as PersistedTelemetryRecord;
        const telemetry = {
          ...record.telemetry,
          strictTelemetry: false
        };
        const result =
          record.request_kind === "telemetry_decision"
            ? await emitTelemetryDecision({
                telemetry,
                payloads: record.payloads
              })
            : await emitTelemetryEvent({
                telemetry,
                payloads: record.payloads
              });
        if (!result.ok) {
          fileFailed = true;
          summary.failed_records += 1;
          break;
        }
        summary.replayed_records += 1;
      }
      if (fileFailed) {
        summary.failed_files += 1;
        continue;
      }
      await fsp.rename(sourcePath, path.join(replayedRoot, fileName));
      summary.replayed_files += 1;
    } catch {
      summary.failed_files += 1;
      summary.failed_records += 1;
    }
  }

  if (!config.quiet) {
    console.log(JSON.stringify(summary, null, 2));
  }
  return summary;
}
