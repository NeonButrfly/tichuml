import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchJson,
  summarizeSourcePreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const NOAA_SWPC_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-6-hour.json";

export function createNoaaSwpcEntropySource(): EntropySource {
  return {
    sourceId: "noaa_swpc",
    displayName: "NOAA SWPC Feed",
    qualityWeight: 70,
    defaultTimeoutMs: 5000,
    defaultMaxResponseBytes: 64 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { json } = await fetchJson({
        url: NOAA_SWPC_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });

      if (!Array.isArray(json) || json.length < 2) {
        throw new Error("NOAA SWPC returned an unexpected payload.");
      }

      const rows = json as unknown[][];
      const header = Array.isArray(rows[0]) ? rows[0].map(String) : [];
      const recentRows = rows
        .slice(-8)
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => ({
          timeTag: String(row[0] ?? ""),
          density: Number(row[1] ?? 0),
          speed: Number(row[2] ?? 0),
          temperature: Number(row[3] ?? 0)
        }));

      const importantData = {
        header,
        recentRows
      };
      const bytes = Buffer.from(JSON.stringify(importantData), "utf8");

      return createEntropySuccessResult({
        sourceId: "noaa_swpc",
        displayName: "NOAA SWPC Feed",
        qualityWeight: 70,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData,
        meta: {
          endpoint: NOAA_SWPC_URL,
          feedName: "solar-wind/plasma-6-hour",
          rowCount: rows.length - 1
        },
        previewValue: summarizeSourcePreview(importantData, bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
