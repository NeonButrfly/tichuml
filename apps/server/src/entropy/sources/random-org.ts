import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchBuffer,
  summarizeSourcePreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const RANDOM_ORG_URL =
  "https://www.random.org/strings/?num=4&len=16&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain&rnd=new";

export function createRandomOrgEntropySource(): EntropySource {
  return {
    sourceId: "random_org",
    displayName: "RANDOM.ORG HTTP Interface",
    qualityWeight: 90,
    defaultTimeoutMs: 2800,
    defaultMaxResponseBytes: 8 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { body } = await fetchBuffer({
        url: RANDOM_ORG_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });
      const text = body.toString("utf8").trim();
      if (text.startsWith("Error:")) {
        throw new Error(text);
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        throw new Error("RANDOM.ORG returned no strings.");
      }

      const combined = Buffer.from(lines.join(""), "utf8");
      return createEntropySuccessResult({
        sourceId: "random_org",
        displayName: "RANDOM.ORG HTTP Interface",
        qualityWeight: 90,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes: combined,
        importantData: lines,
        meta: {
          endpoint: RANDOM_ORG_URL,
          lineCount: lines.length,
          totalCharacters: lines.join("").length
        },
        previewValue: summarizeSourcePreview(lines, combined),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
