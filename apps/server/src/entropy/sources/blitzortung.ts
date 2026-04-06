import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchBuffer,
  formatHexPreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

export function createBlitzortungEntropySource(
  endpointUrl: string
): EntropySource {
  return {
    sourceId: "blitzortung",
    displayName: "Blitzortung Lightning Feed",
    qualityWeight: 70,
    defaultTimeoutMs: 1800,
    defaultMaxResponseBytes: 32 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { body } = await fetchBuffer({
        url: endpointUrl,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });

      if (body.byteLength === 0) {
        throw new Error("Blitzortung feed returned an empty response.");
      }

      return createEntropySuccessResult({
        sourceId: "blitzortung",
        displayName: "Blitzortung Lightning Feed",
        qualityWeight: 70,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes: body,
        importantData: body.toString("base64"),
        meta: {
          endpoint: endpointUrl,
          byteLength: body.byteLength
        },
        previewValue: formatHexPreview(body),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
