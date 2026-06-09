import handAnchorData from "../public/tv_ed/h/a.json";
import passAnchorData from "../public/tv_ed/p/a.json";
import trickAnchorData from "../public/tv_ed/k/a.json";
import cardMapData from "../public/tv_ed/c/map.json";
import rackData from "../public/tv_ed/h/rack.json";
import type { Card, SeatId } from "@tichuml/engine";
import type { PassLaneDirection, SeatVisualPosition } from "./table-layout";

export const NORMAL_TABLE_SPRITE_ROOT = "/tv_ed";
export const NORMAL_TABLE_SPRITE_DESIGN_WIDTH = 1536;
export const NORMAL_TABLE_SPRITE_DESIGN_HEIGHT = 1024;
export const NORMAL_TABLE_SPRITE_BASE_SRC = `${NORMAL_TABLE_SPRITE_ROOT}/t/plate.png`;
export const NORMAL_TABLE_SPRITE_DRAGON_SRC: string | null = null;
export const NORMAL_TABLE_SPRITE_PASS_OVERLAY_SRC = `${NORMAL_TABLE_SPRITE_ROOT}/p/o.png`;
export const NORMAL_TABLE_SPRITE_CARD_BACK_SRC = `${NORMAL_TABLE_SPRITE_ROOT}/c/back/green.png`;

type SpritePoint = {
  x: number;
  y: number;
};

export type NormalSpriteHandAnchor = {
  id: string;
  seat: "north" | "east" | "south" | "west";
  index: number;
  center_px: SpritePoint;
  w_px: number;
  h_px: number;
  rotation_deg: number;
  z_index: number;
};

export type NormalSpritePassAnchor = {
  id: string;
  seat: "north" | "east" | "south" | "west";
  center_px: SpritePoint;
  w_px: number;
  h_px: number;
  bbox_px: { x: number; y: number; w: number; h: number };
  polygon_px: SpritePoint[];
  visual_rotation_deg: number;
  card_rotation_deg: number;
  orientation: "landscape" | "portrait";
  lane: "left" | "across" | "right" | "north" | "south";
  arrow_direction: "left" | "right" | "north" | "south" | "east" | "west";
  z_index: number;
};

export type NormalSpriteTrickAnchor = {
  id: string;
  seat: "north" | "east" | "south" | "west" | "center";
  center_px: SpritePoint;
  w_px: number;
  h_px: number;
  rotation_deg: number;
  z_index: number;
};

export type NormalSpriteRack = {
  id: string;
  seat: "north" | "east" | "south" | "west";
  bbox_px: { x: number; y: number; w: number; h: number };
  card_channel_px?: { x: number; y: number; w: number; h: number };
};

export type NormalSpriteTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type StandardSuitKey = "jades" | "swords" | "pagodas" | "stars";

const suitKeyByCardSuit: Record<
  Extract<Card, { kind: "standard" }>["suit"],
  StandardSuitKey
> = {
  jade: "jades",
  sword: "swords",
  pagoda: "pagodas",
  star: "stars"
};

const handAnchors = handAnchorData.anchors as NormalSpriteHandAnchor[];
const passAnchors = passAnchorData.anchors as NormalSpritePassAnchor[];
const trickAnchors = trickAnchorData.anchors as NormalSpriteTrickAnchor[];
const racks = rackData.racks as NormalSpriteRack[];

const handAnchorsBySeat = {
  north: handAnchors.filter((anchor) => anchor.seat === "north"),
  east: handAnchors.filter((anchor) => anchor.seat === "east"),
  south: handAnchors.filter((anchor) => anchor.seat === "south"),
  west: handAnchors.filter((anchor) => anchor.seat === "west")
} as const;

const trickAnchorBySeat = new Map(
  trickAnchors.map((anchor) => [anchor.seat, anchor] as const)
);

const passAnchorIdByRoute = {
  top: {
    left: "north_pass_left",
    bottom: "north_pass_across",
    right: "north_pass_right"
  },
  right: {
    top: "east_pass_north",
    left: "east_pass_across",
    bottom: "east_pass_south"
  },
  bottom: {
    left: "south_pass_left",
    top: "south_pass_across",
    right: "south_pass_right"
  },
  left: {
    top: "west_pass_north",
    right: "west_pass_across",
    bottom: "west_pass_south"
  }
} as const satisfies Record<
  SeatVisualPosition,
  Partial<Record<SeatVisualPosition, string>>
>;

const passAnchorById = new Map(
  passAnchors.map((anchor) => [anchor.id, anchor] as const)
);

const rackBySeat = new Map(racks.map((rack) => [rack.seat, rack] as const));

export function getNormalSpriteHandAnchors(
  seat: "north" | "east" | "south" | "west"
) {
  return handAnchorsBySeat[seat];
}

