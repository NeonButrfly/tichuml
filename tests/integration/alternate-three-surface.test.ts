// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ImmersiveSceneModel } from "../../apps/web/src/alternate-table/scene-model";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) =>
    createElement("div", { "data-mock-canvas": "true" }, children)
}));

vi.mock("@react-three/drei", () => ({
  ContactShadows: (props: Record<string, unknown>) =>
    createElement("mock-contact-shadows", props),
  Line: (props: Record<string, unknown>) => createElement("mock-line", props),
  RoundedBox: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
  } & Record<string, unknown>) => createElement("mock-rounded-box", props, children)
}));

function render(element: React.ReactElement) {
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

beforeAll(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 Chrome/148.0.0.0 Safari/537.36",
    configurable: true
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => ({
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      fillRect: () => undefined,
      strokeRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      arcTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
      ellipse: () => undefined,
      arc: () => undefined,
      lineTo: () => undefined,
      bezierCurveTo: () => undefined,
      fillText: () => undefined,
      strokeText: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      scale: () => undefined,
      clearRect: () => undefined,
      drawImage: () => undefined,
      set fillStyle(_: string) {},
      set strokeStyle(_: string) {},
      set lineWidth(_: number) {},
      set font(_: string) {},
      set textAlign(_: CanvasTextAlign) {},
      set textBaseline(_: CanvasTextBaseline) {},
      set globalAlpha(_: number) {}
    }),
    configurable: true
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AlternateTableThreeSurface", () => {
  it("renders left and right remote hands without crashing", async () => {
    const { AlternateTableThreeSurface } = await import(
      "../../apps/web/src/alternate-table/three-surface"
    );

    const model: ImmersiveSceneModel = {
      geometry: {
        viewportWidth: 1366,
        viewportHeight: 768,
        sceneCenterX: 683,
        sceneCenterY: 410,
        tableRadiusX: 520,
        tableRadiusY: 260,
        tableNearY: 718,
        tableFarY: 168
      },
      cameraYaw: 0,
      phaseLabel: "Exchange",
      currentWishLabel: "None",
      hintLabel: "Your turn",
      score: {
        we: 0,
        they: 0,
        pose: {
          screenX: 930,
          screenY: 160,
          scale: 0.6,
          rotation: 0,
          depth: 1,
          shadowX: 0,
          shadowY: 0,
          shadowBlur: 0
        }
      },
      statusPose: {
        screenX: 683,
        screenY: 120,
        scale: 0.7,
        rotation: 0,
        depth: 1,
        shadowX: 0,
        shadowY: 0,
        shadowBlur: 0
      },
      seats: [],
      remoteCards: [
        {
          key: "west-1",
          card: { id: "west-card", kind: "standard", suit: "jade", rank: 7 },
          position: "left",
          pose: {
            screenX: 220,
            screenY: 300,
            scale: 0.6,
            rotation: 0,
            depth: 1,
            shadowX: 0,
            shadowY: 0,
            shadowBlur: 0
          },
          width: 48,
          height: 68,
          faceDown: true
        },
        {
          key: "east-1",
          card: { id: "east-card", kind: "standard", suit: "star", rank: 9 },
          position: "right",
          pose: {
            screenX: 1140,
            screenY: 300,
            scale: 0.6,
            rotation: 0,
            depth: 1,
            shadowX: 0,
            shadowY: 0,
            shadowBlur: 0
          },
          width: 48,
          height: 68,
          faceDown: true
        }
      ],
      southCards: [],
      trickCards: [],
      passRoutes: []
    };

    expect(() =>
      render(createElement(AlternateTableThreeSurface, { model }))
    ).not.toThrow();
  });
});
