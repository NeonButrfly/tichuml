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

function drawInsetTray(
  graphics: import("pixi.js").Graphics,
  rect: Rect,
  radius: number
) {
  drawRectFrame(graphics, rect, 0x2d160b, 0x7c5930, radius, 0.96);
  drawRectFrame(
    graphics,
    {
      x: rect.x + rect.width * 0.04,
      y: rect.y + rect.height * 0.07,
      width: rect.width * 0.92,
      height: rect.height * 0.86
    },
    0x143529,
    0x8f7344,
    Math.max(12, radius * 0.76),
    0.92
  );
}

function drawTokenWell(
  graphics: import("pixi.js").Graphics,
  rect: Rect,
  radius: number
) {
  drawRectFrame(graphics, rect, 0x2b170d, 0x8d6d3f, radius, 0.98);
  drawRectFrame(
    graphics,
    {
      x: rect.x + rect.width * 0.08,
      y: rect.y + rect.height * 0.08,
      width: rect.width * 0.84,
      height: rect.height * 0.84
    },
    0xa78549,
    0xd9bb78,
    Math.max(6, radius * 0.72),
    0.95
  );
}

function drawPlaque(
  graphics: import("pixi.js").Graphics,
  rect: Rect,
  radius: number
) {
  drawRectFrame(graphics, rect, 0x4d2b16, 0x8f6738, radius, 0.98);
  drawRectFrame(
    graphics,
    {
      x: rect.x + rect.width * 0.05,
      y: rect.y + rect.height * 0.12,
      width: rect.width * 0.9,
      height: rect.height * 0.76
    },
    0x2e180d,
    0xd6b16e,
    Math.max(8, radius * 0.7),
    0.98
  );
}

