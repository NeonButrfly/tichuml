import type { PassRouteView, SeatView } from "../game-table-views";
import {
  NORMAL_PASS_STAGE_MAP,
  computeNormalViewportLayoutMetrics,
  getBoardBounds,
  resolveNormalBoardAnchorPoint,
  resolveNormalPassLaneGeometry,
  resolveNormalSeatAnchorGeometry,
  type NormalTableLayout,
  type PassLaneDirection,
  type SeatVisualPosition
} from "../table-layout";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type AlternateSeatPlacement = {
  plaque: Rect;
  rack: Rect;
  depthScale: number;
};

export type AlternateTrickPlacement = {
  x: number;
  y: number;
  rotation: number;
};

export type AlternatePassRoutePlacement = {
  key: string;
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
  rect: Rect;
  rotation: number;
  displayMode: PassRouteView["displayMode"];
  interactive: boolean;
  occupied: boolean;
  visibleCardId: string | null;
  target: PassRouteView["target"];
  targetSeat: PassRouteView["targetSeat"];
  sourceSeat: PassRouteView["sourceSeat"];
  faceDown: boolean;
};

export type AlternateTableLayout = {
  width: number;
  height: number;
  boardRect: Rect;
  outerFelt: Point[];
  innerFelt: Point[];
  centerEmblemRect: Rect;
  trickRect: Rect;
  statusRect: Rect;
  scoreRect: Rect;
  southControlRect: Rect;
  southHandCardWidth: number;
  seats: Record<SeatVisualPosition, AlternateSeatPlacement>;
  trickPlacements: Record<SeatVisualPosition, AlternateTrickPlacement>;
  passRoutes: AlternatePassRoutePlacement[];
};

const TABLE_ASPECT_RATIO = 1.75;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function point(x: number, y: number): Point {
  return { x, y };
}

function roundPoint(value: Point): Point {
  return point(Math.round(value.x), Math.round(value.y));
}

function rectFromCenter(
  center: Point,
  width: number,
  height: number
): Rect {
  return roundRect({
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  });
}

function lerp(start: number, end: number, weight: number): number {
  return start + (end - start) * weight;
}

function lerpPoint(first: Point, second: Point, weight: number): Point {
  return point(lerp(first.x, second.x, weight), lerp(first.y, second.y, weight));
}

function parsePx(value: unknown): number {
  return typeof value === "string" ? Number.parseFloat(value) || 0 : 0;
}

function depthScaleForY(normalY: number, boardBounds: ReturnType<typeof getBoardBounds>) {
  const v = clamp((normalY - boardBounds.top) / Math.max(1, boardBounds.height), 0, 1);
  return lerp(0.72, 1.04, v);
}

function projectBoardPoint(
  anchor: Point,
  boardBounds: ReturnType<typeof getBoardBounds>,
  quad: readonly [Point, Point, Point, Point]
): Point {
  const u = clamp((anchor.x - boardBounds.left) / Math.max(1, boardBounds.width), 0, 1);
  const v = clamp((anchor.y - boardBounds.top) / Math.max(1, boardBounds.height), 0, 1);
  const leftEdge = lerpPoint(quad[0], quad[3], v);
  const rightEdge = lerpPoint(quad[1], quad[2], v);
  return lerpPoint(leftEdge, rightEdge, u);
}

function toProjectedRect(config: {
  center: Point;
  width: number;
  height: number;
  normalY: number;
  boardBounds: ReturnType<typeof getBoardBounds>;
  widthScale?: number;
  heightScale?: number;
}) {
  const scale = depthScaleForY(config.normalY, config.boardBounds);
  return rectFromCenter(
    config.center,
    config.width * scale * (config.widthScale ?? 1),
    config.height * scale * (config.heightScale ?? 1)
  );
}

