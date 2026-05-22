// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  computeNormalViewportLayoutMetrics,
  DEFAULT_NORMAL_TABLE_LAYOUT,
  resolveNormalPlaySurfaceRegionStyle
} from "../../apps/web/src/table-layout";

vi.mock("pixi.js", () => ({
  Container: class Container {},
  Graphics: class Graphics {
    clear() {
      return this;
    }
    roundRect() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
  },
  Sprite: class Sprite {},
  Texture: {
    from(source: string) {
      return { source };
    }
  }
}));

vi.mock("@pixi/react", async () => {
  const react = await import("react");

  return {
    Application({
      children,
      width,
      height
    }: {
      children?: ReactElement | ReactElement[] | null;
      width?: number;
      height?: number;
    }) {
      return react.createElement(
        "div",
        { "data-pixi-application": "true" },
        react.createElement("canvas", {
          width,
          height
        }),
        children
      );
    },
    extend() {
      return undefined;
    }
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

describe("TableGraphicsLayer", () => {
  it("anchors a bounded pixi host to the canonical play surface", async () => {
    const { TableGraphicsLayer } = await import(
      "../../apps/web/src/table-graphics-layer"
    );
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 14,
      bottomCount: 14,
      leftCount: 14,
      rightCount: 14,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const expectedRegionStyle = resolveNormalPlaySurfaceRegionStyle({
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics
    });
    const view = render(
      createElement(TableGraphicsLayer, {
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics,
        activeSeatPosition: "bottom",
        wishActive: false
      })
    );

    try {
      const host = view.container.querySelector(
        '[data-testid="table-graphics-layer"]'
      );
      const canvas = view.container.querySelector(
        '[data-testid="table-graphics-layer"] canvas'
      );
      const pixiContainer = view.container.querySelector(
        '[data-testid="table-graphics-layer"] [data-pixi-node="container"]'
      );
      const pixiGraphics = view.container.querySelectorAll(
        '[data-testid="table-graphics-layer"] [data-pixi-node="graphics"]'
      );
      const pixiSprites = view.container.querySelectorAll(
        '[data-testid="table-graphics-layer"] [data-pixi-node="sprite"]'
      );

      expect(host).not.toBeNull();
      expect(host?.getAttribute("aria-hidden")).toBe("true");
      expect(host?.getAttribute("data-table-graphics-layer")).toBe("true");
      expect(host?.getAttribute("data-active-seat")).toBe("bottom");
      expect(host).toHaveProperty("style.left", expectedRegionStyle.left);
      expect(host).toHaveProperty("style.top", expectedRegionStyle.top);
      expect(host).toHaveProperty("style.width", expectedRegionStyle.width);
      expect(host).toHaveProperty("style.height", expectedRegionStyle.height);
      expect(host).toHaveProperty("style.position", "absolute");
      expect(host).toHaveProperty("style.pointerEvents", "none");
      expect(host?.getAttribute("data-graphics-assets")).toBe(
        "table-felt,table-rim,card-back"
      );
      expect(canvas).not.toBeNull();
      expect(canvas?.getAttribute("width")).toBe(
        expectedRegionStyle.width?.replace("px", "")
      );
      expect(canvas?.getAttribute("height")).toBe(
        expectedRegionStyle.height?.replace("px", "")
      );
      expect(pixiContainer).not.toBeNull();
      expect(pixiGraphics).toHaveLength(1);
      expect(pixiSprites).toHaveLength(3);
    } finally {
      view.unmount();
    }
  });
});
