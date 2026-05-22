import { useEffect, useRef } from "react";
import type {
  AlternatePassRoutePlacement,
  AlternateTableLayout,
  Point,
  Rect
} from "./layout";

type PixiModule = typeof import("pixi.js");

type PixiRuntime = {
  PIXI: PixiModule;
  app: import("pixi.js").Application;
  root: import("pixi.js").Container;
};

type AlternateTablePixiSurfaceProps = {
  layout: AlternateTableLayout;
  showPassRoutes: boolean;
  phaseLabel: string;
  trickHasCards: boolean;
};

function drawPolygon(
  graphics: import("pixi.js").Graphics,
  points: readonly Point[],
  fill: number,
  alpha = 1
) {
  graphics.poly(points.flatMap((entry) => [entry.x, entry.y]));
  graphics.fill({ color: fill, alpha });
}

function drawRectFrame(
  graphics: import("pixi.js").Graphics,
  rect: Rect,
  fill: number,
  stroke: number,
  radius: number,
  alpha = 1
) {
  graphics.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  graphics.fill({ color: fill, alpha });
  graphics.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  graphics.stroke({ color: stroke, alpha: 0.95, width: Math.max(1.5, rect.height * 0.035) });
}

function drawArrowGlyph(
  graphics: import("pixi.js").Graphics,
  route: AlternatePassRoutePlacement
) {
  const centerX = route.rect.x + route.rect.width / 2;
  const centerY = route.rect.y + route.rect.height / 2;
  const lineLength =
    route.direction === "left" || route.direction === "right"
      ? route.rect.width * 0.38
      : route.rect.height * 0.38;
  const head = Math.min(route.rect.width, route.rect.height) * 0.16;

  let x1 = centerX;
  let y1 = centerY;
  let x2 = centerX;
  let y2 = centerY;

  if (route.direction === "left") {
    x1 += lineLength / 2;
    x2 -= lineLength / 2;
  } else if (route.direction === "right") {
    x1 -= lineLength / 2;
    x2 += lineLength / 2;
  } else if (route.direction === "up") {
    y1 += lineLength / 2;
    y2 -= lineLength / 2;
  } else {
    y1 -= lineLength / 2;
    y2 += lineLength / 2;
  }

  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);

  if (route.direction === "left") {
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 + head, y2 - head * 0.9);
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 + head, y2 + head * 0.9);
  } else if (route.direction === "right") {
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 - head, y2 - head * 0.9);
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 - head, y2 + head * 0.9);
  } else if (route.direction === "up") {
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 - head * 0.9, y2 + head);
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 + head * 0.9, y2 + head);
  } else {
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 - head * 0.9, y2 - head);
    graphics.moveTo(x2, y2);
    graphics.lineTo(x2 + head * 0.9, y2 - head);
  }
}

