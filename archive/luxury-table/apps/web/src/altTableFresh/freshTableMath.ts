import {
  getAltTablePassingLaneLayout,
  projectAltTablePassingLaneToDesignRect
} from "../alt-table-3d/altTable3DGeometry";

export type Seat = "north" | "east" | "south" | "west";
export type SeatVisualPosition = "top" | "right" | "bottom" | "left";

export type CardAnchor = {
  id: string;
  seat: Seat;
  zone: `${Seat}_hand`;
  index: number;
  renderMode:
    | "north_rack"
    | "side_rack_readable_fan"
    | "side_rack_portrait_fan"
    | "south_player_fan";
  cardBackFaces?: "table_center" | "player";
  centerPx: { x: number; y: number };
  wPx: number;
  hPx: number;
  rotationDeg: number;
  localRotationDeg?: { x: number; y: number; z: number };
  transformOrigin?: string;
  scaleX: number;
  scaleY: number;
  zIndex: number;
  hiddenBottomPx?: number;
};

export type PassAnchor = {
  id: string;
  seat: Seat;
  target: "left" | "right" | "across" | "north" | "south";
  centerPx: { x: number; y: number };
  wPx: number;
  hPx: number;
  orientation: "portrait" | "landscape";
  arrowDirection: "north" | "south" | "east" | "west" | "left" | "right";
  assignedCardRotationDeg: number;
  zIndex: number;
};

export type TrickAnchor = {
  seat: Seat;
  centerPx: { x: number; y: number };
  rotationDeg: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function mirrorX(x: number) {
  return 1536 - x;
}

export function makeNorthHandAnchors(): CardAnchor[] {
  const count = 14;

  const x0 = 470;
  const x1 = 1066;
  const y = 70;

  const cardW = 54;
  const cardH = 92;

  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);

    return {
      id: `n${pad2(i + 1)}`,
      seat: "north",
      zone: "north_hand",
      index: i + 1,
      renderMode: "north_rack",
      centerPx: {
        x: lerp(x0, x1, t),
        y
      },
      wPx: cardW,
      hPx: cardH,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
      hiddenBottomPx: 20,
      zIndex: 40 + i
    };
  });
}

export function makeSideHandAnchors(seat: "west" | "east"): CardAnchor[] {
  const count = 14;
  const west = seat === "west";

  const top = west ? { x: 104, y: 244 } : { x: mirrorX(104), y: 244 };

  const bottom = west ? { x: 76, y: 699 } : { x: mirrorX(76), y: 699 };

  const cardW = 64;
  const cardH = 88;

  const baseRot = west ? 14 : -14;
  const fanSpread = west ? 6 : -6;

  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);

    return {
      id: `${west ? "w" : "e"}${pad2(i + 1)}`,
      seat,
      zone: `${seat}_hand`,
      index: i + 1,
      renderMode: "side_rack_readable_fan",
      cardBackFaces: "table_center",
      centerPx: {
        x: lerp(top.x, bottom.x, t),
        y: lerp(top.y, bottom.y, t)
      },
      wPx: cardW,
      hPx: cardH,
      rotationDeg: baseRot + (t - 0.5) * fanSpread,
      scaleX: 0.72,
      scaleY: 1,
      zIndex: 40 + i
    };
  });
}

export function makeSouthHandAnchors(): CardAnchor[] {
  const count = 14;

  const x0 = 220;
  const x1 = 1316;
  const yBase = 850;

  const rotations = [-13, -10, -8, -6, -4, -2, 0, 1, 3, 5, 7, 9, 11, 13];

  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const arc = Math.sin(Math.PI * t) * 52;

    return {
      id: `s${pad2(i + 1)}`,
      seat: "south",
      zone: "south_hand",
      index: i + 1,
      renderMode: "south_player_fan",
      centerPx: {
        x: lerp(x0, x1, t),
        y: yBase - arc
      },
      wPx: 96,
      hPx: 156,
      rotationDeg: rotations[i] ?? 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 100 + i
    };
  });
}

export function makeAllHandAnchors(): CardAnchor[] {
  return [
    ...makeNorthHandAnchors(),
    ...makeSideHandAnchors("west"),
    ...makeSideHandAnchors("east"),
    ...makeSouthHandAnchors()
  ];
}

function centerFromTopEdge(topEdge: number, height: number): number {
  return topEdge + height / 2;
}

function centerFromBottomEdge(bottomEdge: number, height: number): number {
  return bottomEdge - height / 2;
}

function centerFromLeftEdge(leftEdge: number, width: number): number {
  return leftEdge + width / 2;
}

function centerFromRightEdge(rightEdge: number, width: number): number {
  return rightEdge - width / 2;
}

