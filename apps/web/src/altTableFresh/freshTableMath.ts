export type Seat = "north" | "east" | "south" | "west";
export type SeatVisualPosition = "top" | "right" | "bottom" | "left";

export type CardAnchor = {
  id: string;
  seat: Seat;
  zone: `${Seat}_hand`;
  index: number;
  renderMode:
    | "north_rack_back_mostly_visible"
    | "side_rack_readable_fan"
    | "south_player_fan";
  centerPx: { x: number; y: number };
  wPx: number;
  hPx: number;
  rotationDeg: number;
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

export function makeNorthHandAnchors(): CardAnchor[] {
  const count = 14;

  const x0 = 482;
  const x1 = 1054;
  const y = 72;

  const cardW = 43;
  const cardH = 76;

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);

    return {
      id: `n${pad2(i + 1)}`,
      seat: "north",
      zone: "north_hand",
      index: i + 1,
      renderMode: "north_rack_back_mostly_visible",
      centerPx: {
        x: lerp(x0, x1, t),
        y
      },
      wPx: cardW,
      hPx: cardH,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
      hiddenBottomPx: 8,
      zIndex: 40 + i
    };
  });
}

export function makeSideHandAnchors(seat: "west" | "east"): CardAnchor[] {
  const count = 14;
  const west = seat === "west";

  const top = west ? { x: 96, y: 242 } : { x: 1440, y: 242 };

  const bottom = west ? { x: 74, y: 646 } : { x: 1462, y: 646 };

  const cardW = 62;
  const cardH = 108;

  const baseRot = west ? -10 : 10;
  const fanSpread = west ? -7 : 7;

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);

    return {
      id: `${west ? "w" : "e"}${pad2(i + 1)}`,
      seat,
      zone: `${seat}_hand`,
      index: i + 1,
      renderMode: "side_rack_readable_fan",
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

  const x0 = 250;
  const x1 = 1286;
  const yBase = 846;

  const rotations = [-13, -10, -8, -6, -4, -2, 0, 1, 3, 5, 7, 9, 11, 13];

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
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
      wPx: 104,
      hPx: 168,
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

export function makePassingAnchors(): PassAnchor[] {
  return [
    {
      id: "north_pass_left",
      seat: "north",
      target: "left",
      centerPx: { x: 612, y: 168 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "left",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "north_pass_across",
      seat: "north",
      target: "across",
      centerPx: { x: 768, y: 182 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "south",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "north_pass_right",
      seat: "north",
      target: "right",
      centerPx: { x: 924, y: 168 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_left",
      seat: "south",
      target: "left",
      centerPx: { x: 612, y: 720 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "left",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_across",
      seat: "south",
      target: "across",
      centerPx: { x: 768, y: 700 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "north",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "south_pass_right",
      seat: "south",
      target: "right",
      centerPx: { x: 924, y: 720 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "right",
      assignedCardRotationDeg: 0,
      zIndex: 220
    },
    {
      id: "west_pass_north",
      seat: "west",
      target: "north",
      centerPx: { x: 238, y: 292 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "north",
      assignedCardRotationDeg: -90,
      zIndex: 220
    },
    {
      id: "west_pass_across",
      seat: "west",
      target: "across",
      centerPx: { x: 252, y: 430 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "east",
      assignedCardRotationDeg: 90,
      zIndex: 220
    },
    {
      id: "west_pass_south",
      seat: "west",
      target: "south",
      centerPx: { x: 238, y: 568 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "south",
      assignedCardRotationDeg: 90,
      zIndex: 220
    },
    {
      id: "east_pass_north",
      seat: "east",
      target: "north",
      centerPx: { x: 1298, y: 292 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "north",
      assignedCardRotationDeg: -90,
      zIndex: 220
    },
    {
      id: "east_pass_across",
      seat: "east",
      target: "across",
      centerPx: { x: 1284, y: 430 },
      wPx: 128,
      hPx: 72,
      orientation: "landscape",
      arrowDirection: "west",
      assignedCardRotationDeg: 90,
      zIndex: 220
    },
    {
      id: "east_pass_south",
      seat: "east",
      target: "south",
      centerPx: { x: 1298, y: 568 },
      wPx: 72,
      hPx: 128,
      orientation: "portrait",
      arrowDirection: "south",
      assignedCardRotationDeg: 90,
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
