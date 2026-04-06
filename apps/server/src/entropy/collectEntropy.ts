import type { SeedGenerationContext, SeedProviderName } from "@tichuml/shared";
import {
  createEntropyFailureResult,
  type EntropySource
} from "./EntropySource.js";
import { createDefaultEntropyRuntime, toIsoString } from "./helpers.js";
import { createAnuEntropySource } from "./sources/anu.js";
import { createAtnfEntropySource } from "./sources/atnf.js";
import { createBlitzortungEntropySource } from "./sources/blitzortung.js";
import { createLocalCryptoEntropySource } from "./sources/local-crypto.js";
import { createNasaLambdaEntropySource } from "./sources/nasa-lambda.js";
import { createNistBeaconEntropySource } from "./sources/nist.js";
import { createNoaaSwpcEntropySource } from "./sources/noaa.js";
import { createQrandomEntropySource } from "./sources/qrandom.js";
import { createRandomOrgEntropySource } from "./sources/random-org.js";
import { createUsgsEntropySource } from "./sources/usgs.js";
import type { EntropyCollectionOptions, EntropyCollectionResult } from "./types.js";

const DEFAULT_GLOBAL_BUDGET_MS = 6500;
const DEFAULT_REMOTE_MAX_ATTEMPTS = 2;
const DEFAULT_LOCAL_MAX_ATTEMPTS = 1;

function createSeedContext(config: {
  roundIndex: number;
  gameId?: string;
  unixTimeMs?: number;
  randomUUID: () => string;
}): SeedGenerationContext {
  const unixTimeMs = config.unixTimeMs ?? Date.now();
  return {
    gameId: config.gameId ?? config.randomUUID(),
    roundIndex: config.roundIndex,
    createdAt: new Date(unixTimeMs).toISOString(),
    unixTimeMs
  };
}

function buildEntropySources(config: {
  includeBlitzortung: boolean;
  blitzortungUrl?: string | null | undefined;
}) {
  const orderedSources: EntropySource[] = [
    createQrandomEntropySource(),
    createAnuEntropySource(),
    createNistBeaconEntropySource(),
    createRandomOrgEntropySource(),
    createNoaaSwpcEntropySource(),
    createUsgsEntropySource(),
    createAtnfEntropySource(),
    createNasaLambdaEntropySource()
  ];

  if (config.includeBlitzortung && config.blitzortungUrl) {
    orderedSources.push(createBlitzortungEntropySource(config.blitzortungUrl));
  }

  orderedSources.push(createLocalCryptoEntropySource());
  return orderedSources;
}

function isAbortLikeError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "timeout" ||
      error.message === "global_budget_exhausted")
  );
}

function getSourceMaxAttempts(config: {
  source: EntropySource;
  sourceOverrides?: EntropyCollectionOptions["sourceOverrides"];
}) {
  return (
    config.sourceOverrides?.[config.source.sourceId]?.maxAttempts ??
    (config.source.sourceId === "local_crypto"
      ? DEFAULT_LOCAL_MAX_ATTEMPTS
      : DEFAULT_REMOTE_MAX_ATTEMPTS)
  );
}

function createCombinedSignal(signals: AbortSignal[]) {
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();

  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abort(signal);
      return {
        signal: controller.signal,
        dispose() {}
      };
    }

    const listener = () => abort(signal);
    listeners.set(signal, listener);
    signal.addEventListener("abort", listener, { once: true });
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener("abort", listener);
      }
    }
  };
}