function renderSurface(runtime: PixiRuntime, props: AlternateTablePixiSurfaceProps) {
  const { PIXI, root } = runtime;
  const { Graphics, Text, TextStyle } = PIXI;

  root.removeChildren().forEach((child) => child.destroy({ children: true }));

  const board = new Graphics();
  const shadow = new Graphics();
  const embellishments = new Graphics();
  const routeFrames = new Graphics();

  const pocketRadius = props.layout.boardRect.height * 0.06;
  const outerFelt = props.layout.outerFelt;
  const innerFelt = props.layout.innerFelt;

  drawRectFrame(
    shadow,
    {
      x: props.layout.boardRect.x + 8,
      y: props.layout.boardRect.y + 14,
      width: props.layout.boardRect.width,
      height: props.layout.boardRect.height
    },
    0x0e0905,
    0x0e0905,
    46,
    0.55
  );

  drawRectFrame(board, props.layout.boardRect, 0x5a3119, 0x8b5a31, 44, 1);
  drawRectFrame(
    board,
    {
      x: props.layout.boardRect.x + props.layout.boardRect.width * 0.026,
      y: props.layout.boardRect.y + props.layout.boardRect.height * 0.034,
      width: props.layout.boardRect.width * 0.948,
      height: props.layout.boardRect.height * 0.928
    },
    0x70401f,
    0xb18453,
    38,
    1
  );

  [0, 1, 2, 3].forEach((index) => {
    const x =
      index % 2 === 0
        ? props.layout.boardRect.x + pocketRadius * 0.9
        : props.layout.boardRect.x + props.layout.boardRect.width - pocketRadius * 0.9;
    const y =
      index < 2
        ? props.layout.boardRect.y + pocketRadius * 0.92
        : props.layout.boardRect.y + props.layout.boardRect.height - pocketRadius * 0.92;
    board.circle(x, y, pocketRadius);
    board.fill({ color: 0x4a2613, alpha: 1 });
    board.circle(x, y, pocketRadius * 0.72);
    board.fill({ color: 0x22130c, alpha: 1 });
  });

  drawPolygon(board, outerFelt, 0x134d3d, 1);
  drawPolygon(embellishments, innerFelt, 0x0d3328, 0.96);

  const innerBorder = new Graphics();
  innerBorder.poly(innerFelt.flatMap((entry) => [entry.x, entry.y]));
  innerBorder.stroke({ color: 0xa67d3d, alpha: 0.68, width: 2 });

  const center = props.layout.centerEmblemRect;
  embellishments.circle(center.x + center.width / 2, center.y + center.height / 2, center.width * 0.48);
  embellishments.stroke({ color: 0xa67d3d, alpha: 0.66, width: 2.4 });
  embellishments.circle(center.x + center.width / 2, center.y + center.height / 2, center.width * 0.34);
  embellishments.stroke({ color: 0xa67d3d, alpha: 0.4, width: 1.5 });

  drawRectFrame(
    embellishments,
    props.layout.trickRect,
    props.trickHasCards ? 0x123d31 : 0x0f3027,
    0x88704a,
    28,
    0.92
  );
  drawRectFrame(
    embellishments,
    props.layout.statusRect,
    0x10251d,
    0x897146,
    18,
    0.96
  );
  drawRectFrame(
    embellishments,
    props.layout.scoreRect,
    0x101d18,
    0x8f7344,
    18,
    0.98
  );
  drawRectFrame(
    embellishments,
    props.layout.southControlRect,
    0x3e2413,
    0x7c5930,
    20,
    0.92
  );

  if (props.showPassRoutes) {
    props.layout.passRoutes.forEach((route) => {
      routeFrames.roundRect(
        route.rect.x,
        route.rect.y,
        route.rect.width,
        route.rect.height,
        14
      );
      routeFrames.fill({
        color: route.occupied ? 0x182c29 : 0x11231d,
        alpha: route.displayMode === "pickup" ? 0.82 : 0.74
      });
      routeFrames.roundRect(
        route.rect.x,
        route.rect.y,
        route.rect.width,
        route.rect.height,
        14
      );
      routeFrames.stroke({
        color: route.interactive ? 0xc39c54 : 0x7e6b43,
        alpha: 0.92,
        width: route.interactive ? 2.4 : 1.6
      });
      drawArrowGlyph(routeFrames, route);
      routeFrames.stroke({
        color: route.interactive ? 0xf0cb76 : 0x9f814c,
        alpha: 0.9,
        width: 2
      });
    });
  }

  const centerTitle = new Text({
    text: "TICHU",
    style: new TextStyle({
      fill: 0xc49a56,
      fontFamily: "Georgia, serif",
      fontSize: Math.max(18, props.layout.boardRect.height * 0.035),
      fontWeight: "700",
      letterSpacing: 5
    })
  });
  centerTitle.anchor.set(0.5);
  centerTitle.position.set(
    props.layout.boardRect.x + props.layout.boardRect.width / 2,
    props.layout.boardRect.y + props.layout.boardRect.height * 0.135
  );

  const phaseText = new Text({
    text: props.phaseLabel.toUpperCase(),
    style: new TextStyle({
      fill: 0xe8dfc7,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: Math.max(13, props.layout.boardRect.height * 0.018),
      fontWeight: "700",
      letterSpacing: 2
    })
  });
  phaseText.anchor.set(0.5);
  phaseText.position.set(
    props.layout.statusRect.x + props.layout.statusRect.width / 2,
    props.layout.statusRect.y + props.layout.statusRect.height / 2
  );

  root.addChild(shadow, board, embellishments, innerBorder, routeFrames, centerTitle, phaseText);
}

export function AlternateTablePixiSurface(
  props: AlternateTablePixiSurfaceProps
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!containerRef.current) {
        return;
      }
      if (navigator.userAgent.includes("jsdom")) {
        return;
      }
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("2d")) {
        return;
      }

      const PIXI = await import("pixi.js");
      if (cancelled || !containerRef.current) {
        return;
      }

      const app = new PIXI.Application();
      await app.init({
        resizeTo: containerRef.current,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2)
      });
      app.canvas.className = "alternate-pixi-surface__canvas";
      containerRef.current.append(app.canvas);

      const root = new PIXI.Container();
      app.stage.addChild(root);
      runtimeRef.current = { PIXI, app, root };
      renderSurface(runtimeRef.current, props);
    }

    void setup();

    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (!runtime) {
        return;
      }
      runtime.root.removeChildren().forEach((child) => child.destroy({ children: true }));
      runtime.app.destroy(undefined, { children: true });
      runtime.app.canvas.remove();
    };
  }, []);

  useEffect(() => {
    if (runtimeRef.current) {
      renderSurface(runtimeRef.current, props);
    }
  }, [props]);

  return <div ref={containerRef} className="alternate-pixi-surface" aria-hidden="true" />;
}
