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
      rotationDeg: 180,
      cardBackFaces: "table_center",
      scaleX: 1,
      scaleY: 1,
      hiddenBottomPx: 0,
      zIndex: 40 + i
    };
  });
}

export function makeSideHandAnchors(seat: "west" | "east"): CardAnchor[] {
  const count = 14;
  const west = seat === "west";

  const top = west ? { x: 160, y: 260 } : { x: mirrorX(160), y: 260 };

  const bottom = west ? { x: 160, y: 700 } : { x: mirrorX(160), y: 700 };

  const cardW = 64;
  const cardH = 88;

  const baseRot = west ? 90 : -90;
  const fanSpread = 0;

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
      scaleX: 1,
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

// Coordinates belong to the artwork, not to a second perspective camera.
// Left/right for north describe screen placement, matching resolveFreshPassAnchorId.
export function makePassingAnchors(): PassAnchor[] {
  const lanes: Array<
    [
      string,
      Seat,
      PassAnchor["target"],
      number,
      number,
      PassAnchor["arrowDirection"],
      boolean
    ]
  > = [
    ["north_pass_left", "north", "left", 620, 230, "west", true],
    ["north_pass_across", "north", "across", 768, 230, "south", false],
    ["north_pass_right", "north", "right", 916, 230, "east", true],
    ["south_pass_left", "south", "left", 620, 650, "west", true],
    ["south_pass_across", "south", "across", 768, 650, "north", false],
    ["south_pass_right", "south", "right", 916, 650, "east", true],
    ["west_pass_north", "west", "north", 310, 350, "north", false],
    ["west_pass_across", "west", "across", 310, 480, "east", true],
    ["west_pass_south", "west", "south", 310, 610, "south", false],
    ["east_pass_north", "east", "north", 1226, 350, "north", false],
    ["east_pass_across", "east", "across", 1226, 480, "west", true],
    ["east_pass_south", "east", "south", 1226, 610, "south", false]
  ];
  return lanes.map(([id, seat, target, x, y, arrowDirection, horizontal]) => ({
    id,
    seat,
    target,
    centerPx: { x, y },
    wPx: horizontal ? 112 : 76,
    hPx: horizontal ? 76 : 112,
    orientation: horizontal ? "landscape" : "portrait",
    arrowDirection,
    assignedCardRotationDeg: horizontal ? 90 : 0,
    zIndex: 220
  }));
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
