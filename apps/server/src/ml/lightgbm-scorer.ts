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
  stateFeatures: TacticalFeatureSnapshot | null;
  candidateFeatures: Array<CandidateActionFeatureSnapshot | null>;
};

export type LightgbmScoreResult = {
  scores: number[];
  modelMetadata: JsonObject;
  runtimeMetadata: JsonObject;
};

export type LightgbmFeatureRequirements = {
  featureNames: string[] | null;
  featureProfile: string | null;
  modelPhase: string | null;
};

export interface LightgbmScorer {
  score(request: LightgbmScoreRequest): Promise<LightgbmScoreResult>;
  close(): Promise<void>;
  warmup?(): Promise<void>;
  getFeatureRequirements?(): LightgbmFeatureRequirements | null;
}

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

function isJsonDelimiter(character: string | undefined): boolean {
  return (
    character === undefined ||
    character === "," ||
    character === "}" ||
    character === "]" ||
    /\s/.test(character)
  );
}

export function parseJsonObjectAllowingNonFiniteLiterals(
  line: string
): Record<string, unknown> {
  let sanitized = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inString) {
      sanitized += character;
      if (escaping) {
        escaping = false;
      } else if (character === "\\") {
        escaping = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      sanitized += character;
      continue;
    }

    if (line.startsWith("-Infinity", index) && isJsonDelimiter(line[index + 9])) {
      sanitized += "null";
      index += 8;
      continue;
    }

    if (line.startsWith("Infinity", index) && isJsonDelimiter(line[index + 8])) {
      sanitized += "null";
      index += 7;
      continue;
    }

    if (line.startsWith("NaN", index) && isJsonDelimiter(line[index + 3])) {
      sanitized += "null";
      index += 2;
      continue;
    }

    sanitized += character;
  }

  return JSON.parse(sanitized) as Record<string, unknown>;
}

export class PythonLightgbmScorer implements LightgbmScorer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestSequence = 0;
  private readonly featureRequirements: LightgbmFeatureRequirements | null;

  constructor(private readonly config: ServerConfig) {
    this.featureRequirements = loadFeatureRequirements(config.lightgbmModelMetaPath);
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private failProtocol(error: Error): void {
    const child = this.child;
    this.rejectAllPending(error);
    if (child && !child.killed) {
      child.kill();
    }
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
      let payload: Record<string, unknown>;
      try {
        payload = parseJsonObjectAllowingNonFiniteLiterals(line);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.failProtocol(
          new Error(`LightGBM inference returned invalid JSON: ${detail}`)
        );
        return;
      }
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

      pending.resolve(payload);
    });

    this.child = child;
    return child;
  }

  private async sendProtocolRequest(
    payload: Record<string, unknown>,
    timeoutMs = 15_000
  ): Promise<Record<string, unknown>> {
    const child = this.ensureProcess();
    const requestId = `score-${Date.now()}-${this.requestSequence++}`;

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`LightGBM inference timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timeout });
      child.stdin.write(
        `${JSON.stringify({
          id: requestId,
          ...payload
        })}\n`
      );
    });
  }

  private async sendScoreRequest(
    request: LightgbmScoreRequest
  ): Promise<LightgbmScoreResult> {
    const payload = await this.sendProtocolRequest({
      state_raw: request.stateRaw,
      actor_seat: request.actorSeat,
      phase: request.phase,
      legal_actions: request.legalActions,
      state_features: request.stateFeatures,
      candidate_features: request.candidateFeatures
    });

    if (!Array.isArray(payload.scores)) {
      throw new Error("LightGBM inference returned a malformed score payload.");
    }

    const parsedScores = payload.scores.map((value) =>
      typeof value === "number" ? value : Number.NaN
    );
    if (parsedScores.some((value) => !Number.isFinite(value))) {
      throw new Error("LightGBM inference returned non-finite candidate scores.");
    }

    return {
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
    };
  }

  async score(request: LightgbmScoreRequest): Promise<LightgbmScoreResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.sendScoreRequest(request);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async warmup(): Promise<void> {
    const payload = await this.sendProtocolRequest({ kind: "ping" });
    if (payload.ready !== true) {
      throw new Error("LightGBM inference warmup did not acknowledge readiness.");
    }
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

  getFeatureRequirements(): LightgbmFeatureRequirements | null {
    return this.featureRequirements;
  }
}

export function createLightgbmScorer(config: ServerConfig): LightgbmScorer {
  return new PythonLightgbmScorer(config);
}

function loadFeatureRequirements(
  metaPath: string
): LightgbmFeatureRequirements | null {
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(metaPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const featureNames = Array.isArray(parsed.feature_names)
      ? parsed.feature_names.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      : null;
    const featureProfile =
      typeof parsed.feature_profile === "string" &&
      parsed.feature_profile.trim().length > 0
        ? parsed.feature_profile
        : null;

    return {
      featureNames,
      featureProfile,
      modelPhase:
        typeof parsed.phase === "string" && parsed.phase.trim().length > 0
          ? parsed.phase
          : null
    };
  } catch {
    return null;
  }
}