function buildSeatPlacements(config: {
  seatViews: readonly SeatView[];
  normalTableLayout: NormalTableLayout;
  boardBounds: ReturnType<typeof getBoardBounds>;
  outerFelt: readonly [Point, Point, Point, Point];
  hasVariantPicker: boolean;
  hasWishPicker: boolean;
  width: number;
  height: number;
}): { seats: Record<SeatVisualPosition, AlternateSeatPlacement>; southHandCardWidth: number } {
  const metrics = computeNormalViewportLayoutMetrics({
    viewportWidth: config.width,
    viewportHeight: config.height,
    topCount: config.seatViews.find((seat) => seat.position === "top")?.handCount ?? 0,
    bottomCount: config.seatViews.find((seat) => seat.position === "bottom")?.handCount ?? 0,
    leftCount: config.seatViews.find((seat) => seat.position === "left")?.handCount ?? 0,
    rightCount: config.seatViews.find((seat) => seat.position === "right")?.handCount ?? 0,
    hasVariantPicker: config.hasVariantPicker,
    hasWishPicker: config.hasWishPicker
  });

  const placements = {} as Record<SeatVisualPosition, AlternateSeatPlacement>;
  const positions: SeatVisualPosition[] = ["top", "left", "right", "bottom"];

  for (const position of positions) {
    const seat = config.seatViews.find((entry) => entry.position === position);
    if (!seat) {
      continue;
    }

    const normalSeat = resolveNormalSeatAnchorGeometry({
      position,
      normalTableLayout: config.normalTableLayout,
      layoutMetrics: metrics,
      handCardCount: seat.handCount
    });
    const projectedCenter = projectBoardPoint(
      point(normalSeat.handBounds.center.x, normalSeat.handBounds.center.y),
      config.boardBounds,
      config.outerFelt
    );
    const projectedLabel = projectBoardPoint(
      point(normalSeat.label.x, normalSeat.label.y),
      config.boardBounds,
      config.outerFelt
    );
    const depthScale = depthScaleForY(normalSeat.handBounds.center.y, config.boardBounds);

    let rackCenter = projectedCenter;
    if (position === "top") {
      rackCenter = point(projectedCenter.x, projectedCenter.y - config.height * 0.112);
    } else if (position === "bottom") {
      rackCenter = point(projectedCenter.x, projectedCenter.y + config.height * 0.078);
    } else if (position === "left") {
      rackCenter = point(projectedCenter.x - config.width * 0.072, projectedCenter.y);
    } else {
      rackCenter = point(projectedCenter.x + config.width * 0.072, projectedCenter.y);
    }

    const rackWidth =
      position === "left" || position === "right"
        ? metrics.cardWidth * 1.22
        : normalSeat.handBounds.width * (position === "bottom" ? 1.02 : 0.84);
    const rackHeight =
      position === "left" || position === "right"
        ? normalSeat.handBounds.height * 0.88
        : metrics.cardHeight * (position === "bottom" ? 1.28 : 0.92);

    const rack = toProjectedRect({
      center: rackCenter,
      width: rackWidth,
      height: rackHeight,
      normalY: normalSeat.handBounds.center.y,
      boardBounds: config.boardBounds,
      widthScale: position === "bottom" ? 1.02 : 1,
      heightScale: position === "bottom" ? 1.02 : 1
    });

    const plaqueWidth =
      position === "left" || position === "right"
        ? metrics.cardWidth * 0.82
        : metrics.cardWidth * 2.32;
    const plaqueHeight =
      position === "left" || position === "right"
        ? metrics.cardHeight * 1.72
        : metrics.cardHeight * 0.44;

    let plaqueCenter = projectedLabel;
    if (position === "top") {
      plaqueCenter = point(rack.x + rack.width / 2, rack.y - plaqueHeight * 0.46);
    } else if (position === "bottom") {
      plaqueCenter = point(rack.x + rack.width / 2, rack.y + rack.height + plaqueHeight * 0.58);
    } else if (position === "left") {
      plaqueCenter = point(rack.x - plaqueWidth * 0.52, rack.y + rack.height / 2);
    } else {
      plaqueCenter = point(rack.x + rack.width + plaqueWidth * 0.52, rack.y + rack.height / 2);
    }

    const plaque = toProjectedRect({
      center: plaqueCenter,
      width: plaqueWidth,
      height: plaqueHeight,
      normalY: normalSeat.label.y,
      boardBounds: config.boardBounds,
      widthScale: position === "top" ? 0.96 : 1,
      heightScale: position === "top" ? 0.92 : 1
    });

    placements[position] = { plaque, rack, depthScale };
  }

  return {
    seats: placements,
    southHandCardWidth: clamp(Math.round(metrics.cardWidth * 1.08), 84, 112)
  };
}

