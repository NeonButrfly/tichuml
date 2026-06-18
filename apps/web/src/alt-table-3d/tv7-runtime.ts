export const TV7_ASSET_ROOT = "/tv7";
export const TV7_TABLE_PLATE_SRC = `${TV7_ASSET_ROOT}/t/plate.png`;
export const TV7_TABLE_REFERENCE_SRC = `${TV7_ASSET_ROOT}/t/ref.png`;
export const TV7_PASSING_OVERLAY_SRC = `${TV7_ASSET_ROOT}/p/o.png`;
export const TV7_PASSING_ANCHOR_JSON_SRC = `${TV7_ASSET_ROOT}/p/a.json`;
export const TV7_CARD_ANCHOR_JSON_SRC = `${TV7_ASSET_ROOT}/h/a.json`;
export const TV7_CARD_MAP_SRC = `${TV7_ASSET_ROOT}/c/map.json`;
export const TV7_CARD_SLOT_OVERLAY_SRC = `${TV7_ASSET_ROOT}/h/s.png`;
export const TV7_CARD_DEBUG_OVERLAY_SRC = `${TV7_ASSET_ROOT}/h/d.png`;

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

export type DemoPhase =
  | "ready"
  | "deal8"
  | "grand_tichu"
  | "deal6"
  | "passing"
  | "passed";
export type DemoSeat = "north" | "east" | "south" | "west";
export type PassAnchorId = (typeof LOCKED_PASS_IDS)[number];
export type PassArrowDirection =
  (typeof LOCKED_PASS_ANCHORS)[PassAnchorId]["dir"];
export type PassOrientation =
  (typeof LOCKED_PASS_ANCHORS)[PassAnchorId]["orientation"];
export type CardZone =
  | "south_hand"
  | "north_hand"
  | "west_hand"
  | "east_hand"
  | "deck"
  | "discard";
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

export type DesignPoint = {
  x: number;
  y: number;
};

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

export type Tv7PassAnchor = {
  idx: number;
  id: PassAnchorId;
  seat: DemoSeat;
  lane: string;
  arrow_direction: PassArrowDirection;
  slot_orientation: PassOrientation;
  slot_rotation_deg: number;
  user_rotation_deg?: number;
  card_rotation_hint_deg?: number;
  bbox_px: DesignBBox;
  center_px: DesignPoint;
  polygon_px: DesignPoint[];
};

export type Tv7CardAnchor = {
  idx: number;
  id: string;
  zone: CardZone;
  kind: string;
  seat: DemoSeat | null;
  slot: number;
  layout_source: "prototype_layer";
  role: string;
  face_policy: "face" | "back";
  orientation: "portrait" | "landscape";
  rotation_deg: number;
  w_px: number;
  h_px: number;
  center_px: DesignPoint;
  bbox_px: DesignBBox;
  polygon_px: DesignPoint[];
};

export type Tv7CardMap = {
  standard: Record<DemoSuit, Record<DemoRank, string>>;
  special: Record<DemoSpecial, string>;
  backs: Record<"blue" | "green", string>;
};

export type LoadedImageMeta = {
  src: string;
  naturalW: number;
  naturalH: number;
};

