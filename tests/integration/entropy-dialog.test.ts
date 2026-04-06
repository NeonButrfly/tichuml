// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeedDebugSnapshot } from "@tichuml/shared";
import {
  GameChromeMenu,
  RandomSourcesDialogContent
} from "../../apps/web/src/game-table-views";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function createSeedDebug(
  overrides: Partial<SeedDebugSnapshot> = {}
): SeedDebugSnapshot {
  const provenance = {
    version: 2 as const,
    context: {
      gameId: "game-123",
      roundIndex: 1,
      createdAt: "2026-04-03T12:00:00.000Z",
      unixTimeMs: 1775217600000
    },
    attemptedProviders: ["qrandom_io", "local_crypto"],
    successfulProviders: ["qrandom_io", "local_crypto"],
    primaryProvider: "qrandom_io",
    localFallbackUsed: false,
    finalSeed: "aa".repeat(64),
    finalSeedHex: "aa".repeat(64),
    finalSeedBase64: Buffer.from("aa".repeat(64), "hex").toString("base64"),
    shuffleSeedHex: "bb".repeat(32),
    auditHashHex: "cc".repeat(32),
    sourceSummary: {
      attempted: 2,
      succeeded: 2,
      failed: 0,
      minimumRequired: 1,
      metMinimum: true
    },
    derivation: {
      schemaVersion: 1 as const,
      domainTag: "TICHU_ENTROPY_V1" as const,
      finalSeedAlgorithm: "SHA3-512" as const,
      shuffleSeedAlgorithm: "HKDF-SHA256" as const,
      auditAlgorithm: "SHA-256" as const,
      sortedSourceIds: ["local_crypto", "qrandom_io"],
      canonicalPayloadHashes: ["11".repeat(32), "22".repeat(32)],
      localCryptoIncluded: true
    },
    sources: [
      {
        sourceId: "qrandom_io" as const,
        displayName: "qrandom.io Quantum RNG",
        ok: true,
        qualityWeight: 100,
        durationMs: 42,
        previewValue: "001122… (64 bytes)",
        normalizedHashHex: "dd".repeat(64),
        canonicalPayloadHashHex: "ee".repeat(32),
        meta: {
          id: "qrandom-id",
          resultType: "randomBinary"
        },
        error: null,
        bytesLength: 64,
        fetchedAt: "2026-04-03T12:00:00.000Z",
        usedInFinalSeed: true
      },
      {
        sourceId: "local_crypto" as const,
        displayName: "Local Cryptographic RNG",
        ok: true,
        qualityWeight: 100,
        durationMs: 1,
        previewValue: "aabbcc… (64 bytes)",
        normalizedHashHex: "ff".repeat(64),
        canonicalPayloadHashHex: "99".repeat(32),
        meta: {
          source: "crypto.randomBytes"
        },
        error: null,
        bytesLength: 64,
        fetchedAt: "2026-04-03T12:00:00.000Z",
        usedInFinalSeed: true
      }
    ]
  };

  const snapshot: SeedDebugSnapshot = {
    gameId: "game-123",
    unixTimeMs: 1775217600000,
    finalSeedHex: "aa".repeat(64),
    finalSeedBase64: Buffer.from("aa".repeat(64), "hex").toString("base64"),
    shuffleSeedHex: "bb".repeat(32),
    auditHashHex: "cc".repeat(32),
    sources: provenance.sources,
    sourceSummary: provenance.sourceSummary,
    provenance
  };

  const merged = {
    ...snapshot,
    ...overrides
  };

  return {
    ...merged,
    provenance: {
      ...merged.provenance,
      context: {
        ...merged.provenance.context,
        gameId: merged.gameId,
        unixTimeMs: merged.unixTimeMs
      },
      finalSeed: merged.finalSeedHex,
      finalSeedHex: merged.finalSeedHex,
      finalSeedBase64: merged.finalSeedBase64,
      shuffleSeedHex: merged.shuffleSeedHex,
      auditHashHex: merged.auditHashHex,
      sourceSummary: merged.sourceSummary,
      sources: merged.sources
    }
  };
}

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    rerender(nextElement: ReactElement) {
      act(() => {
        root.render(nextElement);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Random Sources UI", () => {
  it("renders the empty state before any seed generation", () => {
    const view = render(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: null })
    );

    expect(view.container.textContent).toContain(
      "No random source data available yet. Start a game first."
    );

    view.unmount();
  });

  it("copies the exact selected value and preserves full monospace field content", async () => {
    const clipboard = {
      writeText: vi.fn(async () => undefined)
    };
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: clipboard
    });

    const debug = createSeedDebug();
    const view = render(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: debug })
    );

    const textareas = view.container.querySelectorAll<HTMLTextAreaElement>(
      ".entropy-field__input"
    );
    expect(textareas[0]?.className).toContain("entropy-field__input");
    expect(textareas[0]?.value).toBe(debug.finalSeedHex);

    const copyButtons = view.container.querySelectorAll<HTMLButtonElement>(
      ".entropy-copy-button"
    );
    await act(async () => {
      copyButtons[0]?.click();
    });

    expect(clipboard.writeText).toHaveBeenCalledWith(debug.finalSeedHex);
    expect(copyButtons[0]?.textContent).toContain("Copied");

    view.unmount();
  });

  it("updates when a new seed generation result is rendered", () => {
    const first = createSeedDebug({
      gameId: "game-one",
      unixTimeMs: 1775217600000
    });
    const second = createSeedDebug({
      gameId: "game-two",
      unixTimeMs: 1775217900000,
      finalSeedHex: "12".repeat(64)
    });
    const view = render(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: first })
    );

    expect(view.container.textContent).toContain("game-one");

    view.rerender(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: second })
    );

    expect(view.container.textContent).toContain("game-two");
    expect(
      view.container.querySelector<HTMLTextAreaElement>(".entropy-field__input")
        ?.value
    ).toBe("12".repeat(64));

    view.unmount();
  });

  it("shows a successful fallback status when local crypto carried the run", () => {
    const debug = createSeedDebug({
      sourceSummary: {
        attempted: 3,
        succeeded: 1,
        failed: 2,
        minimumRequired: 1,
        metMinimum: true
      },
      sources: [
        {
          sourceId: "qrandom_io",
          displayName: "qrandom.io Quantum RNG",
          ok: false,
          qualityWeight: 100,
          durationMs: 1600,
          previewValue: null,
          normalizedHashHex: null,
          canonicalPayloadHashHex: null,
          meta: {
            timeoutMs: 1600,
            aborted: true
          },
          error: "timeout",
          bytesLength: 0,
          fetchedAt: null,
          usedInFinalSeed: false
        },
        {
          sourceId: "nist_beacon",
          displayName: "NIST Randomness Beacon",
          ok: false,
          qualityWeight: 95,
          durationMs: 1800,
          previewValue: null,
          normalizedHashHex: null,
          canonicalPayloadHashHex: null,
          meta: {
            timeoutMs: 1800,
            aborted: true
          },
          error: "timeout",
          bytesLength: 0,
          fetchedAt: null,
          usedInFinalSeed: false
        },
        {
          sourceId: "local_crypto",
          displayName: "Local Cryptographic RNG",
          ok: true,
          qualityWeight: 100,
          durationMs: 2,
          previewValue: "aabbcc… (64 bytes)",
          normalizedHashHex: "ff".repeat(64),
          canonicalPayloadHashHex: "99".repeat(32),
          meta: {
            source: "crypto.randomBytes"
          },
          error: null,
          bytesLength: 64,
          fetchedAt: "2026-04-03T12:00:00.000Z",
          usedInFinalSeed: true
        }
      ],
      provenance: {
        ...createSeedDebug().provenance,
        attemptedProviders: ["qrandom_io", "nist_beacon", "local_crypto"],
        successfulProviders: ["local_crypto"],
        primaryProvider: "local_crypto",
        localFallbackUsed: true
      }
    });
    const view = render(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: debug })
    );

    expect(view.container.textContent).toContain("Seed generation succeeded");
    expect(view.container.textContent).toContain("Local fallback used");
    expect(view.container.textContent).toContain(
      "Local cryptographic randomness completed the entropy set"
    );

    view.unmount();
  });

  it("renders multiple sources and failed-source error states cleanly", () => {
    const debug = createSeedDebug({
      sourceSummary: {
        attempted: 3,
        succeeded: 2,
        failed: 1,
        minimumRequired: 1,
        metMinimum: true
      },
      sources: [
        ...createSeedDebug().sources,
        {
          sourceId: "random_org",
          displayName: "RANDOM.ORG HTTP Interface",
          ok: false,
          qualityWeight: 90,
          durationMs: 1500,
          previewValue: null,
          normalizedHashHex: null,
          canonicalPayloadHashHex: null,
          meta: {
            endpoint: "https://www.random.org/strings/"
          },
          error: "HTTP 503 from RANDOM.ORG",
          bytesLength: 0,
          fetchedAt: null,
          usedInFinalSeed: false
        }
      ]
    });
    const view = render(
      createElement(RandomSourcesDialogContent, { latestEntropyDebug: debug })
    );

    expect(view.container.textContent).toContain("qrandom.io Quantum RNG");
    expect(view.container.textContent).toContain("Local Cryptographic RNG");
    expect(view.container.textContent).toContain("RANDOM.ORG HTTP Interface");
    expect(view.container.textContent).toContain("HTTP 503 from RANDOM.ORG");

    view.unmount();
  });

  it("adds Random Sources to the hamburger menu without removing the existing items", () => {
    const onCommand = vi.fn();
    const onOpenChange = vi.fn();
    const view = render(
      createElement(GameChromeMenu, {
        variant: "normal",
        isOpen: true,
        uiMode: "normal",
        layoutEditorActive: false,
        onMainMenuOpenChange: onOpenChange,
        onUiCommand: onCommand
      })
    );

    const menuText = view.container.textContent ?? "";
    expect(menuText).toContain("New Game");
    expect(menuText).toContain("Table Editor");
    expect(menuText).toContain("Debug Mode");
    expect(menuText).toContain("Hot Keys");
    expect(menuText).toContain("Random Sources");
    expect(menuText).toContain("How To Play Tichu");

    view.unmount();
  });

  it("routes the Random Sources menu item through the shared command", () => {
    const onCommand = vi.fn();
    const view = render(
      createElement(GameChromeMenu, {
        variant: "normal",
        isOpen: true,
        uiMode: "normal",
        layoutEditorActive: false,
        onMainMenuOpenChange: vi.fn(),
        onUiCommand: onCommand
      })
    );

    const button = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.includes("Random Sources")
    );

    act(() => {
      button?.click();
    });

    expect(onCommand).toHaveBeenCalledWith("open_random_sources_dialog");
    view.unmount();
  });
});