function buildPassRoutePlacements(config: {
  passRouteViews: readonly PassRouteView[];
  seatViews: readonly SeatView[];
  normalTableLayout: NormalTableLayout;
  boardBounds: ReturnType<typeof getBoardBounds>;
  outerFelt: readonly [Point, Point, Point, Point];
  width: number;
  height: number;
  hasVariantPicker: boolean;
  hasWishPicker: boolean;
}): AlternatePassRoutePlacement[] {
  const seatPositionBySeat = new Map(
    config.seatViews.map((seat) => [seat.seat, seat.position] as const)
  );
  const metrics = computeNormalViewportLayoutMetrics({
    viewportWidth: config.width,
    viewportHeight: config.height,
    topCount: config.seatViews.find((seat) => seat.position === "top")?.handCount ?? 0,
    bottomCount: config.seatViews.find((seat) => seat.position === "bottom")?.handCount ?? 0,
    leftCount: config.seatViews.find((seat) => seat.position === "left")?.handCount ?? 0,
    rightCount: config.seatViews.find((seat) => seat.position === "right")?.handCount ?? 0,
    hasVariantPicker: config.hasVariantPicker,
    hasWishPicker: config.hasWishPicker
  });

  return config.passRouteViews.flatMap((route) => {
    const targetPosition = seatPositionBySeat.get(route.targetSeat);
    if (!targetPosition) {
      return [];
    }

    const direction =
      NORMAL_PASS_STAGE_MAP[route.sourcePosition].find(
        (entry) => entry.targetPosition === targetPosition
      )?.direction ?? "up";
    const geometry = resolveNormalPassLaneGeometry({
      normalTableLayout: config.normalTableLayout,
      layoutMetrics: metrics,
      sourcePosition: route.sourcePosition,
      targetPosition,
      direction,
      sourceHandCardCount:
        config.seatViews.find((seat) => seat.position === route.sourcePosition)?.handCount ?? 1,
      displayMode: route.displayMode,
      stackAlignment:
        route.displayMode === "pickup" &&
        (route.sourcePosition === "left" || route.sourcePosition === "right")
          ? "centerline"
          : "shared-edge"
    });

    if (!geometry) {
      return [];
    }

    const center = point(parsePx(geometry.style.left), parsePx(geometry.style.top));
    let projectedCenter = projectBoardPoint(center, config.boardBounds, config.outerFelt);
    const scale = depthScaleForY(center.y, config.boardBounds);

    if (route.sourcePosition === "top") {
      projectedCenter = point(projectedCenter.x, projectedCenter.y - config.height * 0.045);
    } else if (route.sourcePosition === "bottom") {
      projectedCenter = point(projectedCenter.x, projectedCenter.y + config.height * 0.038);
    } else if (route.sourcePosition === "left") {
      projectedCenter = point(projectedCenter.x - config.width * 0.022, projectedCenter.y);
    } else {
      projectedCenter = point(projectedCenter.x + config.width * 0.022, projectedCenter.y);
    }

    return [
      {
        key: route.key,
        sourcePosition: route.sourcePosition,
        targetPosition,
        direction,
        rect: rectFromCenter(
          projectedCenter,
          geometry.width * scale * 0.96,
          geometry.height * scale * 0.96
        ),
        rotation: geometry.rotation,
        displayMode: route.displayMode,
        interactive: route.interactive,
        occupied: route.occupied,
        visibleCardId: route.visibleCardId,
        target: route.target,
        targetSeat: route.targetSeat,
        sourceSeat: route.sourceSeat,
        faceDown: route.faceDown
      }
    ];
  });
}

