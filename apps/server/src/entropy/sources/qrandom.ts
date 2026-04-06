import crypto from "node:crypto";
import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchBuffer,
  fetchJson,
  formatHexPreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const QRANDOM_BINARY_URL = "https://qrandom.io/api/random/binary?bytes=64";
const QRANDOM_INTS_URL =
  "https://qrandom.io/api/random/ints?min=0&max=255&n=64";

function digestText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function createQrandomEntropySource(): EntropySource {
  return {
    sourceId: "qrandom_io",
    displayName: "qrandom.io Quantum RNG",
    qualityWeight: 100,
    defaultTimeoutMs: 3000,
    defaultMaxResponseBytes: 24 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      let bytes: Buffer;
      let payload: Record<string, unknown>;
      let sourceMode: "binary" | "ints";
      let binaryUrl: string | null = null;

      try {
        const binaryResult = await fetchJson({
          url: QRANDOM_BINARY_URL,
          fetchImpl: request.runtime.fetch,
          signal: request.signal,
          maxBytes: request.maxResponseBytes,
          headers: {
            Accept: "application/json"
          }
        });
        payload = (binaryResult.json ?? {}) as Record<string, unknown>;
        binaryUrl =
          typeof payload.binaryURL === "string" ? payload.binaryURL : null;
        if (!binaryUrl) {
          throw new Error("qrandom.io did not return a binaryURL.");
        }

        const { body } = await fetchBuffer({
          url: binaryUrl,
          fetchImpl: request.runtime.fetch,
          signal: request.signal,
          maxBytes: 256
        });

        if (body.byteLength < 64) {
          throw new Error("qrandom.io returned fewer than 64 bytes.");
        }

        bytes = body.subarray(0, 64);
        sourceMode = "binary";
      } catch (error) {
        request.runtime.logger.warn("[entropy] qrandom binary endpoint failed", {
          error: error instanceof Error ? error.message : "Unknown qrandom error."
        });

        const intsResult = await fetchJson({
          url: QRANDOM_INTS_URL,
          fetchImpl: request.runtime.fetch,
          signal: request.signal,
          maxBytes: request.maxResponseBytes,
          headers: {
            Accept: "application/json"
          }
        });
        payload = (intsResult.json ?? {}) as Record<string, unknown>;
        const numbers = Array.isArray(payload.numbers)
          ? payload.numbers
          : Array.isArray(payload.data)
            ? payload.data
            : null;
        if (!numbers || numbers.length < 64) {
          throw new Error("qrandom.io integer fallback did not return 64 bytes.");
        }

        bytes = Buffer.from(
          numbers.slice(0, 64).map((entry) => {
            if (
              typeof entry !== "number" ||
              !Number.isInteger(entry) ||
              entry < 0 ||
              entry > 255
            ) {
              throw new Error("qrandom.io integer fallback returned a non-byte.");
            }

            return entry;
          })
        );
        sourceMode = "ints";
      }

      return createEntropySuccessResult({
        sourceId: "qrandom_io",
        displayName: "qrandom.io Quantum RNG",
        qualityWeight: 100,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes,
        importantData: bytes.toString("hex"),
        meta: {
          id: typeof payload.id === "string" ? payload.id : null,
          timestamp:
            typeof payload.timestamp === "string" ? payload.timestamp : null,
          elapsedTime:
            typeof payload.elapsedTime === "number" ? payload.elapsedTime : null,
          resultType:
            typeof payload.resultType === "string" ? payload.resultType : null,
          endpointMode: sourceMode,
          fallbackEndpoint: sourceMode === "ints" ? QRANDOM_INTS_URL : null,
          binaryURL: binaryUrl,
          messageHashHex: digestText(
            typeof payload.message === "string" ? payload.message : null
          ),
          signatureHashHex: digestText(
            typeof payload.signature === "string" ? payload.signature : null
          )
        },
        previewValue: formatHexPreview(bytes),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
