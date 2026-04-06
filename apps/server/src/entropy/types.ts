import type {
  SeedDebugSnapshot,
  SeedGenerationContext,
  SeedJsonValue,
  SeedProvenance,
  SeedProviderName
} from "@tichuml/shared";

export type EntropyLogger = {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
};

export type EntropyRuntime = {
  fetch: typeof fetch;
  now: () => Date;
  randomBytes: (size: number) => Buffer;
  randomUUID: () => string;
  logger: EntropyLogger;
};

export type EntropySourceResult = {
  sourceId: SeedProviderName;
  displayName: string;
  ok: boolean;
  bytes: Buffer;
  importantData: SeedJsonValue;
  meta: SeedJsonValue;
  error: string | null;
  qualityWeight: number;
  durationMs: number;
  normalizedHashHex: string | null;
  canonicalPayloadHashHex: string | null;
  previewValue: string | null;
  fetchedAt: string | null;
  usedInFinalSeed: boolean;
};

export type EntropySourceRequest = {
  context: SeedGenerationContext;
  runtime: EntropyRuntime;
  signal: AbortSignal;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type EntropySource = {
  sourceId: SeedProviderName;
  displayName: string;
  qualityWeight: number;
  defaultTimeoutMs: number;
  defaultMaxResponseBytes: number;
  collect(request: EntropySourceRequest): Promise<EntropySourceResult>;
};

export type EntropySourceOverride = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxAttempts?: number;
};

export type EntropyCollectionOptions = {
  roundIndex: number;
  gameId?: string;
  unixTimeMs?: number;
  globalBudgetMs?: number;
  enabledSourceIds?: SeedProviderName[];
  includeBlitzortung?: boolean;
  blitzortungUrl?: string | null;
  runtime?: Partial<Omit<EntropyRuntime, "logger">> & {
    logger?: EntropyLogger;
  };
  sourceOverrides?: Partial<Record<SeedProviderName, EntropySourceOverride>>;
};

export type EntropyCollectionResult = {
  context: SeedGenerationContext;
  sources: EntropySourceResult[];
  localCrypto64: Buffer;
};

export type EntropyGenerationResult = {
  finalSeed: Buffer;
  finalSeedHex: string;
  finalSeedBase64: string;
  shuffleSeed: Buffer;
  shuffleSeedHex: string;
  auditHashHex: string;
  gameId: string;
  unixTimeMs: number;
  sources: EntropySourceResult[];
  sourceSummary: SeedProvenance["sourceSummary"];
  provenance: SeedProvenance;
};

export type EntropyGenerationApiResult = SeedDebugSnapshot;
