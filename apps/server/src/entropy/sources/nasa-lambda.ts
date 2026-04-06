import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchBuffer,
  summarizeSourcePreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const NASA_LAMBDA_URL = "https://lambda.gsfc.nasa.gov/";

function matchText(html: string, expression: RegExp): string | null {
  return html.match(expression)?.[1]?.trim() ?? null;
}

function matchLinks(html: string): string[] {
  return [...html.matchAll(/<a href=['"]([^'"]+)['"]/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
}

export function createNasaLambdaEntropySource(): EntropySource {
  return {
    sourceId: "nasa_lambda",
    displayName: "NASA LAMBDA Archive",
    qualityWeight: 40,
    defaultTimeoutMs: 5000,
    defaultMaxResponseBytes: 96 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { body } = await fetchBuffer({
        url: NASA_LAMBDA_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });
      const html = body.toString("utf8");

      const title = matchText(html, /<title>([^<]+)<\/title>/i);
      const description = matchText(
        html,
        /<meta\s+name=['"]description['"]\s+content=['"]([^'"]+)['"]/i
      );
      const links = matchLinks(html);

      if (!title || links.length === 0) {
        throw new Error("NASA LAMBDA returned an unexpected page shape.");
      }

      const importantData = {
        title,
        featuredLinks: links
      };
      const bytes = Buffer.from(JSON.stringify(importantData), "utf8");

      return createEntropySuccessResult({
        sourceId: "nasa_lambda",
        displayName: "NASA LAMBDA Archive",
        qualityWeight: 40,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData,
        meta: {
          endpoint: NASA_LAMBDA_URL,
          description
        },
        previewValue: summarizeSourcePreview(importantData, bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
