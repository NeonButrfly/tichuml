import anchorManifestJson from "./assets/tichu_table_v5_direction_locked_update/passing_phase/v5_direction_locked/anchors/passing_phase_v5_direction_locked_card_sized_anchors_1536x1024.json";

export const DESIGN_W = 1536;
export const DESIGN_H = 1024;

export const TICHU_TABLE_SOURCE_ROOT_URL = new URL(
  "./assets/tichu_table_v5_direction_locked_update/",
  import.meta.url
);

export const TABLE_PLATE_SOURCE_PATH =
  "table_plate/table_plate_no_red_sample_guides_1536x1024.png";
export const PASSING_ANCHOR_JSON_SOURCE_PATH =
  "passing_phase/v5_direction_locked/anchors/passing_phase_v5_direction_locked_card_sized_anchors_1536x1024.json";
export const PRODUCTION_PASSING_OVERLAY_SOURCE_PATH =
  "passing_phase/v5_direction_locked/overlays/passing_lanes_v5_slots_with_direction_arrows_gold_1536x1024.png";
export const PRODUCTION_PASSING_SLOTS_ONLY_OVERLAY_SOURCE_PATH =
  "passing_phase/v5_direction_locked/overlays/passing_lanes_v5_slots_only_gold_1536x1024.png";
export const DEBUG_PASSING_OVERLAY_SOURCE_PATH =
  "passing_phase/v5_direction_locked/overlays/passing_lanes_v5_debug_labeled_gold_1536x1024.png";
export const CARD_BACK_BLUE_SOURCE_PATH =
  "cards/wuxia_imagegen_v5/backs/back_blue.png";
export const CARD_BACK_GREEN_SOURCE_PATH =
  "cards/wuxia_imagegen_v5/backs/back_green.png";

export const TABLE_PLATE_SRC = toAssetHref(TABLE_PLATE_SOURCE_PATH);
export const PRODUCTION_PASSING_OVERLAY_SRC = toAssetHref(
  PRODUCTION_PASSING_OVERLAY_SOURCE_PATH
);
export const PRODUCTION_PASSING_SLOTS_ONLY_OVERLAY_SRC = toAssetHref(
  PRODUCTION_PASSING_SLOTS_ONLY_OVERLAY_SOURCE_PATH
);
export const CARD_BACK_BLUE_SRC = toAssetHref(CARD_BACK_BLUE_SOURCE_PATH);
export const CARD_BACK_GREEN_SRC = toAssetHref(CARD_BACK_GREEN_SOURCE_PATH);

export type TichuSuit = "swords" | "pagodas" | "jades" | "stars";
export type TichuRank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";
export type TichuSpecial = "mahjong" | "dog" | "phoenix" | "dragon";
export type AuthoredSeat = "north" | "south" | "east" | "west";
export type AuthoredArrowDirection =
  | "left"
  | "right"
  | "north"
  | "south";
export type CardOrientation = "vertical" | "horizontal";
export type SeatVisualPosition = "top" | "right" | "bottom" | "left";

type AnchorPoint = {
  x: number;
  y: number;
};

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnchorManifest = {
  anchors: Array<{
    id: string;
    seat: AuthoredSeat;
    lane_role: string;
    arrow_direction: AuthoredArrowDirection;
    bbox_px: AnchorRect;
    polygon_px?: AnchorPoint[];
    center_px?: AnchorPoint;
    player_bottom_edge?: "up" | "down" | "left" | "right";
    visual_orientation?: "portrait" | "landscape";
  }>;
};

export type PassingAnchor = {
  id: string;
  seat: AuthoredSeat;
  lane: string;
  arrow_direction: AuthoredArrowDirection;
  bbox_px: AnchorRect;
  polygon_px: AnchorPoint[];
  center_px: AnchorPoint;
  player_bottom_edge: "up" | "down" | "left" | "right";
  visual_orientation: "portrait" | "landscape";
};

