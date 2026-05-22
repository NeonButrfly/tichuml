import {
  NORMAL_PASS_STAGE_MAP,
  type PassRouteView,
  type SeatView,
  type PassLaneDirection,
  type SeatVisualPosition
} from "../game-table-views";

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
  seats: Record<SeatVisualPosition, AlternateSeatPlacement>;
  trickPlacements: Record<SeatVisualPosition, AlternateTrickPlacement>;
  passRoutes: AlternatePassRoutePlacement[];
};

const TABLE_ASPECT_RATIO = 1.56;

function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function point(x: number, y: number): Point {
  return { x: Math.round(x), y: Math.round(y) };
}

function buildSeatPlacements(width: number, height: number) {
  return {
    top: {
      plaque: roundRect({
        x: width * 0.4,
        y: height * 0.086,
        width: width * 0.2,
        height: height * 0.042
      }),
      rack: roundRect({
        x: width * 0.378,
        y: height * 0.126,
        width: width * 0.244,
        height: height * 0.08
      }),
      depthScale: 0.82
    },
    left: {
      plaque: roundRect({
        x: width * 0.05,
        y: height * 0.404,
        width: width * 0.04,
        height: height * 0.115
      }),
      rack: roundRect({
        x: width * 0.084,
        y: height * 0.316,
        width: width * 0.086,
        height: height * 0.3
      }),
      depthScale: 0.92
    },
    right: {
      plaque: roundRect({
        x: width * 0.91,
        y: height * 0.404,
        width: width * 0.04,
        height: height * 0.115
      }),
      rack: roundRect({
        x: width * 0.83,
        y: height * 0.316,
        width: width * 0.086,
        height: height * 0.3
      }),
      depthScale: 0.92
    },
    bottom: {
      plaque: roundRect({
        x: width * 0.396,
        y: height * 0.828,
        width: width * 0.208,
        height: height * 0.06
      }),
      rack: roundRect({
        x: width * 0.198,
        y: height * 0.676,
        width: width * 0.604,
        height: height * 0.15
      }),
      depthScale: 1
    }
  } satisfies Record<SeatVisualPosition, AlternateSeatPlacement>;
}

function getPassClusterCenter(
  sourcePosition: SeatVisualPosition,
  width: number,
  height: number
): Point {
  switch (sourcePosition) {
    case "top":
      return point(width * 0.5, height * 0.305);
    case "right":
      return point(width * 0.785, height * 0.468);
    case "bottom":
      return point(width * 0.5, height * 0.61);
    case "left":
      return point(width * 0.215, height * 0.468);
  }
}

function getPassSlotMetrics(
  sourcePosition: SeatVisualPosition,
  width: number,
  height: number
) {
  if (sourcePosition === "left" || sourcePosition === "right") {
    return {
      slotWidth: width * 0.046,
      slotHeight: height * 0.1,
      spread: height * 0.122,
      centerNudge: width * 0.032
    };
  }

  return {
    slotWidth: width * 0.058,
    slotHeight: height * 0.112,
    spread: width * 0.094,
    rise: height * 0.032
  };
}

function getPassSlotRect(
  sourcePosition: SeatVisualPosition,
  slotIndex: number,
  width: number,
  height: number
): Rect {
  const center = getPassClusterCenter(sourcePosition, width, height);
  if (sourcePosition === "left" || sourcePosition === "right") {
    const metrics = getPassSlotMetrics(sourcePosition, width, height) as {
      slotWidth: number;
      slotHeight: number;
      spread: number;
      centerNudge: number;
    };
    const xOffset =
      slotIndex === 1
        ? sourcePosition === "left"
          ? metrics.centerNudge
          : -metrics.centerNudge
        : 0;
    const yOffset = slotIndex === 0 ? -metrics.spread : slotIndex === 2 ? metrics.spread : 0;

    return roundRect({
      x: center.x + xOffset - metrics.slotWidth / 2,
      y: center.y + yOffset - metrics.slotHeight / 2,
      width: metrics.slotWidth,
      height: metrics.slotHeight
    });
  }

  const metrics = getPassSlotMetrics(sourcePosition, width, height) as {
    slotWidth: number;
    slotHeight: number;
    spread: number;
    rise: number;
  };
  const xOffset = slotIndex === 0 ? -metrics.spread : slotIndex === 2 ? metrics.spread : 0;
  const yOffset = slotIndex === 1 ? -metrics.rise : 0;

  return roundRect({
    x: center.x + xOffset - metrics.slotWidth / 2,
    y: center.y + yOffset - metrics.slotHeight / 2,
    width: metrics.slotWidth,
    height: metrics.slotHeight
  });
}

function getPassSlotRotation(
  sourcePosition: SeatVisualPosition,
  slotIndex: number
): number {
  if (sourcePosition === "top") {
    return slotIndex === 0 ? -10 : slotIndex === 2 ? 10 : 0;
  }
  if (sourcePosition === "bottom") {
    return slotIndex === 0 ? -10 : slotIndex === 2 ? 10 : 0;
  }
  return 0;
}

