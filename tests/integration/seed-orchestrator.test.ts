import { describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "@tichuml/engine";
import { combineEntropy, stableStringify } from "../../apps/server/src/entropy/combineEntropy";
import { generateEntropySeed } from "../../apps/server/src/entropy";
import type { EntropyCollectionResult, EntropySourceResult } from "../../apps/server/src/entropy/types";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function createTimedNow(startIso: string) {
  let current = new Date(startIso).getTime();
  return () => {
    const next = new Date(current);
    current += 17;
    return next;
  };
}

function createMockRuntime(config: {
  fetchImpl: typeof fetch;
  localHex: string;
  gameId?: string;
  startIso?: string;
}) {
  const logger = createMockLogger();
  return {
    runtime: {
      fetch: config.fetchImpl,
      randomBytes: (size: number) =>
        Buffer.from(config.localHex, "hex").subarray(0, size),
      randomUUID: () => config.gameId ?? "test-game-id",
      now: createTimedNow(config.startIso ?? "2026-04-03T12:00:00.000Z"),
      logger
    },
    logger
  };
}

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    async arrayBuffer() {
      return Buffer.from(JSON.stringify(body), "utf8");
    }
  } as unknown as Response;
}

function createTextResponse(text: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    async arrayBuffer() {
      return Buffer.from(text, "utf8");
    }
  } as unknown as Response;
}

function createBinaryResponse(bytes: Buffer, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    async arrayBuffer() {
      return bytes;
    }
  } as unknown as Response;
}

function buildCollection(sources: EntropySourceResult[]): EntropyCollectionResult {
  const local = sources.find((source) => source.sourceId === "local_crypto");
  if (!local) {
    throw new Error("Test collection requires local_crypto.");
  }

  return {
    context: {
      gameId: "combine-test-game",
      roundIndex: 7,
      createdAt: "2026-04-03T12:00:00.000Z",
      unixTimeMs: 1775217600000
    },
    sources,
    localCrypto64: local.bytes
  };
}

