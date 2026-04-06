import crypto from "node:crypto";
import type { SeedEntropySourceRecord, SeedProvenance } from "@tichuml/shared";
import type {
  EntropyCollectionResult,
  EntropyGenerationResult,
  EntropySourceResult
} from "./types.js";

const DOMAIN_TAG = "TICHU_ENTROPY_V1";
const SHUFFLE_SALT = "tichu-shuffle";
const MINIMUM_SUCCESSFUL_SOURCE_COUNT = 1;

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const sortedEntries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  );

  return `{${sortedEntries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function sha3_512(buffer: Buffer): Buffer {
  return crypto.createHash("sha3-512").update(buffer).digest();
}

function sha256(buffer: Buffer): Buffer {
  return crypto.createHash("sha256").update(buffer).digest();
}

function toHex(buffer: Buffer): string {
  return buffer.toString("hex");
}

function encodeUint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function encodeUint64(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeBigUInt64BE(BigInt(value), 0);
  return buffer;
}

function encodeText(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

function normalizeContribution(
  source: EntropySourceResult
): {
  sourceRecord: SeedEntropySourceRecord;
  normalizedHash: Buffer | null;
  canonicalPayloadHash: Buffer | null;
} {
  if (!source.ok) {
    return {
      sourceRecord: {
        sourceId: source.sourceId,
        displayName: source.displayName,
        ok: false,
        qualityWeight: source.qualityWeight,
        durationMs: source.durationMs,
        previewValue: source.previewValue ?? null,
        normalizedHashHex: null,
        canonicalPayloadHashHex: null,
        meta: source.meta,
        error: source.error ?? "Unknown entropy source failure.",
        bytesLength: source.bytes.byteLength,
        fetchedAt: source.fetchedAt ?? null,
        usedInFinalSeed: false
      },
      normalizedHash: null,
      canonicalPayloadHash: null
    };
  }

  const canonicalObject = {
    sourceId: source.sourceId,
    fetchedAt: source.fetchedAt ?? null,
    importantData: source.importantData,
    meta: source.meta
  };
  const canonicalBuffer = Buffer.from(
    stableStringify(canonicalObject),
    "utf8"
  );
  const canonicalPayloadHash = sha256(canonicalBuffer);
  const normalizedHash = sha3_512(canonicalBuffer);

  return {
    sourceRecord: {
      sourceId: source.sourceId,
      displayName: source.displayName,
      ok: true,
      qualityWeight: source.qualityWeight,
      durationMs: source.durationMs,
      previewValue: source.previewValue ?? null,
      normalizedHashHex: toHex(normalizedHash),
      canonicalPayloadHashHex: toHex(canonicalPayloadHash),
      meta: source.meta,
      error: null,
      bytesLength: source.bytes.byteLength,
      fetchedAt: source.fetchedAt ?? null,
      usedInFinalSeed: true
    },
    normalizedHash,
    canonicalPayloadHash
  };
}

function buildCombineInput(config: {
  gameId: string;
  unixTimeMs: number;
  successfulSources: Array<{
    sourceId: SeedEntropySourceRecord["sourceId"];
    qualityWeight: number;
    normalizedHash: Buffer;
  }>;
  localCrypto64: Buffer;
}) {
  const sourceParts = config.successfulSources.flatMap((source) => {
    const sourceId = encodeText(source.sourceId);
    return [
      encodeUint32(sourceId.byteLength),
      sourceId,
      encodeUint32(source.qualityWeight),
      source.normalizedHash
    ];
  });

  const gameId = encodeText(config.gameId);
  return Buffer.concat([
    encodeText(DOMAIN_TAG),
    encodeUint32(gameId.byteLength),
    gameId,
    encodeUint64(config.unixTimeMs),
    encodeUint32(config.successfulSources.length),
    ...sourceParts,
    config.localCrypto64
  ]);
}

export function combineEntropy(
  collection: EntropyCollectionResult
): EntropyGenerationResult {
  if (collection.localCrypto64.byteLength !== 64) {
    throw new Error("localCrypto64 must be exactly 64 bytes.");
  }

  const normalized = collection.sources.map((source) =>
    normalizeContribution(source)
  );
  const successfulContributions = normalized
    .map((entry, index) => ({ entry, source: collection.sources[index]! }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: typeof normalized[number];
        source: EntropySourceResult;
      } => Boolean(candidate.entry.normalizedHash)
    )
    .sort((left, right) => left.source.sourceId.localeCompare(right.source.sourceId))
    .map(({ entry, source }) => ({
      sourceId: source.sourceId,
      qualityWeight: source.qualityWeight,
      normalizedHash: entry.normalizedHash!,
      canonicalPayloadHash: entry.canonicalPayloadHash!
    }));

  if (successfulContributions.length === 0) {
    throw new Error("Entropy combination requires at least one successful source.");
  }

  const combineInput = buildCombineInput({
    gameId: collection.context.gameId,
    unixTimeMs: collection.context.unixTimeMs,
    successfulSources: successfulContributions,
    localCrypto64: collection.localCrypto64
  });
  const finalSeed = sha3_512(combineInput);
  const shuffleSeed = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      finalSeed,
      Buffer.from(SHUFFLE_SALT, "utf8"),
      Buffer.from(collection.context.gameId, "utf8"),
      32
    )
  );
  const auditHashHex = toHex(
    sha256(
      Buffer.concat([
        ...successfulContributions.map((source) => source.canonicalPayloadHash),
        finalSeed
      ])
    )
  );
  const sources = normalized.map((entry) => entry.sourceRecord);
  const successfulProviders = sources
    .filter((source) => source.ok)
    .map((source) => source.sourceId);
  const primaryProvider =
    sources.find((source) => source.ok)?.sourceId ?? "local_crypto";
  const localFallbackUsed = successfulProviders.every(
    (sourceId) => sourceId === "local_crypto"
  );
  const finalSeedHex = toHex(finalSeed);
  const provenance: SeedProvenance = {
    version: 2,
    context: collection.context,
    attemptedProviders: sources.map((source) => source.sourceId),
    successfulProviders,
    primaryProvider,
    localFallbackUsed,
    finalSeed: finalSeedHex,
    finalSeedHex,
    finalSeedBase64: finalSeed.toString("base64"),
    shuffleSeedHex: toHex(shuffleSeed),
    auditHashHex,
    sourceSummary: {
      attempted: sources.length,
      succeeded: successfulProviders.length,
      failed: sources.length - successfulProviders.length,
      minimumRequired: MINIMUM_SUCCESSFUL_SOURCE_COUNT,
      metMinimum: successfulProviders.length >= MINIMUM_SUCCESSFUL_SOURCE_COUNT
    },
    derivation: {
      schemaVersion: 1,
      domainTag: "TICHU_ENTROPY_V1",
      finalSeedAlgorithm: "SHA3-512",
      shuffleSeedAlgorithm: "HKDF-SHA256",
      auditAlgorithm: "SHA-256",
      sortedSourceIds: successfulContributions.map((source) => source.sourceId),
      canonicalPayloadHashes: successfulContributions.map((source) =>
        toHex(source.canonicalPayloadHash)
      ),
      localCryptoIncluded: true
    },
    sources
  };

  return {
    finalSeed,
    finalSeedHex,
    finalSeedBase64: provenance.finalSeedBase64,
    shuffleSeed,
    shuffleSeedHex: provenance.shuffleSeedHex,
    auditHashHex,
    gameId: collection.context.gameId,
    unixTimeMs: collection.context.unixTimeMs,
    sources: collection.sources.map((source, index) => ({
      ...source,
      normalizedHashHex: normalized[index]?.sourceRecord.normalizedHashHex ?? null,
      canonicalPayloadHashHex:
        normalized[index]?.sourceRecord.canonicalPayloadHashHex ?? null,
      usedInFinalSeed: normalized[index]?.sourceRecord.usedInFinalSeed ?? false
    })),
    sourceSummary: provenance.sourceSummary,
    provenance
  };
}
