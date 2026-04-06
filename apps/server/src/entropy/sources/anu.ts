import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchJson,
  formatHexPreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const ANU_QRNG_URL = "https://qrng.anu.edu.au/API/jsonI.php?length=64&type=uint8";

export function createAnuEntropySource(): EntropySource {
  return {
    sourceId: "anu_qrng",
    displayName: "ANU Quantum Random Numbers",
    qualityWeight: 98,
    defaultTimeoutMs: 3000,
    defaultMaxResponseBytes: 16 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { json } = await fetchJson({
        url: ANU_QRNG_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });

      const payload = (json ?? {}) as Record<string, unknown>;
      const data = Array.isArray(payload.data) ? payload.data : null;
      if (!data || data.length < 64) {
        throw new Error("ANU QRNG did not return 64 data points.");
      }

      const bytes = Buffer.from(
        data.slice(0, 64).map((entry) => {
          if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > 255) {
            throw new Error("ANU QRNG returned a non-byte value.");
          }
          return entry;
        })
      );

      return createEntropySuccessResult({
        sourceId: "anu_qrng",
        displayName: "ANU Quantum Random Numbers",
        qualityWeight: 98,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData: bytes.toString("hex"),
        meta: {
          endpoint: ANU_QRNG_URL,
          type: typeof payload.type === "string" ? payload.type : null,
          length: typeof payload.length === "number" ? payload.length : null,
          success: payload.success === true,
          returnedCount: data.length
        },
        previewValue: formatHexPreview(bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