export const AUTHORED_PASS_DIRECTIONS = {
  north_pass_left: "left",
  north_pass_across: "south",
  north_pass_right: "right",
  south_pass_left: "left",
  south_pass_across: "north",
  south_pass_right: "right",
  east_pass_north: "north",
  east_pass_across: "west",
  east_pass_south: "south",
  west_pass_north: "north",
  west_pass_across: "east",
  west_pass_south: "south"
} as const;

export const EAST_WEST_VERTICAL_ANCHOR_IDS = [
  "west_pass_north",
  "west_pass_south",
  "east_pass_north",
  "east_pass_south"
] as const;

export const EAST_WEST_ACROSS_ANCHOR_IDS = [
  "west_pass_across",
  "east_pass_across"
] as const;

const EAST_WEST_VERTICAL_ANCHOR_ID_SET = new Set<string>(
  EAST_WEST_VERTICAL_ANCHOR_IDS
);
const EAST_WEST_ACROSS_ANCHOR_ID_SET = new Set<string>(
  EAST_WEST_ACROSS_ANCHOR_IDS
);

export const PASSING_ANCHORS: PassingAnchor[] = (
  anchorManifestJson as AnchorManifest
).anchors.map((anchor) => ({
  id: anchor.id,
  seat: anchor.seat,
  lane: anchor.lane_role,
  arrow_direction: anchor.arrow_direction,
  bbox_px: anchor.bbox_px,
  polygon_px:
    anchor.polygon_px ??
    rectToPolygon(anchor.bbox_px),
  center_px:
    anchor.center_px ?? {
      x: anchor.bbox_px.x + anchor.bbox_px.width / 2,
      y: anchor.bbox_px.y + anchor.bbox_px.height / 2
    },
  player_bottom_edge: anchor.player_bottom_edge ?? "down",
  visual_orientation: anchor.visual_orientation ?? "portrait"
}));

const ANCHOR_BY_ID = new Map(PASSING_ANCHORS.map((anchor) => [anchor.id, anchor]));