export function resolveAlternateTableLayout(config: {
  width: number;
  height: number;
  seatViews: readonly SeatView[];
  passRouteViews: readonly PassRouteView[];
  normalTableLayout: NormalTableLayout;
  hasVariantPicker: boolean;
  hasWishPicker: boolean;
}): AlternateTableLayout {
  const fittedWidth = Math.min(config.width, config.height * TABLE_ASPECT_RATIO);
  const fittedHeight = Math.min(config.height, config.width / TABLE_ASPECT_RATIO);
  const xInset = (config.width - fittedWidth) / 2;
  const yInset = (config.height - fittedHeight) / 2;

  const boardRect = roundRect({
    x: xInset + fittedWidth * 0.004,
    y: yInset + fittedHeight * 0.008,
    width: fittedWidth * 0.992,
    height: fittedHeight * 0.968
  });

  const outerFelt = [
    point(boardRect.x + boardRect.width * 0.232, boardRect.y + boardRect.height * 0.162),
    point(boardRect.x + boardRect.width * 0.768, boardRect.y + boardRect.height * 0.162),
    point(boardRect.x + boardRect.width * 0.916, boardRect.y + boardRect.height * 0.84),
    point(boardRect.x + boardRect.width * 0.084, boardRect.y + boardRect.height * 0.84)
  ] as const;
  const innerFelt = [
    point(boardRect.x + boardRect.width * 0.252, boardRect.y + boardRect.height * 0.188),
    point(boardRect.x + boardRect.width * 0.748, boardRect.y + boardRect.height * 0.188),
    point(boardRect.x + boardRect.width * 0.892, boardRect.y + boardRect.height * 0.812),
    point(boardRect.x + boardRect.width * 0.108, boardRect.y + boardRect.height * 0.812)
  ] as const;

  const normalMetrics = computeNormalViewportLayoutMetrics({
    viewportWidth: config.width,
    viewportHeight: config.height,
    topCount: config.seatViews.find((seat) => seat.position === "top")?.handCount ?? 0,
    bottomCount: config.seatViews.find((seat) => seat.position === "bottom")?.handCount ?? 0,
    leftCount: config.seatViews.find((seat) => seat.position === "left")?.handCount ?? 0,
    rightCount: config.seatViews.find((seat) => seat.position === "right")?.handCount ?? 0,
    hasVariantPicker: config.hasVariantPicker,
    hasWishPicker: config.hasWishPicker
  });
  const boardBounds = getBoardBounds(normalMetrics);
  const playSurfaceCenter = resolveNormalBoardAnchorPoint(
    config.normalTableLayout.playSurface,
    normalMetrics
  );
  const projectedPlaySurfaceCenter = projectBoardPoint(
    point(playSurfaceCenter.x, playSurfaceCenter.y),
    boardBounds,
    outerFelt
  );
  const playSurfaceScale = depthScaleForY(playSurfaceCenter.y, boardBounds);

  const trickRect = rectFromCenter(
    projectedPlaySurfaceCenter,
    normalMetrics.centerColumnWidth * playSurfaceScale * 0.54,
    normalMetrics.cardHeight * playSurfaceScale * 1.62
  );
  const centerEmblemRect = rectFromCenter(
    point(projectedPlaySurfaceCenter.x, projectedPlaySurfaceCenter.y + boardRect.height * 0.01),
    boardRect.width * 0.34,
    boardRect.height * 0.28
  );
  const scoreRect = roundRect({
    x: boardRect.x + boardRect.width * 0.43,
    y: boardRect.y + boardRect.height * 0.028,
    width: boardRect.width * 0.14,
    height: boardRect.height * 0.038
  });
  const statusRect = roundRect({
    x: projectedPlaySurfaceCenter.x - boardRect.width * 0.082,
    y: trickRect.y - boardRect.height * 0.12,
    width: boardRect.width * 0.164,
    height: boardRect.height * 0.046
  });

  const { seats, southHandCardWidth } = buildSeatPlacements({
    seatViews: config.seatViews,
    normalTableLayout: config.normalTableLayout,
    boardBounds,
    outerFelt,
    hasVariantPicker: config.hasVariantPicker,
    hasWishPicker: config.hasWishPicker,
    width: config.width,
    height: config.height
  });

  const southRack = seats.bottom.rack;
  const southPlaque = seats.bottom.plaque;
  const southControlHeight = boardRect.height * 0.058;
  const southControlRect = roundRect({
    x: boardRect.x + boardRect.width * 0.24,
    y: Math.min(
      boardRect.y + boardRect.height - southControlHeight - 8,
      southPlaque.y + southPlaque.height + 10
    ),
    width: boardRect.width * 0.52,
    height: southControlHeight
  });

  const trickPlacements = {
    top: {
      x: projectedPlaySurfaceCenter.x,
      y: trickRect.y + trickRect.height * 0.23,
      rotation: 0
    },
    right: {
      x: trickRect.x + trickRect.width * 0.78,
      y: trickRect.y + trickRect.height * 0.5,
      rotation: 6
    },
    bottom: {
      x: projectedPlaySurfaceCenter.x,
      y: trickRect.y + trickRect.height * 0.76,
      rotation: 0
    },
    left: {
      x: trickRect.x + trickRect.width * 0.22,
      y: trickRect.y + trickRect.height * 0.5,
      rotation: -6
    }
  } satisfies Record<SeatVisualPosition, AlternateTrickPlacement>;

  return {
    width: config.width,
    height: config.height,
    boardRect,
    outerFelt: outerFelt.map(roundPoint),
    innerFelt: innerFelt.map(roundPoint),
    centerEmblemRect,
    trickRect,
    statusRect,
    scoreRect,
    southControlRect,
    southHandCardWidth,
    seats,
    trickPlacements,
    passRoutes: buildPassRoutePlacements({
      passRouteViews: config.passRouteViews,
      seatViews: config.seatViews,
      normalTableLayout: config.normalTableLayout,
      boardBounds,
      outerFelt,
      width: config.width,
      height: config.height,
      hasVariantPicker: config.hasVariantPicker,
      hasWishPicker: config.hasWishPicker
    })
  };
}
