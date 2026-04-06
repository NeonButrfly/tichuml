import crypto from "node:crypto";
import { createEntropySuccessResult } from "../EntropySource.js";
import {
  fetchJson,
  formatHexPreview,
  toIsoString
} from "../helpers.js";
import type { EntropySource } from "../types.js";

const NIST_BEACON_URL = "https://beacon.nist.gov/beacon/2.0/pulse/last";

function hashLargeValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function createNistBeaconEntropySource(): EntropySource {
  return {
    sourceId: "nist_beacon",
    displayName: "NIST Randomness Beacon",
    qualityWeight: 95,
    defaultTimeoutMs: 2800,
    defaultMaxResponseBytes: 24 * 1024,
    async collect(request) {
      const startedAt = request.runtime.now();
      const { json } = await fetchJson({
        url: NIST_BEACON_URL,
        fetchImpl: request.runtime.fetch,
        signal: request.signal,
        maxBytes: request.maxResponseBytes
      });

      const container = (json ?? {}) as Record<string, unknown>;
      const pulse =
        (container.pulse as Record<string, unknown> | undefined) ?? container;
      const outputValue =
        typeof pulse.outputValue === "string" ? pulse.outputValue : null;
      if (!outputValue || outputValue.length < 2) {
        throw new Error("NIST Beacon did not return an outputValue.");
      }

      const bytes = Buffer.from(outputValue, "hex");
      if (bytes.byteLength === 0) {
        throw new Error("NIST Beacon outputValue was not valid hex.");
      }

      return createEntropySuccessResult({
        sourceId: "nist_beacon",
        displayName: "NIST Randomness Beacon",
        qualityWeight: 95,
        durationMs: request.runtime.now().getTime() - startedAt.getTime(),
        bytes: bytes.subarray(0, 64),
        importantData: outputValue,
        meta: {
          uri: typeof pulse.uri === "string" ? pulse.uri : null,
          version: typeof pulse.version === "string" ? pulse.version : null,
          chainIndex:
            typeof pulse.chainIndex === "number" ? pulse.chainIndex : null,
          pulseIndex:
            typeof pulse.pulseIndex === "number" ? pulse.pulseIndex : null,
          timeStamp:
            typeof pulse.timeStamp === "string" ? pulse.timeStamp : null,
          statusCode:
            typeof pulse.statusCode === "number" ? pulse.statusCode : null,
          certificateIdHashHex: hashLargeValue(
            typeof pulse.certificateId === "string" ? pulse.certificateId : null
          ),
          signatureHashHex: hashLargeValue(
            typeof pulse.signatureValue === "string"
              ? pulse.signatureValue
              : null
          )
        },
        previewValue: formatHexPreview(bytes.subarray(0, 64)),
        fetchedAt: toIsoString(request.runtime.now())
      });
    }
  };
}
