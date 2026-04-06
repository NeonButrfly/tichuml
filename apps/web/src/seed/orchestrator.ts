import type { SeedDebugSnapshot, SeedProvenance } from "@tichuml/shared";

export type SeedGenerationClientResult = {
  finalSeedHex: string;
  shuffleSeedHex: string;
  provenance: SeedProvenance;
  debug: SeedDebugSnapshot;
};

function isSeedDebugSnapshot(value: unknown): value is SeedDebugSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SeedDebugSnapshot>;
  return (
    typeof candidate.gameId === "string" &&
    typeof candidate.unixTimeMs === "number" &&
    typeof candidate.finalSeedHex === "string" &&
    typeof candidate.finalSeedBase64 === "string" &&
    typeof candidate.shuffleSeedHex === "string" &&
    typeof candidate.auditHashHex === "string" &&
    Array.isArray(candidate.sources) &&
    candidate.provenance?.version === 2
  );
}

export async function generateSeedWithEntropy(config: {
  roundIndex: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<SeedGenerationClientResult> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("The entropy API client requires fetch.");
  }

  const response = await fetchImpl(config.endpoint ?? "/api/entropy/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roundIndex: config.roundIndex
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      errorBody || `Entropy service responded with HTTP ${response.status}.`
    );
  }

  const payload = (await response.json()) as unknown;
  if (!isSeedDebugSnapshot(payload)) {
    throw new Error("Entropy service returned an invalid seed payload.");
  }

  return {
    finalSeedHex: payload.finalSeedHex,
    shuffleSeedHex: payload.shuffleSeedHex,
    provenance: payload.provenance,
    debug: payload
  };
}