function createRect(
  x: number,
  y: number,
  width: number,
  height: number
): Rect {
  return { x, y, width, height };
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
  const ornaments = new Graphics();
  const railDetails = new Graphics();
  const ornamentArc = new Graphics();
  const trays = new Graphics();
  const routeLayer = new PIXI.Container();
  const railLabelLayer = new PIXI.Container();

  const pocketRadius = props.layout.boardRect.height * 0.048;
  const outerFelt = props.layout.outerFelt;
  const innerFelt = props.layout.innerFelt;

  drawRectFrame(
    shadow,
    {
      x: props.layout.boardRect.x + 6,
      y: props.layout.boardRect.y + 10,
      width: props.layout.boardRect.width,
      height: props.layout.boardRect.height
    },
    0x0e0905,
    0x0e0905,
    46,
    0.55
  );

  drawRectFrame(board, props.layout.boardRect, 0x5a3119, 0x8b5a31, 40, 1);
  drawRectFrame(
    board,
    {
      x: props.layout.boardRect.x + props.layout.boardRect.width * 0.014,
      y: props.layout.boardRect.y + props.layout.boardRect.height * 0.02,
      width: props.layout.boardRect.width * 0.972,
      height: props.layout.boardRect.height * 0.958
    },
    0x70401f,
    0xb18453,
    34,
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

  drawInsetTray(trays, props.layout.seats.top.rack, 24);
  drawInsetTray(trays, props.layout.seats.left.rack, 24);
  drawInsetTray(trays, props.layout.seats.right.rack, 24);
  drawInsetTray(trays, props.layout.seats.bottom.rack, 26);
  drawRectFrame(
    trays,
    props.layout.southControlRect,
    0x3a2112,
    0x86643a,
    22,
    0.98
  );

  const topGroove = createRect(
    props.layout.boardRect.x + props.layout.boardRect.width * 0.33,
    props.layout.boardRect.y + props.layout.boardRect.height * 0.034,
    props.layout.boardRect.width * 0.34,
    props.layout.boardRect.height * 0.034
  );
  const bottomGroove = createRect(
    props.layout.boardRect.x + props.layout.boardRect.width * 0.324,
    props.layout.boardRect.y + props.layout.boardRect.height * 0.874,
    props.layout.boardRect.width * 0.352,
    props.layout.boardRect.height * 0.048
  );
  drawInsetTray(railDetails, topGroove, 16);
  drawInsetTray(railDetails, bottomGroove, 20);

  const tileSize = props.layout.boardRect.height * 0.03;
  const leftTileBaseX = props.layout.boardRect.x + props.layout.boardRect.width * 0.05;
  const rightTileBaseX = props.layout.boardRect.x + props.layout.boardRect.width * 0.91;
  const upperTileY = props.layout.boardRect.y + props.layout.boardRect.height * 0.18;
  const lowerTileY = props.layout.boardRect.y + props.layout.boardRect.height * 0.74;
  [0, 1, 2].forEach((index) => {
    drawTokenWell(
      railDetails,
      createRect(
        leftTileBaseX,
        upperTileY + index * tileSize * 1.22,
        tileSize,
        tileSize
      ),
      6
    );
    drawTokenWell(
      railDetails,
      createRect(
        rightTileBaseX,
        lowerTileY + index * tileSize * 1.22,
        tileSize,
        tileSize
      ),
      6
    );
  });

  const frontPlaque = createRect(
    props.layout.boardRect.x + props.layout.boardRect.width * 0.424,
    props.layout.boardRect.y + props.layout.boardRect.height * 0.914,
    props.layout.boardRect.width * 0.152,
    props.layout.boardRect.height * 0.034
  );
  drawPlaque(railDetails, frontPlaque, 10);

  const feltGlow = new Graphics();
  feltGlow.poly(outerFelt.flatMap((entry) => [entry.x, entry.y]));
  feltGlow.stroke({ color: 0xd9b16b, alpha: 0.22, width: 2.2 });

  const innerBorder = new Graphics();
  innerBorder.poly(innerFelt.flatMap((entry) => [entry.x, entry.y]));
  innerBorder.stroke({ color: 0xa67d3d, alpha: 0.68, width: 2 });

  const center = props.layout.centerEmblemRect;
  ornaments.circle(center.x + center.width / 2, center.y + center.height / 2, center.width * 0.48);
  ornaments.stroke({ color: 0xa67d3d, alpha: 0.66, width: 2.4 });
  ornaments.circle(center.x + center.width / 2, center.y + center.height / 2, center.width * 0.34);
  ornaments.stroke({ color: 0xa67d3d, alpha: 0.4, width: 1.5 });
  ornamentArc.arc(
    center.x + center.width / 2,
    center.y + center.height / 2,
    center.width * 0.54,
    Math.PI * 0.16,
    Math.PI * 0.84
  );
  ornamentArc.stroke({ color: 0xc7a05d, alpha: 0.15, width: 2.2 });

  drawRectFrame(
    ornaments,
    props.layout.trickRect,
    props.trickHasCards ? 0x123d31 : 0x0f3027,
    0x88704a,
    28,
    0.92
  );
  drawRectFrame(
    ornaments,
    props.layout.statusRect,
    0x10251d,
    0x897146,
    18,
    0.96
  );
  drawRectFrame(
    ornaments,
    props.layout.scoreRect,
    0x101d18,
    0x8f7344,
    18,
    0.98
  );

  if (props.showPassRoutes) {
    props.layout.passRoutes.forEach((route) => {
      const routeFrame = new Graphics();

      routeFrame.roundRect(
        route.rect.x,
        route.rect.y,
        route.rect.width,
        route.rect.height,
        14
      );
      routeFrame.fill({
        color: route.occupied ? 0x182c29 : 0x11231d,
        alpha: route.displayMode === "pickup" ? 0.82 : 0.74
      });
      routeFrame.roundRect(
        route.rect.x,
        route.rect.y,
        route.rect.width,
        route.rect.height,
        14
      );
      routeFrame.stroke({
        color: route.interactive ? 0xc39c54 : 0x7e6b43,
        alpha: 0.92,
        width: route.interactive ? 2.4 : 1.6
      });
      drawArrowGlyph(routeFrame, route);
      routeFrame.stroke({
        color: route.interactive ? 0xf0cb76 : 0x9f814c,
        alpha: 0.9,
        width: 2
      });
      routeLayer.addChild(routeFrame);
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
    props.layout.boardRect.y + props.layout.boardRect.height * 0.205
  );

  const frontPlaqueLabel = new Text({
    text: "TICHU",
    style: new TextStyle({
      fill: 0xdab470,
      fontFamily: "Georgia, serif",
      fontSize: Math.max(14, props.layout.boardRect.height * 0.018),
      fontWeight: "700",
      letterSpacing: 2
    })
  });
  frontPlaqueLabel.anchor.set(0.5);
  frontPlaqueLabel.position.set(
    frontPlaque.x + frontPlaque.width / 2,
    frontPlaque.y + frontPlaque.height / 2
  );

  railLabelLayer.addChild(frontPlaqueLabel);

  root.addChild(
    shadow,
    board,
    trays,
    railDetails,
    embellishments,
    ornaments,
    ornamentArc,
    feltGlow,
    innerBorder,
    routeLayer,
    centerTitle,
    railLabelLayer
  );
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
