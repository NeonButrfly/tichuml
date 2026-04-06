import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchJson,
  summarizeSourcePreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const USGS_EARTHQUAKE_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

export function createUsgsEntropySource(): EntropySource {
  return {
    sourceId: "usgs_earthquake",
    displayName: "USGS Earthquake Feed",
    qualityWeight: 70,
    defaultTimeoutMs: 5000,
    defaultMaxResponseBytes: 64 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { json } = await fetchJson({
        url: USGS_EARTHQUAKE_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });

      const payload = (json ?? {}) as Record<string, unknown>;
      const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
      const features = Array.isArray(payload.features) ? payload.features : [];
      const boundedFeatures = features.slice(0, 8).map((entry) => {
        const feature = entry as Record<string, unknown>;
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const geometry = (feature.geometry ?? {}) as Record<string, unknown>;
        const coordinates = Array.isArray(geometry.coordinates)
          ? geometry.coordinates.slice(0, 3).map((value) => Number(value ?? 0))
          : [];

        return {
          id: typeof feature.id === "string" ? feature.id : null,
          mag: typeof props.mag === "number" ? props.mag : null,
          time: typeof props.time === "number" ? props.time : null,
          place: typeof props.place === "string" ? props.place : null,
          coordinates
        };
      });

      if (boundedFeatures.length === 0) {
        throw new Error("USGS earthquake feed returned no features.");
      }

      const importantData = {
        events: boundedFeatures
      };
      const bytes = Buffer.from(JSON.stringify(importantData), "utf8");

      return createEntropySuccessResult({
        sourceId: "usgs_earthquake",
        displayName: "USGS Earthquake Feed",
        qualityWeight: 70,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData,
        meta: {
          endpoint: USGS_EARTHQUAKE_URL,
          title: typeof metadata.title === "string" ? metadata.title : null,
          generated:
            typeof metadata.generated === "number" ? metadata.generated : null,
          count: typeof metadata.count === "number" ? metadata.count : null
        },
        previewValue: summarizeSourcePreview(importantData, bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
