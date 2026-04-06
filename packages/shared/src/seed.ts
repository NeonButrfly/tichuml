export const SEED_PROVIDER_NAMES = [
  "qrandom_io",
  "anu_qrng",
  "nist_beacon",
  "random_org",
  "noaa_swpc",
  "usgs_earthquake",
  "atnf_pulsar_catalog",
  "nasa_lambda",
  "blitzortung",
  "local_crypto"
] as const;

export type SeedProviderName = (typeof SEED_PROVIDER_NAMES)[number];

export function isSeedProviderName(value: unknown): value is SeedProviderName {
  return (
    typeof value === "string" &&
    (SEED_PROVIDER_NAMES as readonly string[]).includes(value)
  );
}

export type SeedJsonValue =
  | string
  | number
  | boolean
  | null
  | SeedJsonValue[]
  | { [key: string]: SeedJsonValue };

export type SeedGenerationContext = {
  gameId: string;
  roundIndex: number;
  createdAt: string;
  unixTimeMs: number;
};

export type SeedSourceSummary = {
  attempted: number;
  succeeded: number;
  failed: number;
  minimumRequired: number;
  metMinimum: boolean;
};

export type SeedDerivationRecord = {
  schemaVersion: 1;
  domainTag: "TICHU_ENTROPY_V1";
  finalSeedAlgorithm: "SHA3-512";
  shuffleSeedAlgorithm: "HKDF-SHA256";
  auditAlgorithm: "SHA-256";
  sortedSourceIds: SeedProviderName[];
  canonicalPayloadHashes: string[];
  localCryptoIncluded: boolean;
};

export type SeedEntropySourceRecord = {
  sourceId: SeedProviderName;
  displayName: string;
  ok: boolean;
  qualityWeight: number;
  durationMs: number;
  previewValue: string | null;
  normalizedHashHex: string | null;
  canonicalPayloadHashHex: string | null;
  meta: SeedJsonValue;
  error: string | null;
  bytesLength: number;
  fetchedAt: string | null;
  usedInFinalSeed: boolean;
};

export type SeedProvenance = {
  version: 2;
  context: SeedGenerationContext;
  attemptedProviders: SeedProviderName[];
  successfulProviders: SeedProviderName[];
  primaryProvider: SeedProviderName;
  localFallbackUsed: boolean;
  finalSeed: string;
  finalSeedHex: string;
  finalSeedBase64: string;
  shuffleSeedHex: string;
  auditHashHex: string;
  sourceSummary: SeedSourceSummary;
  derivation: SeedDerivationRecord;
  sources: SeedEntropySourceRecord[];
};

export type SeedDebugSnapshot = {
  gameId: string;
  unixTimeMs: number;
  finalSeedHex: string;
  finalSeedBase64: string;
  shuffleSeedHex: string;
  auditHashHex: string;
  sources: SeedEntropySourceRecord[];
  sourceSummary: SeedSourceSummary;
  provenance: SeedProvenance;
};
