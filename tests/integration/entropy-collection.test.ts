import { describe, expect, it } from "vitest";
import {
  resolveEntropySourceWithinGlobalBudget
} from "../../apps/server/src/entropy/collectEntropy";
import { createEntropySuccessResult } from "../../apps/server/src/entropy/EntropySource";
import type { EntropySource } from "../../apps/server/src/entropy/types";

const TEST_SOURCE: EntropySource = {
  sourceId: "local_crypto",
  displayName: "Local Crypto",
  qualityWeight: 1,
  defaultTimeoutMs: 10,
  defaultMaxResponseBytes: 256,
  async collect() {
    return createEntropySuccessResult({
      sourceId: "local_crypto",
      displayName: "Local Crypto",
      qualityWeight: 1,
      durationMs: 0,
      bytes: Buffer.alloc(64, 7),
      importantData: "ok",
      meta: { source: "local" }
    });
  }
};

function createRuntimeStub() {
  return {
    now: () => new Date(),
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  } as Parameters<typeof resolveEntropySourceWithinGlobalBudget>[0]["runtime"];
}

describe("resolveEntropySourceWithinGlobalBudget", () => {
  it("returns an abort failure result when a source ignores the global timeout", async () => {
    const controller = new AbortController();
    const task = new Promise<Awaited<ReturnType<EntropySource["collect"]>>>(() => {
      // Intentionally never resolves to simulate a hung remote source.
    });

    const pending = resolveEntropySourceWithinGlobalBudget({
      source: TEST_SOURCE,
      task,
      globalSignal: controller.signal,
      runtime: createRuntimeStub()
    });

    controller.abort(new Error("global_budget_exhausted"));
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error).toBe("global_budget_exhausted");
    expect(result.meta).toMatchObject({
      aborted: true,
      forcedByGlobalBudget: true
    });
  });

  it("preserves successful results that arrive before the global abort", async () => {
    const controller = new AbortController();
    const expected = createEntropySuccessResult({
      sourceId: "local_crypto",
      displayName: "Local Crypto",
      qualityWeight: 1,
      durationMs: 4,
      bytes: Buffer.alloc(64, 9),
      importantData: "fast",
      meta: { source: "local" }
    });

    const result = await resolveEntropySourceWithinGlobalBudget({
      source: TEST_SOURCE,
      task: Promise.resolve(expected),
      globalSignal: controller.signal,
      runtime: createRuntimeStub()
    });

    expect(result).toEqual(expected);
  });
});