describe("multi-source entropy pipeline", () => {
  it("uses qrandom as the first successful provider and produces deterministic replay", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("qrandom.io/api/random/binary")) {
        return createJsonResponse({
          binaryURL: "https://qrandom.io/api/web/download/test-bin",
          id: "qrandom-id",
          message: "qrandom-message",
          signature: "qrandom-signature",
          resultType: "randomBinary",
          elapsedTime: 0.031,
          timestamp: "2026-04-03T12:00:00Z"
        });
      }

      if (url.includes("/api/web/download/test-bin")) {
        return createBinaryResponse(
          Buffer.from(
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            "hex"
          )
        );
      }

      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    const result = await generateEntropySeed({
      roundIndex: 1,
      gameId: "game-qrandom",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "local_crypto"],
      runtime
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("qrandom.io");
    expect(result.provenance.primaryProvider).toBe("qrandom_io");
    expect(result.provenance.sources[0]?.meta).toMatchObject({
      id: "qrandom-id",
      resultType: "randomBinary"
    });
    expect(result.provenance.sources[0]?.normalizedHashHex).toHaveLength(128);

    const first = createInitialGameState(result.shuffleSeedHex);
    const second = createInitialGameState(result.shuffleSeedHex);
    expect(first.nextState.shuffledDeck).toEqual(second.nextState.shuffledDeck);
  });

  it("falls back from the qrandom binary endpoint to the integer endpoint cleanly", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("qrandom.io/api/random/binary")) {
        return createJsonResponse({ message: "missing binary url" });
      }
      if (url.includes("qrandom.io/api/random/ints")) {
        return createJsonResponse({
          id: "qrandom-ints-id",
          resultType: "randomInts",
          numbers: Array.from({ length: 64 }, (_, index) => index)
        });
      }

      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab"
    });

    const result = await generateEntropySeed({
      roundIndex: 1,
      gameId: "game-qrandom-ints",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "local_crypto"],
      runtime
    });

    expect(result.provenance.primaryProvider).toBe("qrandom_io");
    expect(result.provenance.sources[0]?.meta).toMatchObject({
      endpointMode: "ints",
      fallbackEndpoint: expect.stringContaining("qrandom.io/api/random/ints")
    });
  });

  it("falls back from qrandom to NIST when qrandom fails", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("qrandom.io")) {
        return createJsonResponse({ error: "down" }, 503);
      }
      if (url.includes("beacon.nist.gov")) {
        return createJsonResponse({
          pulse: {
            uri: "https://beacon.nist.gov/beacon/2.0/chain/2/pulse/42",
            version: "2.0",
            chainIndex: 2,
            pulseIndex: 42,
            timeStamp: "2026-04-03T12:00:00.000Z",
            outputValue:
              "F25367221C064570555A4B0D76CA71668ECD0274D6E9DC6F83E36FFDA26F7E36CA753B93128C200CA0AC00E41251F8FCB580981F8240469767A20B11E8DB28AB",
            signatureValue: "nist-signature",
            certificateId: "cert-42",
            statusCode: 0
          }
        });
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });

    const result = await generateEntropySeed({
      roundIndex: 2,
      gameId: "game-nist",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "nist_beacon", "local_crypto"],
      runtime
    });

    expect(result.provenance.primaryProvider).toBe("nist_beacon");
    expect(result.provenance.successfulProviders).toContain("nist_beacon");
    expect(
      result.provenance.sources.find((source) => source.sourceId === "qrandom_io")?.ok
    ).toBe(false);
  });

  it("uses local crypto when all remote sources fail", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("network unavailable");
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    });

    const result = await generateEntropySeed({
      roundIndex: 3,
      gameId: "game-local",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "anu_qrng", "nist_beacon", "local_crypto"],
      runtime
    });

    expect(result.provenance.primaryProvider).toBe("local_crypto");
    expect(result.provenance.localFallbackUsed).toBe(true);
    expect(result.finalSeed.byteLength).toBe(64);
    expect(result.shuffleSeed.byteLength).toBe(32);
  });

  it("combines multiple successful sources into the final seed", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("qrandom.io/api/random/binary")) {
        return createJsonResponse({
          binaryURL: "https://qrandom.io/api/web/download/test-bin",
          id: "qrandom-id",
          message: "qrandom-message",
          signature: "qrandom-signature",
          resultType: "randomBinary",
          elapsedTime: 0.021,
          timestamp: "2026-04-03T12:00:00Z"
        });
      }
      if (url.includes("/api/web/download/test-bin")) {
        return createBinaryResponse(Buffer.alloc(64, 0x2a));
      }
      if (url.includes("beacon.nist.gov")) {
        return createJsonResponse({
          pulse: {
            uri: "https://beacon.nist.gov/beacon/2.0/chain/2/pulse/43",
            version: "2.0",
            chainIndex: 2,
            pulseIndex: 43,
            timeStamp: "2026-04-03T12:01:00.000Z",
            outputValue:
              "00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
            signatureValue: "nist-signature",
            certificateId: "cert-43",
            statusCode: 0
          }
        });
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });

    const qrandomOnly = await generateEntropySeed({
      roundIndex: 4,
      gameId: "game-combined",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "local_crypto"],
      runtime
    });
    const combined = await generateEntropySeed({
      roundIndex: 4,
      gameId: "game-combined",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "nist_beacon", "local_crypto"],
      runtime
    });

    expect(combined.provenance.successfulProviders).toEqual([
      "qrandom_io",
      "nist_beacon",
      "local_crypto"
    ]);
    expect(combined.finalSeedHex).not.toBe(qrandomOnly.finalSeedHex);
  });

  it("is deterministic for the same contributions and insensitive to input order before sorting", () => {
    const localCrypto: EntropySourceResult = {
      sourceId: "local_crypto",
      displayName: "Local Cryptographic RNG",
      ok: true,
      bytes: Buffer.alloc(64, 0xaa),
      importantData: Buffer.alloc(64, 0xaa).toString("hex"),
      meta: { source: "crypto.randomBytes" },
      qualityWeight: 100,
      durationMs: 1
    };
    const qrandom: EntropySourceResult = {
      sourceId: "qrandom_io",
      displayName: "qrandom.io Quantum RNG",
      ok: true,
      bytes: Buffer.alloc(64, 0x11),
      importantData: Buffer.alloc(64, 0x11).toString("hex"),
      meta: { id: "qrandom-id" },
      qualityWeight: 100,
      durationMs: 2
    };
    const nist: EntropySourceResult = {
      sourceId: "nist_beacon",
      displayName: "NIST Randomness Beacon",
      ok: true,
      bytes: Buffer.alloc(64, 0x22),
      importantData: Buffer.alloc(64, 0x22).toString("hex"),
      meta: { pulseIndex: 99 },
      qualityWeight: 95,
      durationMs: 3
    };

    const first = combineEntropy(buildCollection([qrandom, nist, localCrypto]));
    const second = combineEntropy(buildCollection([localCrypto, nist, qrandom]));

    expect(first.finalSeedHex).toBe(second.finalSeedHex);
    expect(first.shuffleSeedHex).toBe(second.shuffleSeedHex);
    expect(first.auditHashHex).toBe(second.auditHashHex);
  });

  it("handles malformed JSON and timeouts cleanly without crashing", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (url.includes("qrandom.io")) {
        return Promise.resolve(createTextResponse("{invalid-json"));
      }
      if (url.includes("beacon.nist.gov")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("timed out")),
            { once: true }
          );
        });
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    });

    const result = await generateEntropySeed({
      roundIndex: 5,
      gameId: "game-failure-path",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "nist_beacon", "local_crypto"],
      runtime,
      sourceOverrides: {
        nist_beacon: { timeoutMs: 5 }
      }
    });

    expect(result.provenance.sources[0]?.ok).toBe(false);
    expect(result.provenance.sources[1]?.ok).toBe(false);
    expect(result.provenance.sources[2]?.ok).toBe(true);
  });

  it("logs timeout failures as unavailable instead of pretending a retry will happen", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (url.includes("beacon.nist.gov")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true }
          );
        });
      }

      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime, logger } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "ababffffffffababffffffffababffffffffababffffffffababffffffffababffffffffababffffffffababffffffffababffffffffababffffffffababffffffff"
    });

    await generateEntropySeed({
      roundIndex: 8,
      gameId: "game-timeout-logging",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["nist_beacon", "local_crypto"],
      runtime,
      sourceOverrides: {
        nist_beacon: { timeoutMs: 5 }
      }
    });

    expect(
      logger.warn.mock.calls.some(
        (call) => String(call[0]).includes("source failed, retrying")
      )
    ).toBe(false);
    expect(
      logger.warn.mock.calls.some((call) =>
        String(call[0]).includes("source unavailable")
      )
    ).toBe(true);
  });

  it("preserves qrandom signed metadata as bounded hashes", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("qrandom.io/api/random/binary")) {
        return createJsonResponse({
          binaryURL: "https://qrandom.io/api/web/download/test-bin",
          id: "qrandom-id",
          message: "signed-message",
          signature: "signed-signature",
          resultType: "randomBinary",
          elapsedTime: 0.011,
          timestamp: "2026-04-03T12:00:00Z"
        });
      }
      if (url.includes("/api/web/download/test-bin")) {
        return createBinaryResponse(Buffer.alloc(64, 0x5c));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    const { runtime } = createMockRuntime({
      fetchImpl: fetchMock,
      localHex:
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });

    const result = await generateEntropySeed({
      roundIndex: 6,
      gameId: "game-qrandom-meta",
      unixTimeMs: 1775217600000,
      enabledSourceIds: ["qrandom_io", "local_crypto"],
      runtime
    });

    expect(result.provenance.sources[0]?.meta).toMatchObject({
      id: "qrandom-id",
      messageHashHex: expect.any(String),
      signatureHashHex: expect.any(String)
    });
  });

  it("produces a stable canonical stringify output across runs", () => {
    const payload = {
      zeta: ["b", { y: 2, x: 1 }],
      alpha: { d: true, c: null, b: 3 }
    };

    expect(stableStringify(payload)).toBe(stableStringify(payload));
    expect(stableStringify(payload)).toBe(
      '{"alpha":{"b":3,"c":null,"d":true},"zeta":["b",{"x":1,"y":2}]}'
    );
  });
});
