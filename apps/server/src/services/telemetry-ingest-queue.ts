import type {
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";
import type { TelemetryRepository } from "./telemetry-repository.js";

type TelemetryQueueItem =
  | {
      kind: "decision";
      payload: TelemetryDecisionPayload;
      acceptedAt: string;
    }
  | {
      kind: "event";
      payload: TelemetryEventPayload;
      acceptedAt: string;
    };

export type TelemetryQueueConfig = {
  maxDepth: number;
  batchSize: number;
  concurrency: number;
};

export type TelemetryQueueStats = {
  pending: number;
  in_flight_batches: number;
  accepted: number;
  persisted: number;
  dropped_queue_pressure: number;
  persistence_failures: number;
  last_persisted_at: string | null;
  last_failure_at: string | null;
  last_failure_message: string | null;
};

export type TelemetryEnqueueResult = {
  accepted: boolean;
  queued: boolean;
  dropped: boolean;
  queue_depth: number;
  drop_reason?: "queue_pressure";
};

function nowIso(): string {
  return new Date().toISOString();
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function logTelemetryQueue(
  level: "info" | "warn" | "error",
  event: string,
  payload: Record<string, unknown>
): void {
  const line = JSON.stringify({
    ts: nowIso(),
    event,
    ...payload
  });
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export class TelemetryIngestQueue {
  private readonly queue: TelemetryQueueItem[] = [];
  private inFlightBatches = 0;
  private accepted = 0;
  private persisted = 0;
  private droppedQueuePressure = 0;
  private persistenceFailures = 0;
  private lastPersistedAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureMessage: string | null = null;
  private readonly config: TelemetryQueueConfig;

  constructor(
    private readonly repository: TelemetryRepository,
    config: Partial<TelemetryQueueConfig> = {}
  ) {
    this.config = {
      maxDepth: nonNegativeInteger(config.maxDepth ?? 5000, 5000),
      batchSize: positiveInteger(config.batchSize ?? 100, 100),
      concurrency: positiveInteger(config.concurrency ?? 2, 2)
    };
  }

  enqueueDecision(payload: TelemetryDecisionPayload): TelemetryEnqueueResult {
    return this.enqueue({ kind: "decision", payload, acceptedAt: nowIso() });
  }

  enqueueEvent(payload: TelemetryEventPayload): TelemetryEnqueueResult {
    return this.enqueue({ kind: "event", payload, acceptedAt: nowIso() });
  }

  stats(): TelemetryQueueStats {
    return {
      pending: this.queue.length,
      in_flight_batches: this.inFlightBatches,
      accepted: this.accepted,
      persisted: this.persisted,
      dropped_queue_pressure: this.droppedQueuePressure,
      persistence_failures: this.persistenceFailures,
      last_persisted_at: this.lastPersistedAt,
      last_failure_at: this.lastFailureAt,
      last_failure_message: this.lastFailureMessage
    };
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.inFlightBatches > 0) {
      this.pump();
      if (this.queue.length === 0 && this.inFlightBatches === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private enqueue(item: TelemetryQueueItem): TelemetryEnqueueResult {
    if (this.queue.length >= this.config.maxDepth) {
      this.droppedQueuePressure += 1;
      logTelemetryQueue("warn", "telemetry_ingest_dropped_queue_pressure", {
        request_kind:
          item.kind === "decision" ? "telemetry_decision" : "telemetry_event",
        game_id: item.payload.game_id,
        hand_id: item.payload.hand_id,
        phase: item.payload.phase,
        queue_depth: this.queue.length,
        max_depth: this.config.maxDepth
      });
      return {
        accepted: true,
        queued: false,
        dropped: true,
        queue_depth: this.queue.length,
        drop_reason: "queue_pressure"
      };
    }

    this.queue.push(item);
    this.accepted += 1;
    this.pump();
    return {
      accepted: true,
      queued: true,
      dropped: false,
      queue_depth: this.queue.length
    };
  }

  private pump(): void {
    while (
      this.inFlightBatches < this.config.concurrency &&
      this.queue.length > 0
    ) {
      const batch = this.queue.splice(0, this.config.batchSize);
      this.inFlightBatches += 1;
      void this.persistBatch(batch).finally(() => {
        this.inFlightBatches -= 1;
        this.pump();
      });
    }
  }

  private async persistBatch(batch: TelemetryQueueItem[]): Promise<void> {
    await Promise.all(
      batch.map(async (item) => {
        try {
          if (item.kind === "decision") {
            await this.repository.insertDecision(item.payload);
          } else {
            await this.repository.insertEvent(item.payload);
          }
          this.persisted += 1;
          this.lastPersistedAt = nowIso();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.persistenceFailures += 1;
          this.lastFailureAt = nowIso();
          this.lastFailureMessage = message;
          logTelemetryQueue("error", "telemetry_persistence_failed", {
            request_kind:
              item.kind === "decision" ? "telemetry_decision" : "telemetry_event",
            game_id: item.payload.game_id,
            hand_id: item.payload.hand_id,
            phase: item.payload.phase,
            accepted_at: item.acceptedAt,
            message,
            failure_kind: "persistence_failure"
          });
        }
      })
    );
  }
}
