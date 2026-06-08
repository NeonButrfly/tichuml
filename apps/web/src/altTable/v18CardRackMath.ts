export const DESIGN_W = 1536;
export const DESIGN_H = 1024;

export type Seat = "north" | "east" | "south" | "west";

export type CardRackAnchor = {
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
  visibleFraction?: number;
  hiddenBottomPx?: number;
  rackId: string;
  cardBackFaces: "table_center" | "player";
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeCount(count: number) {
  return Math.max(0, Math.floor(count));
}

function rotationForSouthIndex(index: number, count: number) {
  const preset = [-12, -9, -7, -5, -3, -1, 0, 1, 3, 5, 7, 9, 11, 13];
  if (count === preset.length) {
    return preset[index] ?? 0;
  }

  const t = count <= 1 ? 0.5 : index / (count - 1);
  return lerp(-12, 13, t);
}

export function makeNorthRackAnchors(count = 14): CardRackAnchor[] {
  const total = normalizeCount(count);
  if (total === 0) {
    return [];
  }

  const x0 = total >= 14 ? 472 : 540;
  const x1 = total >= 14 ? 1064 : 996;
  const y = 78;
  const cardW = 45;
  const cardH = 78;

  return Array.from({ length: total }, (_, i) => {
    const t = total === 1 ? 0.5 : i / (total - 1);

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
      zIndex: 40 + i,
      visibleFraction: 0.87,
      hiddenBottomPx: 10,
      rackId: "rack_north",
      cardBackFaces: "table_center"
    };
  });
}

export function makeSideRackAnchors(seat: "west" | "east", count = 14): CardRackAnchor[] {
  const total = normalizeCount(count);
  if (total === 0) {
    return [];
  }

  const west = seat === "west";
  const top = west ? { x: 96, y: 238 } : { x: 1440, y: 238 };
  const bottom = west ? { x: 72, y: 642 } : { x: 1464, y: 642 };
  const cardW = 62;
  const cardH = 108;
  const baseRot = west ? -10 : 10;
  const fanSpread = west ? -7 : 7;

  return Array.from({ length: total }, (_, i) => {
    const t = total === 1 ? 0.5 : i / (total - 1);

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
      zIndex: 40 + i,
      rackId: west ? "rack_west" : "rack_east",
      cardBackFaces: "table_center"
    };
  });
}

export function makeSouthCards(count = 14): CardRackAnchor[] {
  const total = normalizeCount(count);
  if (total === 0) {
    return [];
  }

  const fullSpreadStart = 260;
  const fullSpreadEnd = 1265;
  const compactStart = 420;
  const compactEnd = 1105;
  const x0 = total >= 14 ? fullSpreadStart : compactStart;
  const x1 = total >= 14 ? fullSpreadEnd : compactEnd;

  return Array.from({ length: total }, (_, i) => {
    const t = total === 1 ? 0.5 : i / (total - 1);
    const arc = Math.sin(Math.PI * t) * 52;

    return {
      id: `s${pad2(i + 1)}`,
      seat: "south",
      zone: "south_hand",
      index: i + 1,
      renderMode: "south_player_fan",
      centerPx: {
        x: lerp(x0, x1, t),
        y: 840 - arc
      },
      wPx: 106,
      hPx: 170,
      rotationDeg: rotationForSouthIndex(i, total),
      scaleX: 1,
      scaleY: 1,
      zIndex: 100 + i,
      rackId: "rack_south",
      cardBackFaces: "player"
    };
  });
}

export function makeOpponentRackAnchors(counts?: Partial<Record<Exclude<Seat, "south">, number>>) {
  return [
    ...makeNorthRackAnchors(counts?.north ?? 14),
    ...makeSideRackAnchors("west", counts?.west ?? 14),
    ...makeSideRackAnchors("east", counts?.east ?? 14)
  ];
}

export function makeAllVisibleCardAnchors(counts?: Partial<Record<Seat, number>>) {
  return [
    ...makeOpponentRackAnchors({
      north: counts?.north ?? 14,
      west: counts?.west ?? 14,
      east: counts?.east ?? 14
    }),
    ...makeSouthCards(counts?.south ?? 14)
  ];
}
