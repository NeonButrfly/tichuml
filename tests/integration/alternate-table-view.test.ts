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

type Tv7Snapshot = {
  assetRoot: string;
  phase: string;
  table: {
    src: string;
    rendered: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  };
  cardLayout: {
    src: string;
    layoutSource: string;
    anchors: Array<{
      id: string;
      zone: string;
      screen_bbox: { x: number; y: number; width: number; height: number };
    }>;
  };
  passing: {
    overlaySrc: string;
    anchors: Array<{
      id: string;
      arrow_direction: string;
      orientation: string;
      rotation: number;
      screen_bbox: { x: number; y: number; width: number; height: number };
    }>;
  };
  cards: {
    usingImageAssets: boolean;
    placeholders: boolean;
    layoutSource: string;
    bySeat: Record<string, number>;
    sampleSrcs: string[];
  };
  deal: {
    phase: string;
    counts: Record<string, number>;
    history: string[];
  };
};

const passPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/p/a.json"), "utf8")
) as {
  anchors: Array<{
    id: string;
    arrow_direction: string;
    slot_orientation: string;
    slot_rotation_deg: number;
    bbox_px: { x: number; y: number; w: number; h: number };
  }>;
};

const handPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/h/a.json"), "utf8")
) as {
  anchors: Array<{
    id: string;
    zone: string;
    bbox_px: { x: number; y: number; w: number; h: number };
  }>;
};

const cardMapPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/c/map.json"), "utf8")
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

    if (pathname === "/tv7/t/plate.png" || pathname === "/tv7/p/o.png") {
      this.naturalWidth = 1536;
      this.naturalHeight = 1024;
      queueMicrotask(() => this.onload?.());
      return;
    }

    if (pathname.startsWith("/tv7/c/")) {
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
  Object.defineProperty(window, "__tichuV7Snapshot", {
    configurable: true,
    writable: true,
    value: null
  });
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL): Promise<FetchJsonResponse> => {
      const pathname = new URL(String(input), "http://localhost").pathname;
      if (pathname === "/tv7/p/a.json") {
        return {
          ok: true,
          status: 200,
          json: async () => passPayload
        };
      }

      if (pathname === "/tv7/h/a.json") {
        return {
          ok: true,
          status: 200,
          json: async () => handPayload
        };
      }

      if (pathname === "/tv7/c/map.json") {
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
  it("renders the tv7 table flow with authored card anchors, dynamic pass targets, and a runtime snapshot", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, {}));

    await flushUi();

    const tableImage = view.container.querySelector(
      "img[data-table-layer='plate']"
    ) as HTMLImageElement | null;
    expect(tableImage).not.toBeNull();
    expect(tableImage?.getAttribute("src")).toBe("/tv7/t/plate.png");

    expect(queryByText(view.container, "ready")).toBeTruthy();
    expect(view.container.querySelectorAll("[data-zone='south_hand']")).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-zone='north_hand']")).toHaveLength(0);

    await advance(250);
    expect(queryByText(view.container, "deal8")).toBeTruthy();
    expect(view.container.querySelectorAll("[data-zone='north_hand']")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-zone='east_hand']")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-zone='south_hand']")).toHaveLength(8);
    expect(view.container.querySelectorAll("[data-zone='west_hand']")).toHaveLength(8);
    expect(
      view.container.querySelectorAll("[data-render-mode='r3f-hidden-hand']")
    ).toHaveLength(24);

    const southDeal8Cards = Array.from(
      view.container.querySelectorAll("[data-zone='south_hand'][data-card-id]")
    ) as HTMLElement[];
    expect(
      southDeal8Cards.every(
        (card) => card.getAttribute("data-layout-source") === "prototype_layer"
      )
    ).toBe(true);
    expect(view.container.querySelector("[data-seat-hand='south']")).toBeNull();

    await advance(1200);
    expect(queryByText(view.container, "grand_tichu")).toBeTruthy();

    const skipGtButton = view.container.querySelector(
      "button[data-alt-action='skip-gt']"
    ) as HTMLButtonElement | null;
    expect(skipGtButton).not.toBeNull();
    await clickElement(skipGtButton);

    await flushUi();
    expect(queryByText(view.container, "deal6")).toBeTruthy();

    await advance(1200);
    expect(queryByText(view.container, "passing")).toBeTruthy();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).not.toBeNull();
    expect(view.container.querySelectorAll("[data-zone='north_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='east_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='south_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='west_hand']")).toHaveLength(14);
    expect(
      view.container.querySelectorAll("[data-render-mode='r3f-hidden-hand']")
    ).toHaveLength(42);
    expect(
      view.container.querySelectorAll("[data-zone='north_hand'][data-render-mode='r3f-hidden-hand']")
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll("[data-zone='east_hand'][data-render-mode='r3f-hidden-hand']")
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll("[data-zone='west_hand'][data-render-mode='r3f-hidden-hand']")
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll("[data-zone='north_hand'] img")
    ).toHaveLength(0);
    expect(
      view.container.querySelectorAll("[data-zone='east_hand'] img")
    ).toHaveLength(0);
    expect(
      view.container.querySelectorAll("[data-zone='west_hand'] img")
    ).toHaveLength(0);
    expect(
      view.container.querySelector(
        "[data-zone='east_hand'][data-render-mode='r3f-hidden-hand'][data-facing-seat='east']"
      )
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        "[data-zone='west_hand'][data-render-mode='r3f-hidden-hand'][data-facing-seat='west']"
      )
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        "[data-zone='north_hand'][data-render-mode='r3f-hidden-hand'][data-facing-seat='north']"
      )
    ).toBeTruthy();

    const allCardImages = Array.from(
      view.container.querySelectorAll("[data-card-id] img")
    ) as HTMLImageElement[];
    expect(allCardImages.length).toBeGreaterThan(0);
    expect(
      allCardImages.every((image) => image.getAttribute("src")?.startsWith("/tv7/c/"))
    ).toBe(true);

    const passTargets = Array.from(
      view.container.querySelectorAll("[data-pass-id][data-arrow-direction]")
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

    const eastAcross = view.container.querySelector(
      "[data-pass-id='east_pass_across'][data-arrow-direction]"
    ) as HTMLElement | null;
    const eastNorth = view.container.querySelector(
      "[data-pass-id='east_pass_north'][data-arrow-direction]"
    ) as HTMLElement | null;
    const westAcross = view.container.querySelector(
      "[data-pass-id='west_pass_across'][data-arrow-direction]"
    ) as HTMLElement | null;
    const westSouth = view.container.querySelector(
      "[data-pass-id='west_pass_south'][data-arrow-direction]"
    ) as HTMLElement | null;
    expect(Number(eastAcross?.dataset.rotation)).toBe(90);
    expect(Number(westAcross?.dataset.rotation)).toBe(90);
    expect(Number(eastNorth?.dataset.rotation)).toBe(-90);
    expect(Number(westSouth?.dataset.rotation)).toBe(90);

    const confirmPassButton = view.container.querySelector(
      "button[data-alt-action='confirm-pass']"
    ) as HTMLButtonElement | null;
    expect(confirmPassButton?.disabled).toBe(true);

    const southCards = Array.from(
      view.container.querySelectorAll("[data-zone='south_hand'][data-card-id]")
    ) as HTMLButtonElement[];
    await clickElement(southCards[0]);
    await clickElement(southCards[1]);
    await clickElement(southCards[2]);
    await flushUi();

    const southTargets = [
      view.container.querySelector("[data-pass-id='south_pass_left'][data-arrow-direction]"),
      view.container.querySelector("[data-pass-id='south_pass_across'][data-arrow-direction]"),
      view.container.querySelector("[data-pass-id='south_pass_right'][data-arrow-direction]")
    ] as HTMLButtonElement[];
    await clickElement(southTargets[0]);
    await clickElement(southTargets[1]);
    await clickElement(southTargets[2]);
    await flushUi();

    expect(confirmPassButton?.disabled).toBe(false);
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

    const snapshotFactory = (window as typeof window & {
      __tichuV7Snapshot?: () => Tv7Snapshot;
    }).__tichuV7Snapshot;
    expect(typeof snapshotFactory).toBe("function");

    const snapshot = snapshotFactory?.();
    expect(snapshot?.assetRoot).toBe("/tv7");
    expect(snapshot?.table.src).toBe("/tv7/t/plate.png");
    expect(snapshot?.cardLayout.src).toBe("/tv7/h/a.json");
    expect(snapshot?.cardLayout.layoutSource).toBe("prototype_layer");
    expect(snapshot?.passing.overlaySrc).toBe("/tv7/p/o.png");
    expect(snapshot?.phase).toBe("passing");
    expect(snapshot?.cards.usingImageAssets).toBe(true);
    expect(snapshot?.cards.placeholders).toBe(false);
    expect(snapshot?.deal.counts.north).toBe(14);
    expect(snapshot?.deal.counts.east).toBe(14);
    expect(snapshot?.deal.counts.south).toBe(14);
    expect(snapshot?.deal.counts.west).toBe(14);
    expect(snapshot?.deal.counts.deckRemaining).toBe(0);
    expect(snapshot?.passing.anchors).toHaveLength(12);
    expect(snapshot?.cardLayout.anchors).toHaveLength(58);
    expect(snapshot?.cards.sampleSrcs.every((src) => src.startsWith("/tv7/c/"))).toBe(
      true
    );

    const snapshotPass = snapshot?.passing.anchors.find(
      (anchor) => anchor.id === "east_pass_across"
    );
    expect(snapshotPass?.arrow_direction).toBe("west");
    expect(snapshotPass?.orientation).toBe("landscape");
    expect(snapshotPass?.rotation).toBe(90);
    expect(snapshotPass?.screen_bbox.x).toBeCloseTo(
      passPayload.anchors.find((anchor) => anchor.id === "east_pass_across")?.bbox_px.x ?? 0,
      0
    );

    const snapshotCard = snapshot?.cardLayout.anchors.find(
      (anchor) => anchor.id === "south_01"
    );
    expect(snapshotCard?.screen_bbox.width).toBeCloseTo(
      handPayload.anchors.find((anchor) => anchor.id === "south_01")?.bbox_px.w ?? 0,
      0
    );

    await clickElement(confirmPassButton);
    await flushUi();
    expect(queryByText(view.container, "passed")).toBeTruthy();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).toBeNull();

    view.unmount();
  });
});
