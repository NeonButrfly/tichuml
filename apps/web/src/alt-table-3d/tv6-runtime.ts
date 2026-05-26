export const TV6_ASSET_ROOT = "/tv6";
export const TV6_TABLE_PLATE_SRC = `${TV6_ASSET_ROOT}/t/plate.png`;
export const TV6_PASSING_OVERLAY_SRC = `${TV6_ASSET_ROOT}/p/o.png`;
export const TV6_PASSING_DEBUG_OVERLAY_SRC = `${TV6_ASSET_ROOT}/p/d.png`;
export const TV6_PASSING_ANCHOR_JSON_SRC = `${TV6_ASSET_ROOT}/p/a.json`;
export const TV6_CARD_MAP_SRC = `${TV6_ASSET_ROOT}/c/map.json`;

export const DESIGN_W = 1536;
export const DESIGN_H = 1024;
export const FIRST_DEAL_COUNT = 8;
export const SECOND_DEAL_COUNT = 6;
export const FINAL_HAND_COUNT = 14;
export const PASS_COUNT = 3;

export const LOCKED_PASS_ANCHORS = {
  north_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  north_pass_across: { dir: "south", orientation: "portrait", rot: 0 },
  north_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  south_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  south_pass_across: { dir: "north", orientation: "portrait", rot: 0 },
  south_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  east_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  east_pass_across: { dir: "west", orientation: "landscape", rot: 90 },
  east_pass_south: { dir: "south", orientation: "portrait", rot: 90 },
  west_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  west_pass_across: { dir: "east", orientation: "landscape", rot: 90 },
  west_pass_south: { dir: "south", orientation: "portrait", rot: 90 }
} as const;

export const LOCKED_PASS_IDS = Object.keys(
  LOCKED_PASS_ANCHORS
) as Array<keyof typeof LOCKED_PASS_ANCHORS>;
export const SOUTH_PASS_IDS = [
  "south_pass_left",
  "south_pass_across",
  "south_pass_right"
] as const;

export type PassAnchorId = (typeof LOCKED_PASS_IDS)[number];
export type PassArrowDirection =
  (typeof LOCKED_PASS_ANCHORS)[PassAnchorId]["dir"];
export type PassOrientation =
  (typeof LOCKED_PASS_ANCHORS)[PassAnchorId]["orientation"];
export type DemoPhase = "deal8" | "gt" | "deal6" | "passing" | "passed";
export type DemoSeat = "north" | "east" | "south" | "west";
export type DemoSuit = "swords" | "pagodas" | "jades" | "stars";
export type DemoRank =
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
export type DemoSpecial = "mahjong" | "dog" | "phoenix" | "dragon";

export type DesignBBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScreenBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesignPoint = {
  x: number;
  y: number;
};

export type Tv6Anchor = {
  id: PassAnchorId;
  seat: DemoSeat;
  lane: string;
  arrow_direction: PassArrowDirection;
  slot_orientation: PassOrientation;
  slot_rotation_deg: number;
  user_rotation_deg: number;
  card_rotation_hint_deg?: number;
  bbox_px: DesignBBox;
  center_px: DesignPoint;
  polygon_px: DesignPoint[];
};

export type Tv6CardMap = {
  standard: Record<DemoSuit, Record<DemoRank, string>>;
  special: Record<DemoSpecial, string>;
  backs: Record<"blue" | "green", string>;
};

export type LoadedImageMeta = {
  src: string;
  naturalW: number;
  naturalH: number;
};

export type Tv6RuntimeAssets = {
  anchors: Tv6Anchor[];
  cardMap: Tv6CardMap;
  tableMeta: LoadedImageMeta;
  overlayMeta: LoadedImageMeta;
  cardMetas: LoadedImageMeta[];
  sampleCardSrcs: string[];
};

export type DemoCard =
  | {
      id: string;
      kind: "standard";
      suit: DemoSuit;
      rank: DemoRank;
      label: string;
      src: string;
    }
  | {
      id: string;
      kind: "special";
      special: DemoSpecial;
      label: string;
      src: string;
    };

export type DemoHands = Record<DemoSeat, DemoCard[]>;