export type DesignFitTransform = {
  scale: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export type ProjectedPassingAnchor = {
  anchor: PassingAnchor;
  transform: DesignFitTransform;
  bbox_px: AnchorRect;
  polygon_px: AnchorPoint[];
  center_px: AnchorPoint;
  clipPathPolygon: string;
};

export function toAssetHref(relativePath: string): string {
  return new URL(relativePath, TICHU_TABLE_SOURCE_ROOT_URL).href;
}

export function resolveStandardCardSourcePath(
  suit: TichuSuit,
  rank: TichuRank
): string {
  return `cards/wuxia_imagegen_v5/standard/${suit}_${rank}.png`;
}

export function resolveStandardCardSrc(
  suit: TichuSuit,
  rank: TichuRank
): string {
  return toAssetHref(resolveStandardCardSourcePath(suit, rank));
}

export function resolveSpecialCardSourcePath(card: TichuSpecial): string {
  return `cards/wuxia_imagegen_v5/special/special_${card}.png`;
}

export function resolveSpecialCardSrc(card: TichuSpecial): string {
  return toAssetHref(resolveSpecialCardSourcePath(card));
}

export function createDesignFitTransform(
  viewportWidth: number,
  viewportHeight: number
): DesignFitTransform {
  const scale = Math.min(viewportWidth / DESIGN_W, viewportHeight / DESIGN_H);
  const offsetX = (viewportWidth - DESIGN_W * scale) / 2;
  const offsetY = (viewportHeight - DESIGN_H * scale) / 2;

  return {
    scale,
    scaleX: scale,
    scaleY: scale,
    offsetX,
    offsetY
  };
}

export function projectDesignPoint(
  point: AnchorPoint,
  viewportWidth: number,
  viewportHeight: number
): AnchorPoint {
  const transform = createDesignFitTransform(viewportWidth, viewportHeight);
  return {
    x: transform.offsetX + point.x * transform.scale,
    y: transform.offsetY + point.y * transform.scale
  };
}

export function projectDesignRect(
  rect: AnchorRect,
  viewportWidth: number,
  viewportHeight: number
): AnchorRect {
  const transform = createDesignFitTransform(viewportWidth, viewportHeight);
  return {
    x: transform.offsetX + rect.x * transform.scale,
    y: transform.offsetY + rect.y * transform.scale,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale
  };
}

export function getPassingAnchorCardOrientation(anchorId: string): CardOrientation {
  if (EAST_WEST_VERTICAL_ANCHOR_ID_SET.has(anchorId)) {
    return "vertical";
  }

  if (EAST_WEST_ACROSS_ANCHOR_ID_SET.has(anchorId)) {
    return "horizontal";
  }

  const anchor = PASSING_ANCHORS.find((candidate) => candidate.id === anchorId);
  if (!anchor) {
    throw new Error(`Unknown passing anchor: ${anchorId}`);
  }

  return anchor.visual_orientation === "portrait" ? "vertical" : "horizontal";
}

export function getPassingAnchorById(anchorId: string): PassingAnchor {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  if (!anchor) {
    throw new Error(`Unknown passing anchor: ${anchorId}`);
  }

  return anchor;
}

export function resolvePassingAnchorId(
  sourcePosition: SeatVisualPosition,
  targetPosition: SeatVisualPosition
): string | null {
  switch (sourcePosition) {
    case "top":
      return targetPosition === "left"
        ? "north_pass_left"
        : targetPosition === "bottom"
          ? "north_pass_across"
          : targetPosition === "right"
            ? "north_pass_right"
            : null;
    case "bottom":
      return targetPosition === "left"
        ? "south_pass_left"
        : targetPosition === "top"
          ? "south_pass_across"
          : targetPosition === "right"
            ? "south_pass_right"
            : null;
    case "left":
      return targetPosition === "top"
        ? "west_pass_north"
        : targetPosition === "right"
          ? "west_pass_across"
          : targetPosition === "bottom"
            ? "west_pass_south"
            : null;
    case "right":
      return targetPosition === "top"
        ? "east_pass_north"
        : targetPosition === "left"
          ? "east_pass_across"
          : targetPosition === "bottom"
            ? "east_pass_south"
            : null;
  }
}

export function createPassingAnchorVisualProjection(
  anchor: PassingAnchor,
  viewportWidth: number,
  viewportHeight: number
): ProjectedPassingAnchor {
  return projectPassingAnchor(anchor, viewportWidth, viewportHeight);
}

export function createPassingAnchorHitProjection(
  anchor: PassingAnchor,
  viewportWidth: number,
  viewportHeight: number
): ProjectedPassingAnchor {
  return projectPassingAnchor(anchor, viewportWidth, viewportHeight);
}

function projectPassingAnchor(
  anchor: PassingAnchor,
  viewportWidth: number,
  viewportHeight: number
): ProjectedPassingAnchor {
  const transform = createDesignFitTransform(viewportWidth, viewportHeight);
  const bbox_px = projectDesignRect(anchor.bbox_px, viewportWidth, viewportHeight);
  const polygon_px = anchor.polygon_px.map((point) =>
    projectDesignPoint(point, viewportWidth, viewportHeight)
  );
  const center_px = projectDesignPoint(anchor.center_px, viewportWidth, viewportHeight);

  return {
    anchor,
    transform,
    bbox_px,
    polygon_px,
    center_px,
    clipPathPolygon: polygon_px
      .map(
        (point) =>
          `${((point.x - bbox_px.x) / Math.max(bbox_px.width, 1)) * 100}% ${((point.y - bbox_px.y) / Math.max(bbox_px.height, 1)) * 100}%`
      )
      .join(", ")
  };
}

function rectToPolygon(rect: AnchorRect): AnchorPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}