async function runEntropySource(config: {
  source: EntropySource;
  context: SeedGenerationContext;
  runtime: ReturnType<typeof createDefaultEntropyRuntime>;
  globalSignal: AbortSignal;
  sourceOverrides?: EntropyCollectionOptions["sourceOverrides"];
}) {
  const { source, context, runtime } = config;
  const timeoutMs =
    config.sourceOverrides?.[source.sourceId]?.timeoutMs ??
    source.defaultTimeoutMs;
  const maxResponseBytes =
    config.sourceOverrides?.[source.sourceId]?.maxResponseBytes ??
    source.defaultMaxResponseBytes;
  const maxAttempts = getSourceMaxAttempts({
    source,
    sourceOverrides: config.sourceOverrides
  });
  const startedAt = runtime.now();
  let lastError = "Unknown entropy source error.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(new Error("timeout")),
      timeoutMs
    );
    const combined = createCombinedSignal([
      config.globalSignal,
      timeoutController.signal
    ]);

    try {
      runtime.logger.info("[entropy] source attempt started", {
        sourceId: source.sourceId,
        attempt,
        maxAttempts,
        timeoutMs,
        maxResponseBytes
      });

      const result = await source.collect({
        context,
        runtime,
        signal: combined.signal,
        timeoutMs,
        maxResponseBytes
      });
      result.durationMs = runtime.now().getTime() - startedAt.getTime();
      result.meta = {
        ...(result.meta && typeof result.meta === "object" && !Array.isArray(result.meta)
          ? result.meta
          : { value: result.meta }),
        attempts: attempt,
        timeoutMs,
        maxResponseBytes
      };
      runtime.logger.info("[entropy] source succeeded", {
        sourceId: source.sourceId,
        attempt,
        maxAttempts,
        durationMs: result.durationMs,
        bytesLength: result.bytes.byteLength,
        previewValue: result.previewValue
      });
      return result;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown entropy source error.";
      const durationMs = runtime.now().getTime() - startedAt.getTime();
      const isLastAttempt = attempt >= maxAttempts || config.globalSignal.aborted;
      const abortLike = isAbortLikeError(error);
      const willRetry = !isLastAttempt && !abortLike;

      runtime.logger.warn(
        willRetry
          ? "[entropy] source failed, retrying"
          : abortLike
            ? "[entropy] source unavailable"
            : "[entropy] source failed",
        {
          sourceId: source.sourceId,
          attempt,
          maxAttempts,
          durationMs,
          error: lastError
        }
      );

      if (!willRetry) {
        return createEntropyFailureResult({
          sourceId: source.sourceId,
          displayName: source.displayName,
          qualityWeight: source.qualityWeight,
          durationMs,
          error: lastError,
          meta: {
            attempts: attempt,
            timeoutMs,
            maxResponseBytes,
            aborted: abortLike
          }
        });
      }
    } finally {
      clearTimeout(timeoutId);
      combined.dispose();
    }
  }

  return createEntropyFailureResult({
    sourceId: source.sourceId,
    displayName: source.displayName,
    qualityWeight: source.qualityWeight,
    durationMs: runtime.now().getTime() - startedAt.getTime(),
    error: lastError,
    meta: {
      attempts: maxAttempts,
      timeoutMs,
      maxResponseBytes
    }
  });
}

export async function collectEntropy(
  options: EntropyCollectionOptions
): Promise<EntropyCollectionResult> {
  const runtime = createDefaultEntropyRuntime(options.runtime);
  const context = createSeedContext(
    options.gameId !== undefined || options.unixTimeMs !== undefined
      ? {
          roundIndex: options.roundIndex,
          ...(options.gameId !== undefined ? { gameId: options.gameId } : {}),
          ...(options.unixTimeMs !== undefined
            ? { unixTimeMs: options.unixTimeMs }
            : {}),
          randomUUID: runtime.randomUUID
        }
      : {
          roundIndex: options.roundIndex,
          randomUUID: runtime.randomUUID
        }
  );
  const allSources = buildEntropySources({
    includeBlitzortung: options.includeBlitzortung ?? false,
    ...(options.blitzortungUrl !== undefined
      ? { blitzortungUrl: options.blitzortungUrl }
      : {})
  });
  const enabledSet = options.enabledSourceIds
    ? new Set<SeedProviderName>(options.enabledSourceIds)
    : null;
  const sources = enabledSet
    ? allSources.filter(
        (source) =>
          source.sourceId === "local_crypto" || enabledSet.has(source.sourceId)
      )
    : allSources;
  const globalController = new AbortController();
  const globalBudgetMs = options.globalBudgetMs ?? DEFAULT_GLOBAL_BUDGET_MS;
  const globalTimeoutId = setTimeout(
    () => globalController.abort(new Error("global_budget_exhausted")),
    globalBudgetMs
  );

  runtime.logger.info("[entropy] collection started", {
    gameId: context.gameId,
    roundIndex: context.roundIndex,
    unixTimeMs: context.unixTimeMs,
    sourceIds: sources.map((source) => source.sourceId)
  });

  try {
    const settled = await Promise.allSettled(
      sources.map((source) =>
        runEntropySource({
          source,
          context,
          runtime,
          globalSignal: globalController.signal,
          sourceOverrides: options.sourceOverrides
        })
      )
    );
    const results = settled.map((entry, index) => {
      if (entry.status === "fulfilled") {
        return entry.value;
      }

      return createEntropyFailureResult({
        sourceId: sources[index]!.sourceId,
        displayName: sources[index]!.displayName,
        qualityWeight: sources[index]!.qualityWeight,
        durationMs: 0,
        error:
          entry.reason instanceof Error
            ? entry.reason.message
            : "Unhandled entropy source failure.",
        meta: {
          unhandled: true,
          failedAt: toIsoString(runtime.now())
        }
      });
    });
    const localSource = results.find(
      (result) => result.sourceId === "local_crypto" && result.ok
    );

    if (!localSource) {
      throw new Error("Local cryptographic entropy source failed.");
    }

    runtime.logger.info("[entropy] collection complete", {
      gameId: context.gameId,
      attempted: results.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length
    });

    return {
      context,
      sources: results,
      localCrypto64: localSource.bytes.subarray(0, 64)
    };
  } finally {
    clearTimeout(globalTimeoutId);
  }
}