export type AltTableSnapshot = {
  assetRoot: string;
  tablePlate: string;
  passingOverlay: string;
  anchorJson: string;
  phase: DemoPhase;
  design: {
    width: number;
    height: number;
    w: number;
    h: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  flow: {
    firstDeal: number;
    secondDeal: number;
    passCount: number;
    dealtFirstCount: number;
    gtWindowShown: boolean;
    dealtSecondCount: number;
    passingEntered: boolean;
  };
  handCounts: Record<DemoSeat, number>;
  anchors: Array<{
    id: PassAnchorId;
    arrow_direction: PassArrowDirection;
    orientation: PassOrientation;
    rotation: number;
    bbox_px: DesignBBox;
    screen_bbox: ScreenBBox;
  }>;
  passAnchors: Array<{
    id: PassAnchorId;
    arrow_direction: PassArrowDirection;
    slot_orientation: PassOrientation;
    slot_rotation_deg: number;
    bbox_px: DesignBBox;
    screen_bbox: ScreenBBox;
  }>;
  cards: {
    usingImageAssets: boolean;
    placeholders: boolean;
    usesImages: boolean;
    usesPlaceholders: boolean;
    sampleSrcs: string[];
  };
  table: {
    src: string;
    naturalW: number;
    naturalH: number;
    uses3d: boolean;
    usesCanvas: boolean;
    usesCssTable: boolean;
  };
  passOverlay: {
    src: string;
    visible: boolean;
  };
};

export function getTableTransform(viewportW: number, viewportH: number) {
  const scale = Math.min(viewportW / DESIGN_W, viewportH / DESIGN_H);
  const offsetX = (viewportW - DESIGN_W * scale) / 2;
  const offsetY = (viewportH - DESIGN_H * scale) / 2;

  return { scale, offsetX, offsetY };
}

export function designToScreen(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number
) {
  const { scale, offsetX, offsetY } = getTableTransform(viewportW, viewportH);
  return {
    x: offsetX + x * scale,
    y: offsetY + y * scale,
    scale
  };
}

export function projectDesignBBox(
  bbox: DesignBBox,
  viewportW: number,
  viewportH: number
): ScreenBBox {
  const { scale, offsetX, offsetY } = getTableTransform(viewportW, viewportH);
  return {
    x: offsetX + bbox.x * scale,
    y: offsetY + bbox.y * scale,
    width: bbox.w * scale,
    height: bbox.h * scale
  };
}

export function bboxToPolygonPercent(bbox: DesignBBox, polygon: DesignPoint[]) {
  return polygon
    .map(
      (point) =>
        `${((point.x - bbox.x) / Math.max(bbox.w, 1)) * 100}% ${((point.y - bbox.y) / Math.max(bbox.h, 1)) * 100}%`
    )
    .join(", ");
}

export function getPhaseStep(phase: DemoPhase) {
  switch (phase) {
    case "deal8":
      return 0;
    case "gt":
      return 1;
    case "deal6":
      return 2;
    case "passing":
      return 3;
    case "passed":
      return 4;
  }
}

export function buildDemoDeck(cardMap: Tv6CardMap): DemoCard[] {
  const deck: DemoCard[] = [];

  for (const suit of ["swords", "pagodas", "jades", "stars"] as const) {
    for (const rank of [
      "A",
      "K",
      "Q",
      "J",
      "10",
      "9",
      "8",
      "7",
      "6",
      "5",
      "4",
      "3",
      "2"
    ] as const) {
      deck.push({
        id: `${suit}-${rank}`,
        kind: "standard",
        suit,
        rank,
        label: `${rank} of ${capitalizeWord(suit)}`,
        src: toTv6AssetPath(cardMap.standard[suit][rank])
      });
    }
  }

  for (const special of [
    "mahjong",
    "dog",
    "phoenix",
    "dragon"
  ] as const) {
    deck.push({
      id: special,
      kind: "special",
      special,
      label: capitalizeWord(special),
      src: toTv6AssetPath(cardMap.special[special])
    });
  }

  return deck;
}

export function createDemoHands(deck: DemoCard[]): {
  deal8: DemoHands;
  final: DemoHands;
} {
  const final = {
    north: deck.slice(0, FINAL_HAND_COUNT),
    east: deck.slice(FINAL_HAND_COUNT, FINAL_HAND_COUNT * 2),
    south: deck.slice(FINAL_HAND_COUNT * 2, FINAL_HAND_COUNT * 3),
    west: deck.slice(FINAL_HAND_COUNT * 3, FINAL_HAND_COUNT * 4)
  } satisfies DemoHands;

  return {
    deal8: {
      north: final.north.slice(0, FIRST_DEAL_COUNT),
      east: final.east.slice(0, FIRST_DEAL_COUNT),
      south: final.south.slice(0, FIRST_DEAL_COUNT),
      west: final.west.slice(0, FIRST_DEAL_COUNT)
    },
    final
  };
}

export function buildAutoDemoAssignments(hands: DemoHands) {
  return {
    north_pass_left: hands.north[0]!.id,
    north_pass_across: hands.north[1]!.id,
    north_pass_right: hands.north[2]!.id,
    south_pass_left: hands.south[0]!.id,
    south_pass_across: hands.south[1]!.id,
    south_pass_right: hands.south[2]!.id,
    east_pass_north: hands.east[0]!.id,
    east_pass_across: hands.east[1]!.id,
    east_pass_south: hands.east[2]!.id,
    west_pass_north: hands.west[0]!.id,
    west_pass_across: hands.west[1]!.id,
    west_pass_south: hands.west[2]!.id
  } satisfies Record<PassAnchorId, string>;
}

export async function loadTv6RuntimeAssets(): Promise<Tv6RuntimeAssets> {
  validateStaticProductionPaths();

  const [anchorsJson, cardMap, tableMeta, overlayMeta] = await Promise.all([
    fetchJson<{ anchors: unknown[] }>(TV6_PASSING_ANCHOR_JSON_SRC),
    fetchJson<Tv6CardMap>(TV6_CARD_MAP_SRC),
    loadImageMeta(TV6_TABLE_PLATE_SRC),
    loadImageMeta(TV6_PASSING_OVERLAY_SRC)
  ]);

  const anchors = validateAnchors(anchorsJson.anchors);
  const cardMetas = await validateCardImages(cardMap);

  if (tableMeta.naturalW !== DESIGN_W || tableMeta.naturalH !== DESIGN_H) {
    throw new Error(
      `Alt table validator: ${TV6_TABLE_PLATE_SRC} must be ${DESIGN_W}x${DESIGN_H}; received ${tableMeta.naturalW}x${tableMeta.naturalH}.`
    );
  }

  if (overlayMeta.naturalW !== DESIGN_W || overlayMeta.naturalH !== DESIGN_H) {
    throw new Error(
      `Alt table validator: ${TV6_PASSING_OVERLAY_SRC} must be ${DESIGN_W}x${DESIGN_H}; received ${overlayMeta.naturalW}x${overlayMeta.naturalH}.`
    );
  }

  return {
    anchors,
    cardMap,
    tableMeta,
    overlayMeta,
    cardMetas,
    sampleCardSrcs: cardMetas.slice(0, 6).map((meta) => meta.src)
  };
}

export function buildAltTableSnapshot(config: {
  phase: DemoPhase;
  viewportW: number;
  viewportH: number;
  handCounts: Record<DemoSeat, number>;
  anchors: Tv6Anchor[];
  assets: Tv6RuntimeAssets;
}) {
  const transform = getTableTransform(config.viewportW, config.viewportH);
  const phaseStep = getPhaseStep(config.phase);
  const passAnchors = config.anchors.map((anchor) => ({
    id: anchor.id,
    arrow_direction: anchor.arrow_direction,
    slot_orientation: anchor.slot_orientation,
    slot_rotation_deg: anchor.slot_rotation_deg,
    bbox_px: anchor.bbox_px,
    screen_bbox: projectDesignBBox(
      anchor.bbox_px,
      config.viewportW,
      config.viewportH
    )
  }));

  const snapshot: AltTableSnapshot = {
    assetRoot: TV6_ASSET_ROOT,
    tablePlate: TV6_TABLE_PLATE_SRC,
    passingOverlay: TV6_PASSING_OVERLAY_SRC,
    anchorJson: TV6_PASSING_ANCHOR_JSON_SRC,
    phase: config.phase,
    design: {
      width: DESIGN_W,
      height: DESIGN_H,
      w: DESIGN_W,
      h: DESIGN_H,
      scale: transform.scale,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY
    },
    flow: {
      firstDeal: FIRST_DEAL_COUNT,
      secondDeal: SECOND_DEAL_COUNT,
      passCount: PASS_COUNT,
      dealtFirstCount: FIRST_DEAL_COUNT,
      gtWindowShown: phaseStep >= getPhaseStep("gt"),
      dealtSecondCount: phaseStep >= getPhaseStep("deal6") ? SECOND_DEAL_COUNT : 0,
      passingEntered: phaseStep >= getPhaseStep("passing")
    },
    handCounts: config.handCounts,
    anchors: passAnchors.map((anchor) => ({
      id: anchor.id,
      arrow_direction: anchor.arrow_direction,
      orientation: anchor.slot_orientation,
      rotation: anchor.slot_rotation_deg,
      bbox_px: anchor.bbox_px,
      screen_bbox: anchor.screen_bbox
    })),
    passAnchors,
    cards: {
      usingImageAssets: true,
      placeholders: false,
      usesImages: true,
      usesPlaceholders: false,
      sampleSrcs: config.assets.sampleCardSrcs
    },
    table: {
      src: TV6_TABLE_PLATE_SRC,
      naturalW: config.assets.tableMeta.naturalW,
      naturalH: config.assets.tableMeta.naturalH,
      uses3d: false,
      usesCanvas: false,
      usesCssTable: false
    },
    passOverlay: {
      src: TV6_PASSING_OVERLAY_SRC,
      visible: config.phase === "passing"
    }
  };

  return snapshot;
}

function validateStaticProductionPaths() {
  if (TV6_TABLE_PLATE_SRC !== "/tv6/t/plate.png") {
    throw new Error(
      `Alt table validator: production table plate must be /tv6/t/plate.png; received ${TV6_TABLE_PLATE_SRC}.`
    );
  }

  if (TV6_PASSING_ANCHOR_JSON_SRC !== "/tv6/p/a.json") {
    throw new Error(
      `Alt table validator: production passing anchors must be /tv6/p/a.json; received ${TV6_PASSING_ANCHOR_JSON_SRC}.`
    );
  }

  if (TV6_PASSING_OVERLAY_SRC !== "/tv6/p/o.png") {
    throw new Error(
      `Alt table validator: production passing overlay must be /tv6/p/o.png; received ${TV6_PASSING_OVERLAY_SRC}.`
    );
  }

  for (const path of [
    TV6_TABLE_PLATE_SRC,
    TV6_PASSING_ANCHOR_JSON_SRC,
    TV6_PASSING_OVERLAY_SRC
  ]) {
    const normalized = path.toLowerCase();
    if (
      normalized.includes("v3") ||
      normalized.includes("v4") ||
      normalized.includes("v5") ||
      normalized.includes("debug") ||
      normalized.includes("sample") ||
      normalized.includes("red")
    ) {
      throw new Error(
        `Alt table validator: production path ${path} points at a forbidden asset variant.`
      );
    }
  }
}

function validateAnchors(rawAnchors: unknown[]) {
  if (!Array.isArray(rawAnchors)) {
    throw new Error("Alt table validator: /tv6/p/a.json does not contain an anchors array.");
  }

  if (rawAnchors.length !== LOCKED_PASS_IDS.length) {
    throw new Error(
      `Alt table validator: expected 12 passing anchors in /tv6/p/a.json; received ${rawAnchors.length}.`
    );
  }

  const anchors = rawAnchors.map((rawAnchor) => {
    const anchor = rawAnchor as Tv6Anchor;
    const lock = LOCKED_PASS_ANCHORS[anchor.id];

    if (!lock) {
      throw new Error(
        `Alt table validator: /tv6/p/a.json contains unexpected passing anchor ${String(anchor.id)}.`
      );
    }

    if (anchor.arrow_direction !== lock.dir) {
      throw new Error(
        `Alt table validator: ${anchor.id} arrow_direction must be ${lock.dir}; received ${anchor.arrow_direction}.`
      );
    }

    if (anchor.slot_orientation !== lock.orientation) {
      throw new Error(
        `Alt table validator: ${anchor.id} slot_orientation must be ${lock.orientation}; received ${anchor.slot_orientation}.`
      );
    }

    if (anchor.slot_rotation_deg !== lock.rot) {
      throw new Error(
        `Alt table validator: ${anchor.id} slot_rotation_deg must be ${lock.rot}; received ${anchor.slot_rotation_deg}.`
      );
    }

    if (!anchor.bbox_px || !Number.isFinite(anchor.bbox_px.x)) {
      throw new Error(
        `Alt table validator: ${anchor.id} is missing a valid bbox_px entry.`
      );
    }

    return anchor;
  });

  for (const anchorId of LOCKED_PASS_IDS) {
    if (!anchors.find((anchor) => anchor.id === anchorId)) {
      throw new Error(
        `Alt table validator: required passing anchor ${anchorId} is missing from /tv6/p/a.json.`
      );
    }
  }

  return anchors.sort(
    (left, right) =>
      LOCKED_PASS_IDS.indexOf(left.id) - LOCKED_PASS_IDS.indexOf(right.id)
  );
}

async function validateCardImages(cardMap: Tv6CardMap) {
  const cardSources = [
    ...Object.values(cardMap.standard).flatMap((ranks) =>
      Object.values(ranks).map((src) => toTv6AssetPath(src))
    ),
    ...Object.values(cardMap.special).map((src) => toTv6AssetPath(src)),
    ...Object.values(cardMap.backs).map((src) => toTv6AssetPath(src))
  ];

  return Promise.all(cardSources.map((src) => loadImageMeta(src)));
}

async function fetchJson<T>(src: string): Promise<T> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(
      `Alt table validator: failed to load ${src} with HTTP ${response.status}.`
    );
  }

  return (await response.json()) as T;
}

function loadImageMeta(src: string) {
  return new Promise<LoadedImageMeta>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        src,
        naturalW: image.naturalWidth,
        naturalH: image.naturalHeight
      });
    image.onerror = () =>
      reject(
        new Error(`Alt table validator: failed to load image asset ${src}.`)
      );
    image.src = src;
  });
}

function toTv6AssetPath(relativePath: string) {
  return `${TV6_ASSET_ROOT}/${relativePath.replace(/^\/+/, "")}`;
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