export function makePassingAnchors(): PassAnchor[] {
  const laneLayout = getAltTablePassingLaneLayout();
  const laneByKey = new Map(
    laneLayout.map((lane) => [`${lane.seat}:${lane.target}`, lane] as const)
  );
  const laneRectByKey = new Map(
    laneLayout.map((lane) => [
      `${lane.seat}:${lane.target}`,
      projectAltTablePassingLaneToDesignRect(lane)
    ] as const)
  );
  const lane = (key: string) => laneByKey.get(key)!;
  const laneRect = (key: string) => laneRectByKey.get(key)!;

  return [
    {
      id: "north_pass_left",
      seat: "north",
      target: "left",
      centerPx: laneRect("north:east").centerPx,
      wPx: laneRect("north:east").wPx,
      hPx: laneRect("north:east").hPx,
      orientation: "landscape",
      arrowDirection: lane("north:east").arrowDir.x < 0 ? "left" : "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "north_pass_across",
      seat: "north",
      target: "across",
      centerPx: laneRect("north:south").centerPx,
      wPx: laneRect("north:south").wPx,
      hPx: laneRect("north:south").hPx,
      orientation: "portrait",
      arrowDirection: lane("north:south").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "north_pass_right",
      seat: "north",
      target: "right",
      centerPx: laneRect("north:west").centerPx,
      wPx: laneRect("north:west").wPx,
      hPx: laneRect("north:west").hPx,
      orientation: "landscape",
      arrowDirection: lane("north:west").arrowDir.x < 0 ? "left" : "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_left",
      seat: "south",
      target: "left",
      centerPx: laneRect("south:west").centerPx,
      wPx: laneRect("south:west").wPx,
      hPx: laneRect("south:west").hPx,
      orientation: "landscape",
      arrowDirection: lane("south:west").arrowDir.x < 0 ? "left" : "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_across",
      seat: "south",
      target: "across",
      centerPx: laneRect("south:north").centerPx,
      wPx: laneRect("south:north").wPx,
      hPx: laneRect("south:north").hPx,
      orientation: "portrait",
      arrowDirection: lane("south:north").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_right",
      seat: "south",
      target: "right",
      centerPx: laneRect("south:east").centerPx,
      wPx: laneRect("south:east").wPx,
      hPx: laneRect("south:east").hPx,
      orientation: "landscape",
      arrowDirection: lane("south:east").arrowDir.x < 0 ? "left" : "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "west_pass_north",
      seat: "west",
      target: "north",
      centerPx: laneRect("west:north").centerPx,
      wPx: laneRect("west:north").wPx,
      hPx: laneRect("west:north").hPx,
      orientation: "portrait",
      arrowDirection: lane("west:north").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: -90,
      zIndex: 220
    },
    {
      id: "west_pass_across",
      seat: "west",
      target: "across",
      centerPx: laneRect("west:east").centerPx,
      wPx: laneRect("west:east").wPx,
      hPx: laneRect("west:east").hPx,
      orientation: "landscape",
      arrowDirection: lane("west:east").arrowDir.x < 0 ? "left" : "east",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "west_pass_south",
      seat: "west",
      target: "south",
      centerPx: laneRect("west:south").centerPx,
      wPx: laneRect("west:south").wPx,
      hPx: laneRect("west:south").hPx,
      orientation: "portrait",
      arrowDirection: lane("west:south").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: 90,
      zIndex: 220
    },
    {
      id: "east_pass_north",
      seat: "east",
      target: "north",
      centerPx: laneRect("east:north").centerPx,
      wPx: laneRect("east:north").wPx,
      hPx: laneRect("east:north").hPx,
      orientation: "portrait",
      arrowDirection: lane("east:north").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: 90,
      zIndex: 220
    },
    {
      id: "east_pass_across",
      seat: "east",
      target: "across",
      centerPx: laneRect("east:west").centerPx,
      wPx: laneRect("east:west").wPx,
      hPx: laneRect("east:west").hPx,
      orientation: "landscape",
      arrowDirection: lane("east:west").arrowDir.x < 0 ? "west" : "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "east_pass_south",
      seat: "east",
      target: "south",
      centerPx: laneRect("east:south").centerPx,
      wPx: laneRect("east:south").wPx,
      hPx: laneRect("east:south").hPx,
      orientation: "portrait",
      arrowDirection: lane("east:south").arrowDir.z > 0 ? "south" : "north",
      assignedCardRotationDeg: -90,
      zIndex: 220
    }
  ];
}

export function makeTrickAnchors(): TrickAnchor[] {
  return [
    { seat: "north", centerPx: { x: 768, y: 390 }, rotationDeg: 0 },
    { seat: "west", centerPx: { x: 690, y: 480 }, rotationDeg: -8 },
    { seat: "east", centerPx: { x: 846, y: 480 }, rotationDeg: 8 },
    { seat: "south", centerPx: { x: 768, y: 570 }, rotationDeg: 0 }
  ];
}

export function getSeatFromPosition(position: SeatVisualPosition): Seat {
  switch (position) {
    case "top":
      return "north";
    case "right":
      return "east";
    case "bottom":
      return "south";
    case "left":
      return "west";
  }
}

export function selectAnchorsForCount<T>(anchors: T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }

  if (count >= anchors.length) {
    return [...anchors];
  }

  const start = Math.max(0, Math.floor((anchors.length - count) / 2));
  return anchors.slice(start, start + count);
}

export function shouldShowPassingOverlay(phase: string): boolean {
  return [
    "passing",
    "passselect",
    "exchange",
    "pass_select",
    "pass_reveal",
    "exchange_complete"
  ].includes(phase.trim().toLowerCase());
}

export function resolveFreshPassAnchorId(config: {
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
}): string | null {
  const { sourcePosition, targetPosition } = config;

  if (sourcePosition === "top") {
    if (targetPosition === "left") {
      return "north_pass_left";
    }
    if (targetPosition === "bottom") {
      return "north_pass_across";
    }
    if (targetPosition === "right") {
      return "north_pass_right";
    }
  }

  if (sourcePosition === "bottom") {
    if (targetPosition === "left") {
      return "south_pass_left";
    }
    if (targetPosition === "top") {
      return "south_pass_across";
    }
    if (targetPosition === "right") {
      return "south_pass_right";
    }
  }

  if (sourcePosition === "left") {
    if (targetPosition === "top") {
      return "west_pass_north";
    }
    if (targetPosition === "right") {
      return "west_pass_across";
    }
    if (targetPosition === "bottom") {
      return "west_pass_south";
    }
  }

  if (sourcePosition === "right") {
    if (targetPosition === "top") {
      return "east_pass_north";
    }
    if (targetPosition === "left") {
      return "east_pass_across";
    }
    if (targetPosition === "bottom") {
      return "east_pass_south";
    }
  }

  return null;
}
