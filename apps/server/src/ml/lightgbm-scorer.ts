import fs from "node:fs";
import readline from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  CandidateActionFeatureSnapshot,
  TacticalFeatureSnapshot
} from "@tichuml/ai-heuristics";
import type { LegalAction } from "@tichuml/engine";
import type { JsonObject } from "@tichuml/shared";
import type { ServerConfig } from "../config/env.js";

export type LightgbmScoreRequest = {
  stateRaw: JsonObject;
  actorSeat: string;
  phase: string;
  legalActions: LegalAction[];
  stateFeatures: TacticalFeatureSnapshot;
  candidateFeatures: Array<CandidateActionFeatureSnapshot | null>;
};

export type LightgbmScoreResult = {
  scores: number[];
  modelMetadata: JsonObject;
  runtimeMetadata: JsonObject;
};

export interface LightgbmScorer {
  score(request: LightgbmScoreRequest): Promise<LightgbmScoreResult>;
  close(): Promise<void>;
}

type PendingRequest = {
  resolve: (value: LightgbmScoreResult) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

export class PythonLightgbmScorer implements LightgbmScorer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestSequence = 0;

  constructor(private readonly config: ServerConfig) {}

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) {
      return this.child;
    }

    if (!fs.existsSync(this.config.lightgbmInferScript)) {
      throw new Error(
        `LightGBM inference script not found at ${this.config.lightgbmInferScript}.`
      );
    }

    if (!fs.existsSync(this.config.lightgbmModelPath)) {
      throw new Error(
        `LightGBM model not found at ${this.config.lightgbmModelPath}. Train the model before selecting lightgbm_model.`
      );
    }

    const child = spawn(
      this.config.pythonExecutable,
      [
        this.config.lightgbmInferScript,
        "--serve",
        "--model",
        this.config.lightgbmModelPath,
        "--meta",
        this.config.lightgbmModelMetaPath
      ],
      {
        cwd: this.config.repoRoot,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      this.rejectAllPending(
        new Error(`Failed to start LightGBM inference process: ${error.message}`)
      );
      this.child = null;
    });

    child.on("close", (code) => {
      const detail = stderr.trim();
      this.rejectAllPending(
        new Error(
          detail.length > 0
            ? `LightGBM inference process exited (${code ?? "unknown"}): ${detail}`
            : `LightGBM inference process exited with code ${code ?? "unknown"}.`
        )
      );
      this.child = null;
    });

    const lineReader = readline.createInterface({ input: child.stdout });
    lineReader.on("line", (line) => {
      const payload = JSON.parse(line) as Record<string, unknown>;
      const requestId =
        typeof payload.id === "string" && payload.id.trim().length > 0
          ? payload.id
          : null;
      if (!requestId) {
        return;
      }

      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }

      this.pending.delete(requestId);
      clearTimeout(pending.timeout);

      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        pending.reject(new Error(payload.error));
        return;
      }

      if (!Array.isArray(payload.scores)) {
        pending.reject(
          new Error("LightGBM inference returned a malformed score payload.")
        );
        return;
      }

      const parsedScores = payload.scores.map((value) =>
        typeof value === "number" ? value : Number.NaN
      );
      if (parsedScores.some((value) => !Number.isFinite(value))) {
        pending.reject(
          new Error("LightGBM inference returned non-finite candidate scores.")
        );
        return;
      }

      pending.resolve({
        scores: parsedScores,
        modelMetadata:
          typeof payload.model_metadata === "object" &&
          payload.model_metadata !== null
            ? (payload.model_metadata as JsonObject)
            : {},
        runtimeMetadata:
          typeof payload.runtime_metadata === "object" &&
          payload.runtime_metadata !== null
            ? (payload.runtime_metadata as JsonObject)
            : {}
      });
    });

    this.child = child;
    return child;
  }

  async score(request: LightgbmScoreRequest): Promise<LightgbmScoreResult> {
    const child = this.ensureProcess();
    const requestId = `score-${Date.now()}-${this.requestSequence++}`;

    return await new Promise<LightgbmScoreResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("LightGBM inference timed out after 15 seconds."));
      }, 15_000);

      this.pending.set(requestId, { resolve, reject, timeout });
      child.stdin.write(
        `${JSON.stringify({
          id: requestId,
          state_raw: request.stateRaw,
          actor_seat: request.actorSeat,
          phase: request.phase,
          legal_actions: request.legalActions,
          state_features: request.stateFeatures,
          candidate_features: request.candidateFeatures
        })}\n`
      );
    });
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.rejectAllPending(
      new Error("LightGBM inference process closed before completing the request.")
    );

    if (!child || child.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      child.once("close", () => resolve());
      child.kill();
    });
  }
}

export function createLightgbmScorer(config: ServerConfig): LightgbmScorer {
  return new PythonLightgbmScorer(config);
}
