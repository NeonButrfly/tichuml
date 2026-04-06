import type { SeedJsonValue, SeedProviderName } from "@tichuml/shared";
import type { EntropySourceResult } from "./types.js";

export type { EntropySource, EntropySourceRequest } from "./types.js";

export function createEntropyFailureResult(config: {
  sourceId: SeedProviderName;
  displayName: string;
  qualityWeight: number;
  durationMs: number;
  error: string;
  meta?: SeedJsonValue;
}): EntropySourceResult {
  return {
    sourceId: config.sourceId,
    displayName: config.displayName,
    ok: false,
    bytes: Buffer.alloc(0),
    importantData: null,
    meta: config.meta ?? null,
    error: config.error,
    qualityWeight: config.qualityWeight,
    durationMs: config.durationMs,
    previewValue: null,
    normalizedHashHex: null,
    canonicalPayloadHashHex: null,
    fetchedAt: null,
    usedInFinalSeed: false
  };
}

export function createEntropySuccessResult(config: {
  sourceId: SeedProviderName;
  displayName: string;
  qualityWeight: number;
  durationMs: number;
  bytes: Buffer;
  importantData: SeedJsonValue;
  meta: SeedJsonValue;
  previewValue?: string | null;
  fetchedAt?: string | null;
}): EntropySourceResult {
  return {
    sourceId: config.sourceId,
    displayName: config.displayName,
    ok: true,
    bytes: config.bytes,
    importantData: config.importantData,
    meta: config.meta,
    error: null,
    qualityWeight: config.qualityWeight,
    durationMs: config.durationMs,
    previewValue: config.previewValue ?? null,
    normalizedHashHex: null,
    canonicalPayloadHashHex: null,
    fetchedAt: config.fetchedAt ?? null,
    usedInFinalSeed: false
  };
}
