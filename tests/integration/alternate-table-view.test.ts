// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type FetchJsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type AltSnapshot = {
  tablePlate: string;
  passingOverlay: string;
  anchorJson: string;
  phase: string;
  design: {
    scale: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
  handCounts: Record<string, number>;
  anchors: Array<{
    id: string;
    arrow_direction: string;
    orientation: string;
    rotation: number;
    bbox_px: { x: number; y: number; w: number; h: number };
    screen_bbox: { x: number; y: number; width: number; height: number };
  }>;
  cards: {
    usingImageAssets: boolean;
    placeholders: boolean;
    sampleSrcs: string[];
  };
};

const anchorPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv6/p/a.json"), "utf8")
) as {
  anchors: Array<{
    id: string;
    arrow_direction: string;
    slot_orientation: string;
    slot_rotation_deg: number;
    bbox_px: { x: number; y: number; w: number; h: number };
  }>;
};

const cardMapPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv6/c/map.json"), "utf8")
) as Record<string, unknown>;

const expectedPassMap = {
  north_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  north_pass_across: { dir: "south", orientation: "portrait", rot: 0 },
  north_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  south_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  south_pass_across: { dir: "north", orientation: "portrait", rot: 0 },
  south_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  east_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  east_pass_across: { dir: "west", orientation: "landscape", rot: 90 },
  east_pass_south: { dir: "south", orientation: "portrait", rot: 90 },
  west_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  west_pass_across: { dir: "east", orientation: "landscape", rot: 90 },
  west_pass_south: { dir: "south", orientation: "portrait", rot: 90 }
} as const;

class MockImage {
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  naturalWidth = 0;
  naturalHeight = 0;
  #src = "";

  get src() {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    const pathname = new URL(value, "http://localhost").pathname;

    if (pathname === "/tv6/t/plate.png" || pathname === "/tv6/p/o.png") {
      this.naturalWidth = 1536;
      this.naturalHeight = 1024;
      queueMicrotask(() => this.onload?.());
      return;
    }

    if (pathname.startsWith("/tv6/c/")) {
      this.naturalWidth = 240;
      this.naturalHeight = 390;
      queueMicrotask(() => this.onload?.());
      return;
    }

    queueMicrotask(() => this.onerror?.());
  }
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
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flushUi();
}

async function clickElement(element: HTMLButtonElement | null | undefined) {
  await act(async () => {
    element?.click();
  });
}