export type Tv7RuntimeAssets = {
  passAnchors: Tv7PassAnchor[];
  cardAnchors: Tv7CardAnchor[];
  cardMap: Tv7CardMap;
  tableMeta: LoadedImageMeta;
  passingOverlayMeta: LoadedImageMeta;
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

export type Tv7Snapshot = {
  assetRoot: string;
  tablePlate: string;
  passingOverlay: string;
  anchorJson: string;
  handAnchorJson: string;
  phase: DemoPhase;
  design: {
    width: number;
    height: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  table: {
    src: string;
    designW: number;
    designH: number;
    rendered: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  };
  cardLayout: {
    src: string;
    layoutSource: "prototype_layer";
    anchors: Array<{
      id: string;
      zone: CardZone;
      seat: DemoSeat | null;
      bbox_px: DesignBBox;
      screen_bbox: ScreenBBox;
      rotation_deg: number;
      w_px: number;
      h_px: number;
    }>;
  };
  passing: {
    overlaySrc: string;
    anchors: Array<{
      id: PassAnchorId;
      arrow_direction: PassArrowDirection;
      orientation: PassOrientation;
      rotation: number;
      bbox_px: DesignBBox;
      screen_bbox: ScreenBBox;
    }>;
  };
  cards: {
    usingImageAssets: true;
    placeholders: false;
    layoutSource: "prototype_layer";
    bySeat: Record<DemoSeat, number>;
    sampleSrcs: string[];
  };
  deal: {
    phase: DemoPhase;
    counts: Record<DemoSeat, number> & { deckRemaining: number };
    history: string[];
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
    .map((point) => {
      const px = ((point.x - bbox.x) / Math.max(bbox.w, 1)) * 100;
      const py = ((point.y - bbox.y) / Math.max(bbox.h, 1)) * 100;
      return `${px}% ${py}%`;
    })
    .join(", ");
}

export function buildDemoDeck(cardMap: Tv7CardMap): DemoCard[] {
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
        src: toTv7AssetPath(cardMap.standard[suit][rank])
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
      src: toTv7AssetPath(cardMap.special[special])
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

export function buildDealHistory(
  phase: DemoPhase,
  gtChoice: "call" | "skip" | null
) {
  const history = ["ready"];
  if (phase !== "ready") {
    history.push("deal8");
  }
  if (
    phase === "grand_tichu" ||
    phase === "deal6" ||
    phase === "passing" ||
    phase === "passed"
  ) {
    history.push("grand_tichu");
  }
  if (gtChoice) {
    history.push(`gt:${gtChoice}`);
  }
  if (phase === "deal6" || phase === "passing" || phase === "passed") {
    history.push("deal6");
  }
  if (phase === "passing" || phase === "passed") {
    history.push("passing");
  }
  if (phase === "passed") {
    history.push("passed");
  }
  return history;
}

export async function loadTv7RuntimeAssets(): Promise<Tv7RuntimeAssets> {
  validateStaticProductionPaths();

  const [passJson, cardJson, cardMap, tableMeta, passingOverlayMeta] =
    await Promise.all([
      fetchJson<{ anchors: unknown[] }>(TV7_PASSING_ANCHOR_JSON_SRC),
      fetchJson<{ anchors: unknown[] }>(TV7_CARD_ANCHOR_JSON_SRC),
      fetchJson<Tv7CardMap>(TV7_CARD_MAP_SRC),
      loadImageMeta(TV7_TABLE_PLATE_SRC),
      loadImageMeta(TV7_PASSING_OVERLAY_SRC)
    ]);

  if (tableMeta.naturalW !== DESIGN_W || tableMeta.naturalH !== DESIGN_H) {
    throw new Error(
      `Alt table validator: ${TV7_TABLE_PLATE_SRC} must be ${DESIGN_W}x${DESIGN_H}; received ${tableMeta.naturalW}x${tableMeta.naturalH}.`
    );
  }

  if (
    passingOverlayMeta.naturalW !== DESIGN_W ||
    passingOverlayMeta.naturalH !== DESIGN_H
  ) {
    throw new Error(
      `Alt table validator: ${TV7_PASSING_OVERLAY_SRC} must be ${DESIGN_W}x${DESIGN_H}; received ${passingOverlayMeta.naturalW}x${passingOverlayMeta.naturalH}.`
    );
  }

  const passAnchors = validatePassAnchors(passJson.anchors);
  const cardAnchors = validateCardAnchors(cardJson.anchors);
  const cardMetas = await validateCardImages(cardMap);

  return {
    passAnchors,
    cardAnchors,
    cardMap,
    tableMeta,
    passingOverlayMeta,
    cardMetas,
    sampleCardSrcs: cardMetas.slice(0, 8).map((meta) => meta.src)
  };
}

export function buildTv7Snapshot(config: {
  assets: Tv7RuntimeAssets;
  phase: DemoPhase;
  gtChoice: "call" | "skip" | null;
  viewportW: number;
  viewportH: number;
  handCounts: Record<DemoSeat, number>;
  deckRemaining: number;
}) {
  const transform = getTableTransform(config.viewportW, config.viewportH);
  const renderedWidth = DESIGN_W * transform.scale;
  const renderedHeight = DESIGN_H * transform.scale;

  const snapshot: Tv7Snapshot = {
    assetRoot: TV7_ASSET_ROOT,
    tablePlate: TV7_TABLE_PLATE_SRC,
    passingOverlay: TV7_PASSING_OVERLAY_SRC,
    anchorJson: TV7_PASSING_ANCHOR_JSON_SRC,
    handAnchorJson: TV7_CARD_ANCHOR_JSON_SRC,
    phase: config.phase,
    design: {
      width: DESIGN_W,
      height: DESIGN_H,
      scale: transform.scale,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY
    },
    table: {
      src: TV7_TABLE_PLATE_SRC,
      designW: DESIGN_W,
      designH: DESIGN_H,
      rendered: {
        x: transform.offsetX,
        y: transform.offsetY,
        width: renderedWidth,
        height: renderedHeight,
        scale: transform.scale
      }
    },
    cardLayout: {
      src: TV7_CARD_ANCHOR_JSON_SRC,
      layoutSource: "prototype_layer",
      anchors: config.assets.cardAnchors.map((anchor) => ({
        id: anchor.id,
        zone: anchor.zone,
        seat: anchor.seat,
        bbox_px: anchor.bbox_px,
        screen_bbox: projectDesignBBox(
          anchor.bbox_px,
          config.viewportW,
          config.viewportH
        ),
        rotation_deg: anchor.rotation_deg,
        w_px: anchor.w_px,
        h_px: anchor.h_px
      }))
    },
    passing: {
      overlaySrc: TV7_PASSING_OVERLAY_SRC,
      anchors: config.assets.passAnchors.map((anchor) => ({
        id: anchor.id,
        arrow_direction: anchor.arrow_direction,
        orientation: anchor.slot_orientation,
        rotation: anchor.slot_rotation_deg,
        bbox_px: anchor.bbox_px,
        screen_bbox: projectDesignBBox(
          anchor.bbox_px,
          config.viewportW,
          config.viewportH
        )
      }))
    },
    cards: {
      usingImageAssets: true,
      placeholders: false,
      layoutSource: "prototype_layer",
      bySeat: config.handCounts,
      sampleSrcs: config.assets.sampleCardSrcs
    },
    deal: {
      phase: config.phase,
      counts: {
        ...config.handCounts,
        deckRemaining: config.deckRemaining
      },
      history: buildDealHistory(config.phase, config.gtChoice)
    }
  };

  return snapshot;
}

export function getCardBackSrc(cardMap: Tv7CardMap, color: "blue" | "green" = "blue") {
  return toTv7AssetPath(cardMap.backs[color]);
}

export function getSeatZone(seat: DemoSeat): Extract<CardZone, `${DemoSeat}_hand`> {
  return `${seat}_hand` as Extract<CardZone, `${DemoSeat}_hand`>;
}

function validateStaticProductionPaths() {
  if (TV7_TABLE_PLATE_SRC !== "/tv_ed/t/plate.png") {
    throw new Error(
      `Alt table validator: production table plate must be /tv_ed/t/plate.png; received ${TV7_TABLE_PLATE_SRC}.`
    );
  }

  if (TV7_PASSING_OVERLAY_SRC !== "/tv7/p/o.png") {
    throw new Error(
      `Alt table validator: production passing overlay must be /tv7/p/o.png; received ${TV7_PASSING_OVERLAY_SRC}.`
    );
  }

  if (TV7_PASSING_ANCHOR_JSON_SRC !== "/tv7/p/a.json") {
    throw new Error(
      `Alt table validator: production passing anchors must be /tv7/p/a.json; received ${TV7_PASSING_ANCHOR_JSON_SRC}.`
    );
  }

  if (TV7_CARD_ANCHOR_JSON_SRC !== "/tv7/h/a.json") {
    throw new Error(
      `Alt table validator: production card anchors must be /tv7/h/a.json; received ${TV7_CARD_ANCHOR_JSON_SRC}.`
    );
  }

  if (TV7_CARD_MAP_SRC !== "/tv7/c/map.json") {
    throw new Error(
      `Alt table validator: production card map must be /tv7/c/map.json; received ${TV7_CARD_MAP_SRC}.`
    );
  }

  for (const assetPath of [
    TV7_TABLE_PLATE_SRC,
    TV7_PASSING_OVERLAY_SRC,
    TV7_PASSING_ANCHOR_JSON_SRC,
    TV7_CARD_ANCHOR_JSON_SRC,
    TV7_CARD_MAP_SRC
  ]) {
    const normalized = assetPath.toLowerCase();
    if (
      normalized.includes("tv6") ||
      normalized.includes("v3") ||
      normalized.includes("v4") ||
      normalized.includes("v5") ||
      normalized.includes("debug") ||
      normalized.includes("sample") ||
      normalized.includes("red")
    ) {
      throw new Error(
        `Alt table validator: production path ${assetPath} points at a forbidden asset variant.`
      );
    }
  }
}

function validatePassAnchors(rawAnchors: unknown[]) {
  if (!Array.isArray(rawAnchors)) {
    throw new Error(
      "Alt table validator: /tv7/p/a.json does not contain an anchors array."
    );
  }

  if (rawAnchors.length !== LOCKED_PASS_IDS.length) {
    throw new Error(
      `Alt table validator: expected 12 passing anchors in /tv7/p/a.json; received ${rawAnchors.length}.`
    );
  }

  const anchors = rawAnchors.map((rawAnchor) => {
    const source = rawAnchor as Record<string, unknown>;
    const anchor = {
      idx: Number(source.idx ?? source.index ?? 0),
      id: String(source.id ?? ""),
      seat: String(source.seat ?? "") as DemoSeat,
      lane: String(source.lane ?? ""),
      arrow_direction: String(source.arrow_direction ?? ""),
      slot_orientation: String(
        source.slot_orientation ?? source.orientation ?? ""
      ) as PassOrientation,
      slot_rotation_deg: Number(
        source.slot_rotation_deg ??
          source.render_rotation_deg ??
          source.target_rotation_deg ??
          source.visual_rotation_deg ??
          0
      ),
      user_rotation_deg:
        source.user_rotation_deg == null
          ? undefined
          : Number(source.user_rotation_deg),
      card_rotation_hint_deg:
        source.card_rotation_hint_deg == null
          ? source.card_rotation_deg == null
            ? undefined
            : Number(source.card_rotation_deg)
          : Number(source.card_rotation_hint_deg),
      bbox_px: source.bbox_px as DesignBBox,
      center_px: source.center_px as DesignPoint,
      polygon_px: source.polygon_px as DesignPoint[]
    } satisfies Tv7PassAnchor;
    const expected = LOCKED_PASS_ANCHORS[anchor.id];

    if (!expected) {
      throw new Error(
        `Alt table validator: /tv7/p/a.json contains unexpected passing anchor ${String(anchor.id)}.`
      );
    }

    if (anchor.arrow_direction !== expected.dir) {
      throw new Error(
        `Alt table validator: ${anchor.id} arrow_direction must be ${expected.dir}; received ${anchor.arrow_direction}.`
      );
    }

    if (anchor.slot_orientation !== expected.orientation) {
      throw new Error(
        `Alt table validator: ${anchor.id} slot_orientation must be ${expected.orientation}; received ${anchor.slot_orientation}.`
      );
    }

    if (anchor.slot_rotation_deg !== expected.rot) {
      throw new Error(
        `Alt table validator: ${anchor.id} slot_rotation_deg must be ${expected.rot}; received ${anchor.slot_rotation_deg}.`
      );
    }

    if (!anchor.bbox_px || !anchor.center_px || !anchor.polygon_px) {
      throw new Error(
        `Alt table validator: ${anchor.id} is missing required pass geometry.`
      );
    }

    return anchor;
  });

  for (const id of LOCKED_PASS_IDS) {
    if (!anchors.find((anchor) => anchor.id === id)) {
      throw new Error(
        `Alt table validator: required passing anchor ${id} is missing from /tv7/p/a.json.`
      );
    }
  }

  return anchors.sort(
    (left, right) =>
      LOCKED_PASS_IDS.indexOf(left.id) - LOCKED_PASS_IDS.indexOf(right.id)
  );
}

function validateCardAnchors(rawAnchors: unknown[]) {
  if (!Array.isArray(rawAnchors)) {
    throw new Error(
      "Alt table validator: /tv7/h/a.json does not contain an anchors array."
    );
  }

  if (rawAnchors.length !== 58) {
    throw new Error(
      `Alt table validator: expected 58 card anchors in /tv7/h/a.json; received ${rawAnchors.length}.`
    );
  }

  const anchors = rawAnchors.map((rawAnchor) => {
    const source = rawAnchor as Record<string, unknown>;
    const anchor = {
      idx: Number(source.idx ?? source.index ?? 0),
      id: String(source.id ?? ""),
      zone: String(source.zone ?? "") as CardZone,
      kind: String(source.kind ?? source.role ?? ""),
      seat:
        source.seat == null ? null : (String(source.seat) as DemoSeat | null),
      slot: Number(source.slot ?? source.index ?? 0),
      layout_source: String(source.layout_source ?? "prototype_layer") as
        | "prototype_layer",
      role: String(source.role ?? source.kind ?? ""),
      face_policy: String(
        source.face_policy ??
          ((source.seat == null || source.seat === "south") ? "face" : "back")
      ) as "face" | "back",
      orientation: String(
        source.orientation ?? source.card_orientation ?? "portrait"
      ) as "portrait" | "landscape",
      rotation_deg: Number(source.rotation_deg ?? 0),
      w_px: Number(source.w_px ?? 0),
      h_px: Number(source.h_px ?? 0),
      center_px: source.center_px as DesignPoint,
      bbox_px: source.bbox_px as DesignBBox,
      polygon_px: source.polygon_px as DesignPoint[]
    } satisfies Tv7CardAnchor;

    if (!anchor.bbox_px || !anchor.center_px || !anchor.polygon_px) {
      throw new Error(
        `Alt table validator: ${anchor.id} is missing required card geometry.`
      );
    }

    return anchor;
  });

  const zoneCounts = anchors.reduce<Record<string, number>>((counts, anchor) => {
    counts[anchor.zone] = (counts[anchor.zone] ?? 0) + 1;
    return counts;
  }, {});

  const expectedZoneCounts: Record<CardZone, number> = {
    south_hand: 14,
    north_hand: 14,
    west_hand: 14,
    east_hand: 14,
    deck: 1,
    discard: 1
  };

  for (const [zone, expectedCount] of Object.entries(expectedZoneCounts)) {
    if ((zoneCounts[zone] ?? 0) !== expectedCount) {
      throw new Error(
        `Alt table validator: ${zone} must contain ${expectedCount} anchors; received ${zoneCounts[zone] ?? 0}.`
      );
    }
  }

  return anchors.sort((left, right) => left.idx - right.idx);
}

async function validateCardImages(cardMap: Tv7CardMap) {
  const cardSources = [
    ...Object.values(cardMap.standard).flatMap((ranks) =>
      Object.values(ranks).map((src) => toTv7AssetPath(src))
    ),
    ...Object.values(cardMap.special).map((src) => toTv7AssetPath(src)),
    ...Object.values(cardMap.backs).map((src) => toTv7AssetPath(src))
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

function toTv7AssetPath(relativePath: string) {
  return `${TV7_ASSET_ROOT}/${relativePath.replace(/^\/+/, "")}`;
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
