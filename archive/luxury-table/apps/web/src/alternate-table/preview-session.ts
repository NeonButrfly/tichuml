import {
  applyEngineAction,
  createInitialGameState,
  type EngineResult,
  type InitialGameSeedConfig,
  type SeatId
} from "@tichuml/engine";
import { type SeedDebugSnapshot, type SeedEntropySourceRecord, type SeedProvenance } from "@tichuml/shared";

type PreviewRoundCarryState = Pick<InitialGameSeedConfig, "matchHistory" | "matchScore">;

export type AlternateTablePreviewSession = {
  roundIndex: number;
  round: EngineResult;
  entropyDebug: SeedDebugSnapshot;
};

function buildPreviewSeedHex(roundIndex: number, salt: string): string {
  const seed = `${salt}-${roundIndex.toString(16)}`.replaceAll("-", "");
  return seed.padEnd(64, "0").slice(0, 64);
}

function buildPreviewEntropyDebug(roundIndex: number): SeedDebugSnapshot {
  const createdAt = "2026-05-22T00:00:00.000Z";
  const unixTimeMs = 1_779_408_000_000 + roundIndex;
  const finalSeedHex = buildPreviewSeedHex(roundIndex, "altpreview");
  const shuffleSeedHex = buildPreviewSeedHex(roundIndex, "passselect");
  const auditHashHex = buildPreviewSeedHex(roundIndex, "previewaudit");
  const sourceSummary = {
    attempted: 1,
    succeeded: 1,
    failed: 0,
    minimumRequired: 1,
    metMinimum: true
  } as const;
  const sources: SeedEntropySourceRecord[] = [
    {
      sourceId: "local_crypto",
      displayName: "Local Preview Seed",
      ok: true,
      qualityWeight: 1,
      durationMs: 0,
      previewValue: `alternate-pass-preview-${roundIndex}`,
      normalizedHashHex: finalSeedHex,
      canonicalPayloadHashHex: auditHashHex,
      meta: {
        mode: "dev_preview",
        preview: "pass-select"
      },
      error: null,
      bytesLength: 32,
      fetchedAt: createdAt,
      usedInFinalSeed: true
    }
  ];
  const provenance: SeedProvenance = {
    version: 2,
    context: {
      gameId: `alternate-pass-preview-${roundIndex}`,
      roundIndex,
      createdAt,
      unixTimeMs
    },
    attemptedProviders: ["local_crypto"],
    successfulProviders: ["local_crypto"],
    primaryProvider: "local_crypto",
    localFallbackUsed: false,
    finalSeed: `alternate-pass-preview-${roundIndex}`,
    finalSeedHex,
    finalSeedBase64: `alternate-pass-preview-${roundIndex}`,
    shuffleSeedHex,
    auditHashHex,
    sourceSummary,
    derivation: {
      schemaVersion: 1,
      domainTag: "TICHU_ENTROPY_V1",
      finalSeedAlgorithm: "SHA3-512",
      shuffleSeedAlgorithm: "HKDF-SHA256",
      auditAlgorithm: "SHA-256",
      sortedSourceIds: ["local_crypto"],
      canonicalPayloadHashes: [auditHashHex],
      localCryptoIncluded: true
    },
    sources
  };

  return {
    gameId: provenance.context.gameId,
    unixTimeMs,
    finalSeedHex,
    finalSeedBase64: provenance.finalSeedBase64,
    shuffleSeedHex,
    auditHashHex,
    sources,
    sourceSummary,
    provenance
  };
}

function buildPassSelection(result: EngineResult, seat: SeatId) {
  const cards = result.nextState.hands[seat];
  if (cards.length < 3) {
    throw new Error(`Preview seat ${seat} does not have enough cards to form a pass selection.`);
  }

  return {
    left: cards[0]!.id,
    partner: cards[1]!.id,
    right: cards[2]!.id
  };
}

export function createAlternatePassSelectPreviewSession(config: {
  roundIndex: number;
  carryState?: PreviewRoundCarryState;
}): AlternateTablePreviewSession {
  const roundSeed = `alternate-pass-preview-${config.roundIndex}`;
  let round = createInitialGameState({
    seed: roundSeed,
    seedProvenance: buildPreviewEntropyDebug(config.roundIndex).provenance,
    ...(config.carryState ?? {})
  });

  for (const seat of ["seat-0", "seat-1", "seat-2", "seat-3"] as const) {
    const canDecline = (round.legalActions[seat] ?? []).some(
      (action) => action.type === "decline_grand_tichu"
    );
    if (canDecline) {
      round = applyEngineAction(round.nextState, {
        type: "decline_grand_tichu",
        seat
      });
    }
  }

  if (round.nextState.phase !== "pass_select") {
    throw new Error(
      `Alternate preview expected pass_select after the Grand Tichu window, got ${round.nextState.phase}.`
    );
  }

  for (const seat of ["seat-1", "seat-2", "seat-3"] as const) {
    round = applyEngineAction(round.nextState, {
      type: "select_pass",
      seat,
      ...buildPassSelection(round, seat)
    });
  }

  if (round.nextState.phase !== "pass_select") {
    throw new Error(
      `Alternate preview expected to stay in pass_select with only south unresolved, got ${round.nextState.phase}.`
    );
  }

  return {
    roundIndex: config.roundIndex,
    round,
    entropyDebug: buildPreviewEntropyDebug(config.roundIndex)
  };
}