function queryByText(container: ParentNode, text: string) {
  return Array.from(container.querySelectorAll("*")).find(
    (node) => node.textContent?.trim() === text
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1536
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 1024
  });
  Object.defineProperty(window, "__TICHU_ALT_SNAPSHOT__", {
    configurable: true,
    writable: true,
    value: null
  });
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL): Promise<FetchJsonResponse> => {
      const pathname = new URL(String(input), "http://localhost").pathname;
      if (pathname === "/tv6/p/a.json") {
        return {
          ok: true,
          status: 200,
          json: async () => anchorPayload
        };
      }

      if (pathname === "/tv6/c/map.json") {
        return {
          ok: true,
          status: 200,
          json: async () => cardMapPayload
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.innerHTML = "";
});

describe("AltTable3DRoute", () => {
  it("renders the tv6 table flow with dynamic pass targets, image cards, and runtime snapshot data", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, {}));

    await flushUi();

    const tableImage = view.container.querySelector(
      "img[data-table-layer='plate']"
    ) as HTMLImageElement | null;
    expect(tableImage).not.toBeNull();
    expect(tableImage?.getAttribute("src")).toBe("/tv6/t/plate.png");

    expect(queryByText(view.container, "deal8")).toBeTruthy();
    expect(view.container.querySelectorAll("[data-seat-hand='north'] img")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-seat-hand='east'] img")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-seat-hand='south'] img")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-seat-hand='west'] img")).toHaveLength(8);

    await advance(1400);
    expect(queryByText(view.container, "gt")).toBeTruthy();

    const skipGtButton = view.container.querySelector(
      "button[data-alt-action='skip-gt']"
    ) as HTMLButtonElement | null;
    expect(skipGtButton).not.toBeNull();
    await clickElement(skipGtButton);

    await flushUi();
    expect(queryByText(view.container, "deal6")).toBeTruthy();

    await advance(1400);
    expect(queryByText(view.container, "passing")).toBeTruthy();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).not.toBeNull();

    const passTargets = Array.from(
      view.container.querySelectorAll("[data-pass-id]")
    ) as HTMLElement[];
    expect(passTargets).toHaveLength(12);

    for (const target of passTargets) {
      const passId = target.dataset.passId as keyof typeof expectedPassMap;
      const expected = expectedPassMap[passId];
      expect(expected).toBeTruthy();
      expect(target.dataset.arrowDirection).toBe(expected.dir);
      expect(target.dataset.orientation).toBe(expected.orientation);
      expect(Number(target.dataset.rotation)).toBe(expected.rot);
    }

    const southCards = Array.from(
      view.container.querySelectorAll("[data-seat-hand='south'] button[data-card-id]")
    ) as HTMLButtonElement[];
    expect(southCards.length).toBeGreaterThanOrEqual(3);
    await clickElement(southCards[0]);
    await clickElement(southCards[1]);
    await clickElement(southCards[2]);
    await flushUi();

    const southTargets = [
      view.container.querySelector("[data-pass-id='south_pass_left']"),
      view.container.querySelector("[data-pass-id='south_pass_across']"),
      view.container.querySelector("[data-pass-id='south_pass_right']")
    ] as HTMLButtonElement[];
    await clickElement(southTargets[0]);
    await clickElement(southTargets[1]);
    await clickElement(southTargets[2]);
    await flushUi();

    expect(
      view.container.querySelectorAll(
        "[data-pass-id^='south_pass_'] [data-pass-card-img='true']"
      )
    ).toHaveLength(3);

    const autoDemoButton = view.container.querySelector(
      "button[data-alt-action='auto-demo-pass']"
    ) as HTMLButtonElement | null;
    expect(autoDemoButton).not.toBeNull();
    await clickElement(autoDemoButton);
    await flushUi();

    expect(
      view.container.querySelectorAll("[data-pass-id] [data-pass-card-img='true']")
    ).toHaveLength(12);

    const confirmPassButton = view.container.querySelector(
      "button[data-alt-action='confirm-pass']"
    ) as HTMLButtonElement | null;
    expect(confirmPassButton).not.toBeNull();
    await clickElement(confirmPassButton);

    await flushUi();
    expect(queryByText(view.container, "passed")).toBeTruthy();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).toBeNull();

    const snapshot = (window as typeof window & {
      __TICHU_ALT_SNAPSHOT__?: AltSnapshot;
    }).__TICHU_ALT_SNAPSHOT__;
    expect(snapshot?.tablePlate).toBe("/tv6/t/plate.png");
    expect(snapshot?.passingOverlay).toBe("/tv6/p/o.png");
    expect(snapshot?.anchorJson).toBe("/tv6/p/a.json");
    expect(snapshot?.design.width).toBe(1536);
    expect(snapshot?.design.height).toBe(1024);
    expect(snapshot?.handCounts.south).toBe(14);
    expect(snapshot?.anchors).toHaveLength(12);
    expect(snapshot?.cards.usingImageAssets).toBe(true);
    expect(snapshot?.cards.placeholders).toBe(false);
    expect(snapshot?.cards.sampleSrcs.every((src) => src.startsWith("/tv6/c/"))).toBe(
      true
    );

    const snapshotAnchor = snapshot?.anchors.find(
      (anchor) => anchor.id === "east_pass_across"
    );
    expect(snapshotAnchor?.arrow_direction).toBe("west");
    expect(snapshotAnchor?.orientation).toBe("landscape");
    expect(snapshotAnchor?.rotation).toBe(90);

    const designAnchor = anchorPayload.anchors.find(
      (anchor) => anchor.id === "east_pass_across"
    );
    expect(snapshotAnchor?.screen_bbox.x).toBeCloseTo(designAnchor?.bbox_px.x ?? 0, 0);
    expect(snapshotAnchor?.screen_bbox.y).toBeCloseTo(designAnchor?.bbox_px.y ?? 0, 0);
    expect(snapshotAnchor?.screen_bbox.width).toBeCloseTo(
      designAnchor?.bbox_px.w ?? 0,
      0
    );
    expect(snapshotAnchor?.screen_bbox.height).toBeCloseTo(
      designAnchor?.bbox_px.h ?? 0,
      0
    );

    view.unmount();
  });
});
