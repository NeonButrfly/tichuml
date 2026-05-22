import {
  createElement,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  Container as PixiContainer,
  Graphics as PixiGraphics,
  Sprite as PixiSprite,
  Texture
} from "pixi.js";
import type {
  NormalTableLayout,
  SeatVisualPosition,
  NormalViewportLayoutMetrics
} from "./table-layout";
import {
  resolveNormalPlaySurfaceRegionStyle
} from "./table-layout";
import { TABLE_GRAPHICS_ASSETS } from "./table-graphics-assets";

const IS_JSDOM =
  typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);

type PixiApplicationComponent = (
  props: PixiNodeProps & { width?: number; height?: number }
) => ReactNode;

type PixiNodeProps = Record<string, unknown> & {
  children?: ReactNode;
};

function JsdomApplication({
  children,
  width,
  height
}: PixiNodeProps & {
  width?: number;
  height?: number;
}) {
  return createElement(
    "div",
    { "data-pixi-application": "true" },
    createElement("canvas", {
      width,
      height
    }),
    children
  );
}

function Container(props: PixiNodeProps) {
  if (IS_JSDOM) {
    const { children, eventMode, ...rest } = props;

    return createElement(
      "div",
      {
        ...rest,
        "data-pixi-node": "container",
        "data-event-mode": String(eventMode ?? "")
      },
      children
    );
  }

  return createElement("pixiContainer", props);
}

function Graphics(props: PixiNodeProps & { draw?: unknown }) {
  if (IS_JSDOM) {
    const { draw, ...rest } = props;
    return createElement("div", {
      ...rest,
      "data-pixi-node": "graphics",
      "data-has-draw": typeof draw === "function" ? "true" : "false"
    });
  }

  return createElement("pixiGraphics", props);
}

function Sprite(props: PixiNodeProps) {
  if (IS_JSDOM) {
    return createElement("div", {
      ...props,
      "data-pixi-node": "sprite"
    });
  }

  return createElement("pixiSprite", props);
}

export type TableGraphicsLayerProps = {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  activeSeatPosition: SeatVisualPosition | null;
  wishActive: boolean;
};

function parseCssPixels(value: string | number | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function resolveCardBackSize(layoutMetrics: NormalViewportLayoutMetrics) {
  return {
    width: Math.max(28, Math.round(layoutMetrics.cardWidth * 0.88)),
    height: Math.max(40, Math.round(layoutMetrics.cardHeight * 0.88))
  };
}

function drawSurfaceFrame(
  graphics: PixiGraphics,
  width: number,
  height: number
) {
  const rimInset = Math.max(3, Math.round(Math.min(width, height) * 0.024));
  const innerInset = rimInset * 2;
  const rimRadius = Math.max(18, Math.round(height * 0.14));
  const innerRadius = Math.max(12, rimRadius - Math.round(rimInset * 0.75));

  graphics.clear();

  graphics.roundRect(0, 0, width, height, rimRadius);
  graphics.fill({
    color: 0x0f241b,
    alpha: 0.12
  });
  graphics.stroke({
    color: 0xe3c89e,
    alpha: 0.28,
    width: rimInset
  });

  graphics.roundRect(
    innerInset,
    innerInset,
    Math.max(1, width - innerInset * 2),
    Math.max(1, height - innerInset * 2),
    innerRadius
  );
  graphics.stroke({
    color: 0xf5e7cf,
    alpha: 0.12,
    width: Math.max(1, Math.round(rimInset * 0.3))
  });
}

function usePixiReactModule() {
  const [applicationComponent, setApplicationComponent] =
    useState<PixiApplicationComponent | null>(null);

  useEffect(() => {
    if (IS_JSDOM) {
      return;
    }

    let cancelled = false;

    void import("@pixi/react").then((pixiReactModule) => {
      if (cancelled) {
        return;
      }

      pixiReactModule.extend({
        Container: PixiContainer,
        Graphics: PixiGraphics,
        Sprite: PixiSprite
      });

      setApplicationComponent(() => pixiReactModule.Application);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return applicationComponent;
}

export function TableGraphicsLayer({
  normalTableLayout,
  layoutMetrics,
  activeSeatPosition,
  wishActive
}: TableGraphicsLayerProps) {
  const browserApplication = usePixiReactModule();
  const hostStyle: CSSProperties = {
    ...resolveNormalPlaySurfaceRegionStyle({
      normalTableLayout,
      layoutMetrics
    }),
    pointerEvents: "none",
    overflow: "hidden",
    isolation: "isolate"
  };
  const surfaceWidth = parseCssPixels(hostStyle.width);
  const surfaceHeight = parseCssPixels(hostStyle.height);
  const cardBackSize = resolveCardBackSize(layoutMetrics);
  const feltTexture = IS_JSDOM
    ? TABLE_GRAPHICS_ASSETS.tableFelt
    : Texture.from(TABLE_GRAPHICS_ASSETS.tableFelt);
  const rimTexture = IS_JSDOM
    ? TABLE_GRAPHICS_ASSETS.tableRim
    : Texture.from(TABLE_GRAPHICS_ASSETS.tableRim);
  const cardBackTexture = IS_JSDOM
    ? TABLE_GRAPHICS_ASSETS.cardBack
    : Texture.from(TABLE_GRAPHICS_ASSETS.cardBack);
  const cardBackAlpha = wishActive ? 0.46 : 0.32;
  const ApplicationComponent = IS_JSDOM ? JsdomApplication : browserApplication;

  return (
    <div
      aria-hidden="true"
      data-testid="table-graphics-layer"
      data-table-graphics-layer="true"
      data-layout-container="table-graphics-layer"
      data-active-seat={activeSeatPosition ?? "none"}
      data-graphics-assets="table-felt,table-rim,card-back"
      style={hostStyle}
    >
      {ApplicationComponent ? (
        <ApplicationComponent
          antialias
          autoStart={false}
          backgroundAlpha={0}
          height={surfaceHeight}
          preference="webgl"
          sharedTicker
          width={surfaceWidth}
        >
          <Container eventMode="none">
            <Graphics
              draw={(graphics) =>
                drawSurfaceFrame(graphics as PixiGraphics, surfaceWidth, surfaceHeight)
              }
            />
            <Sprite
              alpha={0.42}
              height={surfaceHeight}
              texture={feltTexture}
              width={surfaceWidth}
              x={0}
              y={0}
            />
            <Sprite
              alpha={0.7}
              height={surfaceHeight}
              texture={rimTexture}
              width={surfaceWidth}
              x={0}
              y={0}
            />
            <Sprite
              alpha={cardBackAlpha}
              anchor={0.5}
              angle={-8}
              height={cardBackSize.height}
              texture={cardBackTexture}
              width={cardBackSize.width}
              x={surfaceWidth / 2}
              y={surfaceHeight / 2}
            />
          </Container>
        </ApplicationComponent>
      ) : null}
    </div>
  );
}
