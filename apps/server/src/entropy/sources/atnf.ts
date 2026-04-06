import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchBuffer,
  summarizeSourcePreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const ATNF_PULSAR_URL = "https://www.atnf.csiro.au/research/pulsar/psrcat/";

function matchAll(text: string, expression: RegExp): string[] {
  return [...text.matchAll(expression)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function createAtnfEntropySource(): EntropySource {
  return {
    sourceId: "atnf_pulsar_catalog",
    displayName: "ATNF Pulsar Catalogue",
    qualityWeight: 60,
    defaultTimeoutMs: 5000,
    defaultMaxResponseBytes: 256 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { body } = await fetchBuffer({
        url: ATNF_PULSAR_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });
      const html = body.toString("utf8");

      const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
      const version =
        html.match(/Catalogue Version\s+([^"]+)/i)?.[1]?.trim() ?? null;
      const fieldIds = matchAll(html, /id="([A-Za-z0-9_]+)"/g)
        .filter((value) => /^[A-Z][A-Za-z0-9_]+$/.test(value))
        .slice(0, 10);

      if (!title || fieldIds.length === 0) {
        throw new Error("ATNF Pulsar Catalogue page did not expose field metadata.");
      }

      const importantData = {
        title,
        catalogueVersion: version,
        queryFields: fieldIds
      };
      const bytes = Buffer.from(JSON.stringify(importantData), "utf8");

      return createEntropySuccessResult({
        sourceId: "atnf_pulsar_catalog",
        displayName: "ATNF Pulsar Catalogue",
        qualityWeight: 60,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData,
        meta: {
          endpoint: ATNF_PULSAR_URL,
          title,
          catalogueVersion: version
        },
        previewValue: summarizeSourcePreview(importantData, bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
