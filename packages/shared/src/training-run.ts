type TimestampZone = "local" | "utc";

function padNumber(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function stableHash32(input: string, salt: number): string {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableHash64(input: string): string {
  const chunks: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    chunks.push(stableHash32(`${index}|${input}`, index * 0x9e3779b1));
  }
  return chunks.join("");
}

export function formatTrainingRunTimestamp(
  date: Date,
  zone: TimestampZone = "local"
): string {
  const year =
    zone === "utc" ? date.getUTCFullYear() : date.getFullYear();
  const month =
    zone === "utc" ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = zone === "utc" ? date.getUTCDate() : date.getDate();
  const hours = zone === "utc" ? date.getUTCHours() : date.getHours();
  const minutes =
    zone === "utc" ? date.getUTCMinutes() : date.getMinutes();
  const seconds =
    zone === "utc" ? date.getUTCSeconds() : date.getSeconds();
  return `${year}${padNumber(month)}${padNumber(day)}-${padNumber(hours)}${padNumber(minutes)}${padNumber(seconds)}`;
}

export function buildTrainingSeedHash(seed: string): string {
  return stableHash64(`seed|${seed}`);
}

export function buildTrainingRunId(config: {
  seed: string;
  startedAt: Date;
  zone?: TimestampZone;
}): string {
  const seedPrefix = sanitizeSegment(config.seed).slice(0, 8) || "seed";
  return `training-${formatTrainingRunTimestamp(config.startedAt, config.zone)}-${seedPrefix}`;
}

export function buildTrainingSessionName(runId: string): string {
  return sanitizeSessionName(`tichuml-${runId}`);
}

export function sanitizeSessionName(value: string): string {
  const sanitized = sanitizeSegment(value);
  if (sanitized.length === 0) {
    throw new Error("Session name must contain at least one alphanumeric character.");
  }
  return sanitized;
}

export function buildTrainingBatchId(batchNumber: number): string {
  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    throw new Error(`Batch number must be a positive integer. Received ${batchNumber}.`);
  }
  return `batch-${String(batchNumber).padStart(6, "0")}`;
}

export function buildTrainingGameIdPrefix(config: {
  runId: string;
  batchId?: string | null;
}): string {
  const runPrefix = `selfplay-${config.runId}`;
  return config.batchId ? `${runPrefix}-${config.batchId}` : runPrefix;
}

export function buildTrainingGameId(config: {
  gameIdPrefix: string;
  gameNumber: number;
}): string {
  if (!Number.isInteger(config.gameNumber) || config.gameNumber < 1) {
    throw new Error(
      `Game number must be a positive integer. Received ${config.gameNumber}.`
    );
  }
  return `${config.gameIdPrefix}-game-${String(config.gameNumber).padStart(6, "0")}`;
}

export function deriveTrainingBatchSeed(config: {
  resolvedRunSeed: string;
  derivationNamespace: string;
  batchId: string;
}): string {
  return stableHash64(
    `batch|${config.resolvedRunSeed}|${config.derivationNamespace}|${config.batchId}`
  ).slice(0, 32);
}
