import { describe, expect, it } from "vitest";
import {
  buildTrainingBatchId,
  buildTrainingGameId,
  buildTrainingGameIdPrefix,
  buildTrainingRunId,
  buildTrainingSeedHash,
  buildTrainingSessionName,
  deriveTrainingBatchSeed,
  formatTrainingRunTimestamp,
  sanitizeSessionName
} from "@tichuml/shared";

describe("training run helpers", () => {
  it("builds stable run ids, session names, and scoped game id prefixes", () => {
    const startedAt = new Date("2026-05-03T18:44:55.000Z");
    const runId = buildTrainingRunId({
      seed: "a1b2c3d4feedbeef",
      startedAt,
      zone: "utc"
    });
    const batchId = buildTrainingBatchId(1);
    const gameIdPrefix = buildTrainingGameIdPrefix({ runId, batchId });

    expect(formatTrainingRunTimestamp(startedAt, "utc")).toBe(
      "20260503-184455"
    );
    expect(runId).toBe("training-20260503-184455-a1b2c3d4");
    expect(buildTrainingSessionName(runId)).toBe(
      "tichuml-training-20260503-184455-a1b2c3d4"
    );
    expect(batchId).toBe("batch-000001");
    expect(gameIdPrefix).toBe(
      "selfplay-training-20260503-184455-a1b2c3d4-batch-000001"
    );
    expect(
      buildTrainingGameId({ gameIdPrefix, gameNumber: 42 })
    ).toBe(
      "selfplay-training-20260503-184455-a1b2c3d4-batch-000001-game-000042"
    );
  });

  it("derives deterministic batch seeds and stable seed hashes", () => {
    const batchOne = deriveTrainingBatchSeed({
      resolvedRunSeed: "feedfacecafebeef",
      derivationNamespace: "training-data",
      batchId: "batch-000001"
    });
    const batchTwo = deriveTrainingBatchSeed({
      resolvedRunSeed: "feedfacecafebeef",
      derivationNamespace: "training-data",
      batchId: "batch-000002"
    });

    expect(batchOne).toHaveLength(32);
    expect(batchOne).not.toBe(batchTwo);
    expect(buildTrainingSeedHash("feedfacecafebeef")).toHaveLength(64);
  });

  it("sanitizes user session names into safe readable tokens", () => {
    expect(sanitizeSessionName("My Training / Run")).toBe("my-training-run");
    expect(() => sanitizeSessionName("///")).toThrow(/Session name/);
  });
});