export function resolveAlternateTableLayout(
  width: number,
  height: number,
  seatViews: readonly SeatView[],
  passRouteViews: readonly PassRouteView[]
): AlternateTableLayout {
  const fittedWidth = Math.min(width, height * TABLE_ASPECT_RATIO);
  const fittedHeight = Math.min(height, width / TABLE_ASPECT_RATIO);
  const xInset = (width - fittedWidth) / 2;
  const yInset = (height - fittedHeight) / 2;

  const boardRect = roundRect({
    x: xInset + fittedWidth * 0.02,
    y: yInset + fittedHeight * 0.02,
    width: fittedWidth * 0.96,
    height: fittedHeight * 0.96
  });

  const boardWidth = boardRect.width;
  const boardHeight = boardRect.height;

  const localWidth = boardWidth;
  const localHeight = boardHeight;
  const boardOffsetX = boardRect.x;
  const boardOffsetY = boardRect.y;

  const seats = buildSeatPlacements(localWidth, localHeight);
  const seatPositionBySeat = new Map(seatViews.map((seat) => [seat.seat, seat.position] as const));

  const passRoutes = passRouteViews.flatMap((route) => {
    const targetPosition = seatPositionBySeat.get(route.targetSeat);
    if (!targetPosition) {
      return [];
    }

    const laneSpecs = NORMAL_PASS_STAGE_MAP[route.sourcePosition];
    const slotIndex = laneSpecs.findIndex((spec) => spec.targetPosition === targetPosition);
    if (slotIndex === -1) {
      return [];
    }

    const spec = laneSpecs[slotIndex]!;
    const rect = getPassSlotRect(route.sourcePosition, slotIndex, localWidth, localHeight);

    return [
      {
        key: route.key,
        sourcePosition: route.sourcePosition,
        targetPosition,
        direction: spec.direction,
        rect: roundRect({
          x: boardOffsetX + rect.x,
          y: boardOffsetY + rect.y,
          width: rect.width,
          height: rect.height
        }),
        rotation: getPassSlotRotation(route.sourcePosition, slotIndex),
        displayMode: route.displayMode,
        interactive: route.interactive,
        occupied: route.occupied,
        visibleCardId: route.visibleCardId,
        target: route.target,
        targetSeat: route.targetSeat,
        sourceSeat: route.sourceSeat,
        faceDown: route.faceDown
      } satisfies AlternatePassRoutePlacement
    ];
  });

  const translateRect = (rect: Rect): Rect =>
    roundRect({
      x: boardOffsetX + rect.x,
      y: boardOffsetY + rect.y,
      width: rect.width,
      height: rect.height
    });

  return {
    width,
    height,
    boardRect,
    outerFelt: [
      point(boardOffsetX + localWidth * 0.19, boardOffsetY + localHeight * 0.195),
      point(boardOffsetX + localWidth * 0.81, boardOffsetY + localHeight * 0.195),
      point(boardOffsetX + localWidth * 0.95, boardOffsetY + localHeight * 0.835),
      point(boardOffsetX + localWidth * 0.05, boardOffsetY + localHeight * 0.835)
    ],
    innerFelt: [
      point(boardOffsetX + localWidth * 0.22, boardOffsetY + localHeight * 0.225),
      point(boardOffsetX + localWidth * 0.78, boardOffsetY + localHeight * 0.225),
      point(boardOffsetX + localWidth * 0.918, boardOffsetY + localHeight * 0.802),
      point(boardOffsetX + localWidth * 0.082, boardOffsetY + localHeight * 0.802)
    ],
    centerEmblemRect: translateRect({
      x: localWidth * 0.355,
      y: localHeight * 0.34,
      width: localWidth * 0.29,
      height: localHeight * 0.29
    }),
    trickRect: translateRect({
      x: localWidth * 0.306,
      y: localHeight * 0.44,
      width: localWidth * 0.388,
      height: localHeight * 0.145
    }),
    statusRect: translateRect({
      x: localWidth * 0.37,
      y: localHeight * 0.255,
      width: localWidth * 0.26,
      height: localHeight * 0.042
    }),
    scoreRect: translateRect({
      x: localWidth * 0.385,
      y: localHeight * 0.012,
      width: localWidth * 0.23,
      height: localHeight * 0.032
    }),
    southControlRect: translateRect({
      x: localWidth * 0.245,
      y: localHeight * 0.945,
      width: localWidth * 0.51,
      height: localHeight * 0.03
    }),
    seats: {
      top: {
        ...seats.top,
        plaque: translateRect(seats.top.plaque),
        rack: translateRect(seats.top.rack)
      },
      left: {
        ...seats.left,
        plaque: translateRect(seats.left.plaque),
        rack: translateRect(seats.left.rack)
      },
      right: {
        ...seats.right,
        plaque: translateRect(seats.right.plaque),
        rack: translateRect(seats.right.rack)
      },
      bottom: {
        ...seats.bottom,
        plaque: translateRect(seats.bottom.plaque),
        rack: translateRect(seats.bottom.rack)
      }
    },
    trickPlacements: {
      top: {
        x: boardOffsetX + localWidth * 0.5,
        y: boardOffsetY + localHeight * 0.452,
        rotation: 0
      },
      right: {
        x: boardOffsetX + localWidth * 0.624,
        y: boardOffsetY + localHeight * 0.512,
        rotation: 8
      },
      bottom: {
        x: boardOffsetX + localWidth * 0.5,
        y: boardOffsetY + localHeight * 0.55,
        rotation: 0
      },
      left: {
        x: boardOffsetX + localWidth * 0.376,
        y: boardOffsetY + localHeight * 0.512,
        rotation: -8
      }
    },
    passRoutes
  };
}
