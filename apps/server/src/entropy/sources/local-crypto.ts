import { createEntropySuccessResult } from "../EntropySource.js";
import { formatHexPreview, toIsoString } from "../helpers.js";
import type { EntropySource } from "../types.js";

export function createLocalCryptoEntropySource(): EntropySource {
  return {
    sourceId: "local_crypto",
    displayName: "Local Cryptographic RNG",
    qualityWeight: 100,
    defaultTimeoutMs: 250,
    defaultMaxResponseBytes: 128,
    async collect(request) {
      const startedAt = request.runtime.now();
      const bytes = request.runtime.randomBytes(64);

      return createEntropySuccessResult({
        sourceId: "local_crypto",
        displayName: "Local Cryptographic RNG",
        qualityWeight: 100,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData: bytes.toString("hex"),
        meta: {
          source: "crypto.randomBytes",
          byteLength: bytes.byteLength
        },
        previewValue: formatHexPreview(bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
