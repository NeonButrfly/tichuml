// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../apps/web/src/App";
import type { DecisionRequestPayload } from "@tichuml/shared";

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

  it("applies successful server GT auto-advance in seat order and leaves the phase synced with the frontend", async () => {
    setStoredBackendSettings({
      decisionMode: "server_heuristic",
      backendBaseUrl: "http://192.168.50.36:4310",
      telemetryEnabled: true,
      serverFallbackEnabled: false
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const decisionRequests: DecisionRequestPayload[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

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
          const payload = JSON.parse(
            String(init?.body ?? "{}")
          ) as DecisionRequestPayload;
          decisionRequests.push(payload);
          expect(payload.phase).toBe("grand_tichu_window");
          expect(["seat-1", "seat-2", "seat-3"]).toContain(payload.actor_seat);
          expect(payload.metadata.scoring_path).toBe("fast_path");
          expect(Array.isArray(payload.legal_actions)).toBe(true);
          expect(payload.state_norm).toMatchObject({
            phase: "grand_tichu_window",
            activeSeat: payload.actor_seat
          });
          expect(
            Array.isArray(
              (payload.state_norm as Record<string, unknown>).actorHand
            )
          ).toBe(true);
          const actionTypes = (
            payload.legal_actions as Array<Record<string, unknown>>
          ).map((action) => String(action.type));
          expect(actionTypes.length).toBeGreaterThan(0);
          expect(
            actionTypes.every(
              (actionType) =>
                actionType === "call_grand_tichu" ||
                actionType === "decline_grand_tichu"
            )
          ).toBe(true);
          expect(actionTypes).not.toContain("play_cards");
          expect(actionTypes).not.toContain("pass_turn");
          expect(actionTypes).not.toContain("advance_phase");
          for (const action of payload.legal_actions as Array<Record<string, unknown>>) {
            const owner =
              typeof action.seat === "string"
                ? action.seat
                : typeof action.actor === "string"
                  ? action.actor
                  : null;
            if (owner !== null) {
              expect(owner).toBe(payload.actor_seat);
            }
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accepted: true,
              chosen_action: {
                type: "decline_grand_tichu",
                seat: payload.actor_seat
              },
              provider_used: "server_heuristic",
              provider_reason: "Resolved by server GT auto-advance test.",
              metadata: {
                response_phase: payload.phase,
                chosen_action_type: "decline_grand_tichu"
              },
              telemetry_id: 321
            }),
            text: async () =>
              JSON.stringify({
                accepted: true,
                chosen_action: {
                  type: "decline_grand_tichu",
                  seat: payload.actor_seat
                },
                provider_used: "server_heuristic",
                provider_reason: "Resolved by server GT auto-advance test.",
                metadata: {
                  response_phase: payload.phase,
                  chosen_action_type: "decline_grand_tichu"
                },
                telemetry_id: 321
              })
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
          !bodyText().includes("Auto-advancing"),
        120,
        50
      );

      expect(reachedExchange).toBe(true);
      expect(
        Array.from(new Set(decisionRequests.map((request) => request.actor_seat)))
      ).toEqual(["seat-1", "seat-2", "seat-3"]);
      const requestLogs = infoSpy.mock.calls.filter(
        (call) =>
          call[0] === "[decision-request]" &&
          typeof call[1] === "object" &&
          call[1] !== null &&
          ["seat-1", "seat-2", "seat-3"].includes(
            String((call[1] as { actor_seat?: string }).actor_seat ?? "")
          )
      );
      expect(requestLogs.length).toBeGreaterThanOrEqual(3);
      expect(
        requestLogs.every(
          (call) =>
            (call[1] as { fast_path_used?: boolean }).fast_path_used === true &&
            (call[1] as { validation_result?: string }).validation_result ===
              "grand_tichu_only"
        )
      ).toBe(true);
      expect(
        requestLogs.every((call) => {
          const legalActions = (call[1] as { legal_actions?: Array<{ type: string }> })
            .legal_actions;
          return (
            Array.isArray(legalActions) &&
            legalActions.length > 0 &&
            legalActions.every(
              (action) =>
                action.type === "call_grand_tichu" ||
                action.type === "decline_grand_tichu"
            )
          );
        })
      ).toBe(true);

      const appliedActorOrder = infoSpy.mock.calls
        .filter(
          (call) =>
            call[0] === "[phase-transition]" &&
            typeof call[1] === "object" &&
            call[1] !== null &&
            (call[1] as { event?: string }).event ===
              "frontend_transition_applied"
        )
        .map((call) => (call[1] as { actor?: string }).actor)
        .filter(Boolean);
      const collapsedActorOrder = appliedActorOrder.filter(
        (actor, index) => index === 0 || actor !== appliedActorOrder[index - 1]
      );
      expect(collapsedActorOrder.slice(0, 4)).toEqual([
        "seat-0",
        "seat-1",
        "seat-2",
        "seat-3"
      ]);
      expect(
        infoSpy.mock.calls.some(
          (call) =>
            call[0] === "[phase-transition]" &&
            typeof call[1] === "object" &&
            call[1] !== null &&
            (call[1] as { event?: string; frontendAppliedPhase?: string }).event ===
              "frontend_phase_changed" &&
            (call[1] as { frontendAppliedPhase?: string }).frontendAppliedPhase ===
              "pass_select"
        )
      ).toBe(true);
      expect(
        infoSpy.mock.calls.some(
          (call) =>
            call[0] === "[phase-transition]" &&
            typeof call[1] === "object" &&
            call[1] !== null &&
            (call[1] as { event?: string; chosenGrandTichuAction?: string }).event ===
              "frontend_transition_applied" &&
            (call[1] as { chosenGrandTichuAction?: string }).chosenGrandTichuAction ===
              "decline_grand_tichu" &&
            ((call[1] as { nextGrandTichuActor?: string | null }).nextGrandTichuActor ===
              "seat-1" ||
              (call[1] as { requestedNextPhase?: string }).requestedNextPhase ===
                "pass_select")
        )
      ).toBe(true);
    } finally {
      view.unmount();
    }
  });

  it("shows a real GT auto-advance error and lets Next retry the failed backend step", async () => {
    setStoredBackendSettings({
      decisionMode: "server_heuristic",
      backendBaseUrl: "http://192.168.50.36:4310",
      telemetryEnabled: true,
      serverFallbackEnabled: false
    });

    let decisionRequestCount = 0;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

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
          decisionRequestCount += 1;
          const payload = JSON.parse(
            String(init?.body ?? "{}")
          ) as DecisionRequestPayload;
          if (decisionRequestCount === 1) {
            return {
              ok: false,
              status: 503,
              text: async () => JSON.stringify({ error: "backend unavailable" })
            } as Response;
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({
              accepted: true,
              chosen_action: {
                type: "decline_grand_tichu",
                seat: payload.actor_seat
              },
              provider_used: "server_heuristic",
              provider_reason: "Resolved by retry test.",
              metadata: {
                response_phase: payload.phase,
                chosen_action_type: "decline_grand_tichu"
              },
              telemetry_id: 555
            }),
            text: async () =>
              JSON.stringify({
                accepted: true,
                chosen_action: {
                  type: "decline_grand_tichu",
                  seat: payload.actor_seat
                },
                provider_used: "server_heuristic",
                provider_reason: "Resolved by retry test.",
                metadata: {
                  response_phase: payload.phase,
                  chosen_action_type: "decline_grand_tichu"
                },
                telemetry_id: 555
              })
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

      const surfacedError = await waitForCondition(
        () => bodyText().includes("Auto-advance failed: backend unavailable"),
        120,
        50
      );
      expect(surfacedError).toBe(true);
      expect(actionButtonLabels()[0]).toEqual({
        text: "Next",
        disabled: false
      });
      expect(
        infoSpy.mock.calls.some(
          (call) =>
            call[0] === "[phase-transition]" &&
            typeof call[1] === "object" &&
            call[1] !== null &&
            (call[1] as { event?: string; actor?: string; actionType?: string }).event ===
              "frontend_transition_applied" &&
            (call[1] as { actor?: string }).actor === "seat-0" &&
            (call[1] as { actionType?: string }).actionType ===
              "decline_grand_tichu" &&
            (call[1] as { nextGrandTichuActor?: string | null }).nextGrandTichuActor ===
              "seat-1"
        )
      ).toBe(true);

      await act(async () => {
        findActionButton("Next")?.click();
        await wait(20);
      });

      const reachedExchange = await waitForCondition(
        () =>
          bodyText().includes("Exchange cards") &&
          !bodyText().includes("Auto-advance failed:"),
        120,
        50
      );
      expect(reachedExchange).toBe(true);
      expect(decisionRequestCount).toBeGreaterThanOrEqual(4);
    } finally {
      view.unmount();
    }
  });
});
