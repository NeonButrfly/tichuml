// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../apps/web/src/App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function actionButtons() {
  return Array.from(
    document.querySelectorAll(".normal-action-button")
  ) as HTMLButtonElement[];
}

function actionButtonLabels() {
  return actionButtons().map((button) => ({
    text: button.textContent?.trim() ?? "",
    disabled: button.disabled
  }));
}

function findActionButton(label: string) {
  return actionButtons().find((button) => button.textContent?.trim() === label);
}

function bodyText() {
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function setStoredBackendSettings(settings: {
  decisionMode: "local" | "server_heuristic";
  backendBaseUrl: string;
  telemetryEnabled: boolean;
  serverFallbackEnabled: boolean;
}) {
  localStorage.setItem("tichuml.backend-settings.v1", JSON.stringify(settings));
}

function createEntropyPayload() {
  return {
    gameId: "game-live-gameplay-executor",
    unixTimeMs: 1777663000000,
    finalSeedHex: "a".repeat(64),
    finalSeedBase64: "YQ==",
    shuffleSeedHex: "b".repeat(64),
    auditHashHex: "c".repeat(64),
    sources: [],
    provenance: {
      version: 2,
      sourceDigestHex: "d".repeat(64),
      entropyHex: "e".repeat(64)
    }
  };
}

async function waitForActionButton(label: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => {
      await wait(50);
    });
    const button = findActionButton(label);
    if (button) {
      return button;
    }
  }

  return undefined;
}

async function waitForCondition(
  predicate: () => boolean,
  attempts = 120,
  intervalMs = 50
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await act(async () => {
      await wait(intervalMs);
    });
    if (predicate()) {
      return true;
    }
  }

  return false;
}

describe("live gameplay executor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("advances through Grand Tichu exactly once per seat and routes gameplay telemetry to the configured backend", async () => {
    setStoredBackendSettings({
      decisionMode: "local",
      backendBaseUrl: "http://192.168.50.36:4310",
      telemetryEnabled: true,
      serverFallbackEnabled: true
    });

    const fetchLog: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchLog.push({ url, method: init?.method ?? "GET" });

        if (url.includes("/api/entropy/generate")) {
          const payload = createEntropyPayload();
          return {
            ok: true,
            status: 200,
            json: async () => payload,
            text: async () => JSON.stringify(payload)
          } as Response;
        }

        if (url.includes("/api/telemetry/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ accepted: true, telemetry_id: 123 }),
            text: async () =>
              JSON.stringify({ accepted: true, telemetry_id: 123 })
          } as Response;
        }

        if (url.includes("/health")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, database: "postgres" }),
            text: async () => JSON.stringify({ ok: true, database: "postgres" })
          } as Response;
        }

        throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
      })
    );

    const view = render(createElement(App));
    try {
      const nextButton = await waitForActionButton("Next");
      expect(nextButton).toBeTruthy();

      await act(async () => {
        nextButton?.click();
        await wait(20);
      });
      const reachedExchange = await waitForCondition(
        () =>
          bodyText().includes("Exchange cards") &&
          actionButtonLabels().some(
            (button) => button.text === "Exchange" && button.disabled
          ),
        120,
        50
      );

      expect(reachedExchange).toBe(true);
      expect(actionButtonLabels()).toEqual([
        { text: "Tichu", disabled: false },
        { text: "Pass", disabled: true },
        { text: "Exchange", disabled: true }
      ]);
      expect(bodyText()).toContain("Exchange cards");
      const telemetryUrls = fetchLog
        .map((entry) => entry.url)
        .filter((url) => url.includes("/api/telemetry/"));
      const decisionTelemetryUrls = telemetryUrls.filter((url) =>
        url.endsWith("/api/telemetry/decision")
      );
      const eventTelemetryUrls = telemetryUrls.filter((url) =>
        url.endsWith("/api/telemetry/event")
      );
      expect(decisionTelemetryUrls.length).toBeGreaterThanOrEqual(4);
      expect(eventTelemetryUrls.length).toBeGreaterThanOrEqual(4);
      expect(
        telemetryUrls.every((url) => url.startsWith("http://192.168.50.36:4310"))
      ).toBe(true);
    } finally {
      view.unmount();
    }
  });

  it("clears thinking state and avoids duplicate requests when the backend decision request fails", async () => {
    setStoredBackendSettings({
      decisionMode: "server_heuristic",
      backendBaseUrl: "http://192.168.50.36:4310",
      telemetryEnabled: true,
      serverFallbackEnabled: false
    });

    const fetchLog: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchLog.push({ url, method: init?.method ?? "GET" });

        if (url.includes("/api/entropy/generate")) {
          const payload = createEntropyPayload();
          return {
            ok: true,
            status: 200,
            json: async () => payload,
            text: async () => JSON.stringify(payload)
          } as Response;
        }

        if (url.endsWith("/api/decision/request")) {
          return {
            ok: false,
            status: 503,
            text: async () => JSON.stringify({ error: "backend unavailable" })
          } as Response;
        }

        if (url.includes("/health")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, database: "postgres" }),
            text: async () => JSON.stringify({ ok: true, database: "postgres" })
          } as Response;
        }

        throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
      })
    );

    const view = render(createElement(App));
    try {
      const nextButton = await waitForActionButton("Next");
      expect(nextButton).toBeTruthy();

      await act(async () => {
        nextButton?.click();
        await wait(20);
      });

      await act(async () => {
        await wait(1_000);
      });

      const decisionRequests = fetchLog.filter((entry) =>
        entry.url.endsWith("/api/decision/request")
      );
      expect(decisionRequests).toHaveLength(1);
      expect(bodyText()).not.toContain("East thinking");
    } finally {
      view.unmount();
    }
  });
});