export function getNormalSpriteSelectedHandAnchors(config: {
  seat: "north" | "east" | "south" | "west";
  count: number;
}) {
  const anchors = handAnchorsBySeat[config.seat];
  if (config.count <= 0) {
    return [] as NormalSpriteHandAnchor[];
  }

  if (config.count >= anchors.length) {
    return [...anchors];
  }

  const start = Math.max(0, Math.floor((anchors.length - config.count) / 2));
  return anchors.slice(start, start + config.count);
}

export function resolveNormalSpriteCardFaceSrc(card: Card) {
  if (card.kind === "special") {
    return `${NORMAL_TABLE_SPRITE_ROOT}/${
      cardMapData.special[card.special]
    }`;
  }

  const suitKey = suitKeyByCardSuit[card.suit];
  const rankKey =
    card.rank === 14
      ? "A"
      : card.rank === 13
        ? "K"
        : card.rank === 12
          ? "Q"
          : card.rank === 11
            ? "J"
            : String(card.rank);
  return `${NORMAL_TABLE_SPRITE_ROOT}/${
    cardMapData.standard[suitKey][rankKey]
  }`;
}

export function getNormalSpriteRemoteCardBackSrc() {
  return NORMAL_TABLE_SPRITE_CARD_BACK_SRC;
}

export function resolveNormalSpritePassAnchor(config: {
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
}) {
  const anchorId =
    passAnchorIdByRoute[config.sourcePosition][config.targetPosition];
  return anchorId ? passAnchorById.get(anchorId) ?? null : null;
}

export function resolveNormalSpriteTrickAnchor(
  seat: "north" | "east" | "south" | "west" | "center"
) {
  return trickAnchorBySeat.get(seat) ?? null;
}

export function resolveNormalSpriteRack(
  seat: "north" | "east" | "south" | "west"
) {
  return rackBySeat.get(seat) ?? null;
}

export function getNormalSpritePassDirection(
  anchor: NormalSpritePassAnchor
): PassLaneDirection {
  switch (anchor.arrow_direction) {
    case "north":
      return "up";
    case "south":
      return "down";
    case "east":
      return "right";
    case "west":
      return "left";
    case "left":
      return "left";
    case "right":
      return "right";
  }
}

export function computeNormalSpriteTransform(config: {
  viewportWidth: number;
  viewportHeight: number;
}) {
  const scale = Math.min(
    config.viewportWidth / NORMAL_TABLE_SPRITE_DESIGN_WIDTH,
    config.viewportHeight / NORMAL_TABLE_SPRITE_DESIGN_HEIGHT
  );

  return {
    scale,
    offsetX:
      (config.viewportWidth - NORMAL_TABLE_SPRITE_DESIGN_WIDTH * scale) / 2,
    offsetY:
      (config.viewportHeight - NORMAL_TABLE_SPRITE_DESIGN_HEIGHT * scale) / 2
  } satisfies NormalSpriteTransform;
}

export function scaleNormalSpriteValue(
  value: number,
  transform: NormalSpriteTransform
) {
  return value * transform.scale;
}

export function projectNormalSpritePoint(
  point: SpritePoint,
  transform: NormalSpriteTransform
) {
  return {
    x: transform.offsetX + point.x * transform.scale,
    y: transform.offsetY + point.y * transform.scale
  };
}

export function projectNormalSpritePolygon(
  points: SpritePoint[],
  transform: NormalSpriteTransform
) {
  return points.map((point) => projectNormalSpritePoint(point, transform));
}

export function getNormalSpriteHandScale(position: SeatVisualPosition) {
  switch (position) {
    case "top":
      return 1.36;
    case "left":
    case "right":
      return 1.34;
    case "bottom":
      return 1.28;
  }
}

export function getNormalSpriteSeatwardOffset(config: {
  position: SeatVisualPosition;
  width: number;
  height: number;
}) {
  switch (config.position) {
    case "top":
      return { x: 0, y: -config.height * 0.16 };
    case "left":
      return { x: -config.width * 0.28, y: 0 };
    case "right":
      return { x: config.width * 0.28, y: 0 };
    case "bottom":
      return { x: 0, y: config.height * 0.12 };
  }
}

export function getNormalSpriteHiddenPassCount(config: {
  seat: SeatId;
  passRouteViews: Array<{ sourceSeat: SeatId; occupied: boolean }>;
}) {
  return config.passRouteViews.filter(
    (route) => route.sourceSeat === config.seat && route.occupied
  ).length;
}

export function shouldRenderNormalSpritePassCard(config: {
  sourceSeat: SeatId;
  occupied: boolean;
  visibleCardId: string | null;
}) {
  return Boolean(
    config.visibleCardId ||
      (config.occupied && config.sourceSeat === "seat-0")
  );
}
