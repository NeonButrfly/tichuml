// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: unknown }) =>
    createElement("div", { "data-mock-r3f-canvas": "true" }, children),
  useLoader: () => ({
    anisotropy: 0,
    colorSpace: 0,
    magFilter: 0,
    minFilter: 0
  })
}));

vi.mock("@react-three/drei", () => ({
  OrthographicCamera: () => null
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type FetchJsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type AltTableSnapshot = {
  assetRoot: string;
  phase: string;
  renderer: string;
  table: {
    src: string;
    mode: string;
  };
  cardLayout: {
    src: string;
    layoutSource: string;
    anchors: Array<{
      id: string;
      zone: string;
      seat: string;
      renderMode: string;
    }>;
  };
  passing: {
    overlaySrc: string;
    anchors: Array<{
      id: string;
      arrow_direction: string;
      orientation: string;
      rotation: number;
    }>;
  };
  cards: {
    layoutSource: string;
    bySeat: Record<string, number>;
    north: { renderMode: string; hiddenBottomPx: number; mostlyVisible: boolean };
    east: {
      renderMode: string;
      usesPolygonWarping: boolean;
      usesNormalImageSprites: boolean;
    };
    west: {
      renderMode: string;
      usesPolygonWarping: boolean;
      usesNormalImageSprites: boolean;
    };
    south: { renderMode: string };
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
  }>;
};

const handPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/h/a.json"), "utf8")
) as {
  anchors: Array<Record<string, unknown>>;
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

    if (pathname === "/tv_ed/t/plate.png" || pathname === "/tv7/p/o.png") {
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

    if (pathname.startsWith("/tv_ed/h/prev/")) {
      this.naturalWidth = 1536;
      this.naturalHeight = 1024;
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
  Object.defineProperty(window, "__tichuAltTableSnapshot", {
    configurable: true,
    writable: true,
    value: null
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
  it("boots directly into the authored passing layout instead of stopping in the GT demo flow", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, {}));

    await flushUi();
    await flushUi();

    expect(queryByText(view.container, "PASSING")).toBeTruthy();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).toBeTruthy();
    expect(view.container.querySelectorAll("[data-zone='north_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='east_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='south_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='west_hand']")).toHaveLength(14);
    expect(
      view.container.querySelector("button[data-alt-action='call-gt']")
    ).toBeNull();
    expect(
      view.container.querySelector("button[data-alt-action='skip-gt']")
    ).toBeNull();

    const snapshotFactory = (window as typeof window & {
      __tichuAltTableSnapshot?: () => AltTableSnapshot;
    }).__tichuAltTableSnapshot;
    const snapshot = snapshotFactory?.();

    expect(snapshot?.phase).toBe("passing");
    expect(snapshot?.cards.bySeat.north).toBe(14);
    expect(snapshot?.cards.bySeat.east).toBe(14);
    expect(snapshot?.cards.bySeat.south).toBe(14);
    expect(snapshot?.cards.bySeat.west).toBe(14);
    expect(snapshot?.deal.counts.deckRemaining).toBe(0);

    view.unmount();
  });

  it("renders the v18 plane-overlay table flow with readable side racks and a truthful snapshot", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, {}));

    await flushUi();
    await flushUi();

    expect(view.container.querySelector("[data-testid='alt-table-3d']")).toBeTruthy();
    expect(
      view.container.querySelector("[data-alt-table-renderer='react-three-fiber']")
    ).toBeTruthy();

    const tableImage = view.container.querySelector(
      "img[data-table-layer='plate']"
    ) as HTMLImageElement | null;
    expect(tableImage?.getAttribute("src")).toBe("/tv_ed/t/plate.png");

    expect(queryByText(view.container, "PASSING")).toBeTruthy();
    expect(view.container.querySelectorAll("[data-zone='north_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='east_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='south_hand']")).toHaveLength(14);
    expect(view.container.querySelectorAll("[data-zone='west_hand']")).toHaveLength(14);

    const hiddenHands = Array.from(
      view.container.querySelectorAll("[data-render-mode='r3f-hidden-hand']")
    ) as HTMLElement[];
    expect(hiddenHands).toHaveLength(42);
    expect(
      hiddenHands.every(
        (card) => card.getAttribute("data-uses-polygon-warping") === "false"
      )
    ).toBe(true);
    expect(
      Array.from(view.container.querySelectorAll("[data-zone='east_hand']")).every(
        (card) => card.getAttribute("data-card-render-mode") === "side_rack_readable_fan"
      )
    ).toBe(true);
    expect(
      Array.from(view.container.querySelectorAll("[data-zone='west_hand']")).every(
        (card) => card.getAttribute("data-card-render-mode") === "side_rack_readable_fan"
      )
    ).toBe(true);
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).toBeTruthy();
    expect(
      view.container.querySelectorAll("[data-zone='north_hand'][data-card-render-mode='north_rack_back_mostly_visible']")
    ).toHaveLength(14);

    const passTargets = Array.from(
      view.container.querySelectorAll("[data-pass-id][data-arrow-direction]")
    ) as HTMLElement[];
    expect(passTargets).toHaveLength(12);

    for (const target of passTargets) {
      const passId = target.dataset.passId as keyof typeof expectedPassMap;
      const expected = expectedPassMap[passId];
      expect(target.dataset.arrowDirection).toBe(expected.dir);
      expect(target.dataset.orientation).toBe(expected.orientation);
      expect(Number(target.dataset.rotation)).toBe(expected.rot);
    }

    const confirmPassButton = view.container.querySelector(
      "button[data-alt-action='confirm-pass']"
    ) as HTMLButtonElement | null;
    expect(confirmPassButton?.disabled).toBe(true);

    const southHandButtons = Array.from(
      view.container.querySelectorAll("[data-zone='south_hand'][data-card-id]")
    ) as HTMLButtonElement[];
    await clickElement(southHandButtons[0]);
    await clickElement(southHandButtons[1]);
    await clickElement(southHandButtons[2]);
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

    const snapshotFactory = (window as typeof window & {
      __tichuAltTableSnapshot?: () => AltTableSnapshot;
    }).__tichuAltTableSnapshot;
    expect(typeof snapshotFactory).toBe("function");

    const snapshot = snapshotFactory?.();
    expect(snapshot?.assetRoot).toBe("/tv7");
    expect(snapshot?.renderer).toBe("react-three-fiber");
    expect(snapshot?.table.src).toBe("/tv_ed/t/plate.png");
    expect(snapshot?.table.mode).toBe("single_image_plane");
    expect(snapshot?.cardLayout.src).toBe("v18CardRackMath");
    expect(snapshot?.cardLayout.layoutSource).toBe("v18_math");
    expect(snapshot?.passing.overlaySrc).toBe("/tv7/p/o.png");
    expect(snapshot?.phase).toBe("passing");
    expect(snapshot?.cards.layoutSource).toBe("v18_math");
    expect(snapshot?.cards.bySeat.north).toBe(14);
    expect(snapshot?.cards.bySeat.east).toBe(14);
    expect(snapshot?.cards.bySeat.south).toBe(14);
    expect(snapshot?.cards.bySeat.west).toBe(14);
    expect(snapshot?.cards.north.renderMode).toBe("north_rack_back_mostly_visible");
    expect(snapshot?.cards.north.hiddenBottomPx).toBeLessThanOrEqual(16);
    expect(snapshot?.cards.east.renderMode).toBe("side_rack_readable_fan");
    expect(snapshot?.cards.east.usesPolygonWarping).toBe(false);
    expect(snapshot?.cards.east.usesNormalImageSprites).toBe(true);
    expect(snapshot?.cards.west.renderMode).toBe("side_rack_readable_fan");
    expect(snapshot?.cards.west.usesPolygonWarping).toBe(false);
    expect(snapshot?.cards.south.renderMode).toBe("south_player_fan");
    expect(snapshot?.passing.anchors).toHaveLength(12);
    expect(snapshot?.cardLayout.anchors).toHaveLength(56);
    expect(snapshot?.deal.counts.deckRemaining).toBe(0);

    const eastAnchors = snapshot?.cardLayout.anchors.filter(
      (anchor) => anchor.zone === "east_hand"
    );
    expect(
      eastAnchors?.every(
        (anchor) =>
          anchor.renderMode === "side_rack_readable_fan" &&
          Math.abs(anchor.rotation_deg) < 30
      )
    ).toBe(true);

    await clickElement(confirmPassButton);
    await flushUi();
    expect(view.container.querySelector("img[data-table-layer='passing-overlay']")).toBeNull();

    view.unmount();
  });
});
