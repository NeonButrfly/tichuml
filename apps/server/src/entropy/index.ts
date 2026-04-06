import type { SeedDebugSnapshot } from "@tichuml/shared";
import { collectEntropy } from "./collectEntropy.js";
import { combineEntropy } from "./combineEntropy.js";
import type {
  EntropyCollectionOptions,
  EntropyGenerationApiResult,
  EntropyGenerationResult
} from "./types.js";

export * from "./EntropySource.js";
export * from "./combineEntropy.js";
export * from "./collectEntropy.js";
export * from "./types.js";

export async function generateEntropySeed(
  options: EntropyCollectionOptions
): Promise<EntropyGenerationResult> {
  const collection = await collectEntropy(options);
  return combineEntropy(collection);
}

export function serializeEntropyGenerationResult(
  result: EntropyGenerationResult
): EntropyGenerationApiResult {
  const debugSnapshot: SeedDebugSnapshot = {
    gameId: result.gameId,
    unixTimeMs: result.unixTimeMs,
    finalSeedHex: result.finalSeedHex,
    finalSeedBase64: result.finalSeedBase64,
    shuffleSeedHex: result.shuffleSeedHex,
    auditHashHex: result.auditHashHex,
    sources: result.provenance.sources,
    sourceSummary: result.sourceSummary,
    provenance: result.provenance
  };
  return debugSnapshot;
}
