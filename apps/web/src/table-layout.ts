import type { CSSProperties } from "react";
import canonicalLayoutConfigJson from "./layout.json";

export type SeatVisualPosition = "top" | "right" | "bottom" | "left";

const NORMAL_LAYOUT_ELEMENT_IDS = [
  "scoreBadge",
  "northHand",
  "eastHand",
  "southHand",
  "westHand",
  "northStage",
  "eastStage",
  "southStage",
  "westStage",
  "northToEastLane",
  "northToSouthLane",
  "northToWestLane",
  "eastToNorthLane",
  "eastToWestLane",
  "eastToSouthLane",
  "southToWestLane",
  "southToNorthLane",
  "southToEastLane",
  "westToNorthLane",
  "westToEastLane",
  "westToSouthLane",
  "playSurface",
  "actionRow",
  "northLabel",
  "eastLabel",
  "southLabel",
  "westLabel"
] as const;

export type NormalLayoutElementId = (typeof NORMAL_LAYOUT_ELEMENT_IDS)[number];

export type NormalLayoutElement = {
  x: number;
  y: number;
  rotation: number;
};

export type NormalTableLayout = Record<
  NormalLayoutElementId,
  NormalLayoutElement
>;

export type NormalTableSurfaceConfig = {
  widthMode: "relative";
  heightMode: "relative";
  gridSize: number;
};

export type NormalTableLayoutTokens = {
  topHandOverlap: number;
  bottomHandOverlap: number;
  sideHandOverlap: number;
  trickLaneGap: number;
  playCardOverlap: number;
  passCardOverlap: number;
  sideLaneInsetFromHand: number;
  sideLaneVerticalSpacing: number;
  actionAreaGap: number;
  actionButtonGap: number;
  stageCardScale: number;
};

export type NormalTableLayoutConfig = {
  version: number;
  surface: NormalTableSurfaceConfig;
  elements: NormalTableLayout;
  tokens: NormalTableLayoutTokens;
};

type NormalLayoutElementSpec = {
  label: string;
  width: number;
  height: number;
};

export type PassLaneDirection = "up" | "right" | "down" | "left";

export type NormalPassLaneSpec = {
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
};

export type NormalViewportLayoutMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  shellPaddingX: number;
  shellPaddingY: number;
  bandGap: number;
  seatInsetX: number;
  centerInset: number;
  headerHeight: number;
  northBandHeight: number;
  centerBandHeight: number;
  southBandHeight: number;
  actionBandHeight: number;
  sideColumnWidth: number;
  centerColumnWidth: number;
  cardWidth: number;
  cardHeight: number;
  routeCardWidth: number;
  routeCardHeight: number;
  topCardStep: number;
  bottomCardStep: number;
  sideCardStep: number;
  selectedLift: number;
  topMinReveal: number;
  bottomMinReveal: number;
  sideMinReveal: number;
  totalRequiredHeight: number;
  minimumMiddleWidth: number;
  minimumMiddleHeight: number;
};

export type NormalPassLaneGeometry = {
  elementId: NormalLayoutElementId;
  targetPosition: SeatVisualPosition;
  rotation: number;
  width: number;
  height: number;
  style: CSSProperties;
};

export type NormalTrickFanMetrics = {
  cardDx: number;
  cardDy: number;
  rotationStep: number;
  groupDx: number;
  groupDy: number;
};

export type NormalTableSpacing = {
  handToLabelGap: number;
  labelToBadgeGap: number;
  handToStageGap: number;
  handToLaneGap: number;
  sideLaneInsetFromHand: number;
  sideLaneVerticalSpacing: number;
  laneSpacing: number;
  laneToStageGap: number;
  southToActionRowGap: number;
  northToScoreGap: number;
  edgeInset: number;
};

export type NormalSeatLayout = {
  seat: SeatVisualPosition;
  axis: "horizontal" | "vertical";
  nameLabel: CSSProperties;
  callBadge: CSSProperties;
  turnBadge: CSSProperties;
  outBadge: CSSProperties;
  trickZone: CSSProperties;
  pickupZone: CSSProperties;
  handFanDirection: "horizontal" | "vertical";
  trickFanDirection: "down-right" | "up-left" | "left" | "right";
};

export type NormalSeatAnchorId =
  | "northSeat"
  | "eastSeat"
  | "southSeat"
  | "westSeat";

export type NormalHandBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  center: AnchorPoint;
};

export type NormalSeatAnchorGeometry = {
  anchorId: NormalSeatAnchorId;
  position: SeatVisualPosition;
  hand: AnchorPoint;
  handBounds: NormalHandBounds;
  label: AnchorPoint;
  regionStyle: CSSProperties;
};

type NormalSideLabelBorderBounds = {
  left: number;
  right: number;
};

const NORMAL_LAYOUT_TOKEN_KEYS = [
  "topHandOverlap",
  "bottomHandOverlap",
  "sideHandOverlap",
  "trickLaneGap",
  "playCardOverlap",
  "passCardOverlap",
  "sideLaneInsetFromHand",
  "sideLaneVerticalSpacing",
  "actionAreaGap",
  "actionButtonGap",
  "stageCardScale"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertCanonicalLayoutElement(
  elementId: NormalLayoutElementId,
  value: unknown
): NormalLayoutElement {
  if (!isRecord(value)) {
    throw new Error(`Canonical layout is missing a valid "${elementId}" element.`);
  }

  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error(`Canonical layout element "${elementId}" must include finite x/y values.`);
  }

  if (!isFiniteNumber(value.rotation)) {
    throw new Error(
      `Canonical layout element "${elementId}" must include a finite rotation value.`
    );
  }

  return {
    x: value.x,
    y: value.y,
    rotation: value.rotation
  };
}

function assertCanonicalLayoutTokens(value: unknown): NormalTableLayoutTokens {
  if (!isRecord(value)) {
    throw new Error("Canonical layout tokens are missing or invalid.");
  }

  const tokens = {} as NormalTableLayoutTokens;

  for (const key of NORMAL_LAYOUT_TOKEN_KEYS) {
    const tokenValue = value[key];
    if (!isFiniteNumber(tokenValue)) {
      throw new Error(`Canonical layout token "${key}" must be a finite number.`);
    }

    tokens[key] = tokenValue;
  }

  return tokens;
}

function assertCanonicalLayoutConfig(value: unknown): NormalTableLayoutConfig {
  if (!isRecord(value)) {
    throw new Error("Canonical layout config is missing or invalid.");
  }

  if (!isFiniteNumber(value.version)) {
    throw new Error("Canonical layout config must include a numeric version.");
  }

  if (!isRecord(value.surface)) {
    throw new Error("Canonical layout config must include a surface block.");
  }

  const surface = value.surface;
  if (
    surface.widthMode !== "relative" ||
    surface.heightMode !== "relative" ||
    !isFiniteNumber(surface.gridSize)
  ) {
    throw new Error("Canonical layout surface must use the supported relative sizing schema.");
  }

  if (!isRecord(value.elements)) {
    throw new Error("Canonical layout config must include an elements block.");
  }

  const elementsRecord = value.elements;
  const elements = Object.fromEntries(
    NORMAL_LAYOUT_ELEMENT_IDS.map((elementId) => [
      elementId,
      assertCanonicalLayoutElement(elementId, elementsRecord[elementId])
    ])
  ) as NormalTableLayout;

  return {
    version: value.version,
    surface: {
      widthMode: "relative",
      heightMode: "relative",
      gridSize: surface.gridSize
    },
    elements,
    tokens: assertCanonicalLayoutTokens(value.tokens)
  };
}

const CARD_CANONICAL_WIDTH = 5;
const CARD_CANONICAL_HEIGHT = 7;
export const CARD_ASPECT = CARD_CANONICAL_WIDTH / CARD_CANONICAL_HEIGHT;
const CARD_HEIGHT_PER_WIDTH =
  CARD_CANONICAL_HEIGHT / CARD_CANONICAL_WIDTH;
export const NORMAL_PASS_LANE_SCALE = 0.68;
export const NORMAL_BOARD_INSET = {
  top: 10,
  right: 12,
  bottom: 12,
  left: 12
} as const;
const NORMAL_ROUTE_CARD_WIDTH = 60;
const NORMAL_ROUTE_CARD_HEIGHT = Math.round(
  NORMAL_ROUTE_CARD_WIDTH * CARD_HEIGHT_PER_WIDTH
);
const NORMAL_MIN_CARD_WIDTH = 44;
const NORMAL_MAX_CARD_HEIGHT = 132;
const NORMAL_MAX_CARD_HEIGHT_VIEWPORT_SHARE = 0.145;
const NORMAL_PASS_LANE_MIN_WIDTH = 32;
const NORMAL_PASS_LANE_MAX_WIDTH = 72;

const CANONICAL_NORMAL_TABLE_LAYOUT_CONFIG = assertCanonicalLayoutConfig(
  canonicalLayoutConfigJson
);

export const DEFAULT_NORMAL_TABLE_SURFACE: NormalTableSurfaceConfig =
  CANONICAL_NORMAL_TABLE_LAYOUT_CONFIG.surface;

export const DEFAULT_NORMAL_TABLE_LAYOUT: NormalTableLayout =
  CANONICAL_NORMAL_TABLE_LAYOUT_CONFIG.elements;

export const DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS: NormalTableLayoutTokens =
  CANONICAL_NORMAL_TABLE_LAYOUT_CONFIG.tokens;

export const DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG: NormalTableLayoutConfig =
  CANONICAL_NORMAL_TABLE_LAYOUT_CONFIG;

export const NORMAL_LAYOUT_ELEMENT_SPECS: Record<
  NormalLayoutElementId,
  NormalLayoutElementSpec
> = {
  scoreBadge: { label: "Score Badge", width: 136, height: 28 },
  northHand: { label: "North Hand", width: 560, height: 120 },
  eastHand: { label: "East Hand", width: 96, height: 512 },
  southHand: { label: "South Hand", width: 920, height: 140 },
  westHand: { label: "West Hand", width: 96, height: 512 },
  northStage: { label: "North Staging", width: 260, height: 112 },
  eastStage: { label: "East Staging", width: 96, height: 260 },
  southStage: { label: "South Staging", width: 260, height: 112 },
  westStage: { label: "West Staging", width: 96, height: 260 },
  northToEastLane: {
    label: "North -> East",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  northToSouthLane: {
    label: "North -> South",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  northToWestLane: {
    label: "North -> West",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  eastToNorthLane: {
    label: "East -> North",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  eastToWestLane: {
    label: "East -> West",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  eastToSouthLane: {
    label: "East -> South",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  southToWestLane: {
    label: "South -> West",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  southToNorthLane: {
    label: "South -> North",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  southToEastLane: {
    label: "South -> East",
    width: NORMAL_ROUTE_CARD_WIDTH,
    height: NORMAL_ROUTE_CARD_HEIGHT
  },
  westToNorthLane: {
    label: "West -> North",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  westToEastLane: {
    label: "West -> East",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  westToSouthLane: {
    label: "West -> South",
    width: NORMAL_ROUTE_CARD_HEIGHT,
    height: NORMAL_ROUTE_CARD_WIDTH
  },
  playSurface: { label: "Play Surface", width: 920, height: 360 },
  actionRow: { label: "Action Row", width: 340, height: 88 },
  northLabel: { label: "North Label", width: 120, height: 28 },
  eastLabel: { label: "East Label", width: 26, height: 160 },
  southLabel: { label: "South Label", width: 120, height: 28 },
  westLabel: { label: "West Label", width: 26, height: 160 }
};

export const NORMAL_LAYOUT_EDITOR_ORDER: NormalLayoutElementId[] = [
  "scoreBadge",
  "playSurface",
  "northHand",
  "eastHand",
  "southHand",
  "westHand",
  "northStage",
  "eastStage",
  "southStage",
  "westStage",
  "northToEastLane",
  "northToSouthLane",
  "northToWestLane",
  "eastToNorthLane",
  "eastToWestLane",
  "eastToSouthLane",
  "southToWestLane",
  "southToNorthLane",
  "southToEastLane",
  "westToNorthLane",
  "westToEastLane",
  "westToSouthLane",
  "northLabel",
  "eastLabel",
  "southLabel",
  "westLabel",
  "actionRow"
];

export const NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS: Partial<
  Record<NormalLayoutElementId, NormalLayoutElementId>
> = {
  scoreBadge: "actionRow",
  actionRow: "scoreBadge",
  northHand: "southHand",
  southHand: "northHand",
  eastHand: "westHand",
  westHand: "eastHand",
  northStage: "southStage",
  southStage: "northStage",
  eastStage: "westStage",
  westStage: "eastStage",
  northToEastLane: "southToWestLane",
  southToWestLane: "northToEastLane",
  northToSouthLane: "southToNorthLane",
  southToNorthLane: "northToSouthLane",
  northToWestLane: "southToEastLane",
  southToEastLane: "northToWestLane",
  eastToNorthLane: "westToNorthLane",
  westToNorthLane: "eastToNorthLane",
  eastToWestLane: "westToEastLane",
  westToEastLane: "eastToWestLane",
  eastToSouthLane: "westToSouthLane",
  westToSouthLane: "eastToSouthLane",
  northLabel: "southLabel",
  southLabel: "northLabel",
  eastLabel: "westLabel",
  westLabel: "eastLabel"
};

export const NORMAL_HAND_LAYOUT_IDS: Record<
  SeatVisualPosition,
  NormalLayoutElementId
> = {
  top: "northHand",
  right: "eastHand",
  bottom: "southHand",
  left: "westHand"
};

export const NORMAL_LABEL_LAYOUT_IDS: Record<
  SeatVisualPosition,
  NormalLayoutElementId
> = {
  top: "northLabel",
  right: "eastLabel",
  bottom: "southLabel",
  left: "westLabel"
};

export const NORMAL_STAGE_LAYOUT_IDS: Record<
  SeatVisualPosition,
  NormalLayoutElementId
> = {
  top: "northStage",
  right: "eastStage",
  bottom: "southStage",
  left: "westStage"
};

export const NORMAL_PASS_LANE_LAYOUT_IDS: Record<
  SeatVisualPosition,
  Partial<Record<SeatVisualPosition, NormalLayoutElementId>>
> = {
  top: {
    right: "northToEastLane",
    bottom: "northToSouthLane",
    left: "northToWestLane"
  },
  right: {
    top: "eastToNorthLane",
    left: "eastToWestLane",
    bottom: "eastToSouthLane"
  },
  bottom: {
    left: "southToWestLane",
    top: "southToNorthLane",
    right: "southToEastLane"
  },
  left: {
    top: "westToNorthLane",
    right: "westToEastLane",
    bottom: "westToSouthLane"
  }
};

export const NORMAL_PASS_STAGE_MAP: Record<
  SeatVisualPosition,
  readonly NormalPassLaneSpec[]
> = {
  top: [
    { targetPosition: "left", direction: "left" },
    { targetPosition: "bottom", direction: "down" },
    { targetPosition: "right", direction: "right" }
  ],
  left: [
    { targetPosition: "top", direction: "up" },
    { targetPosition: "right", direction: "right" },
    { targetPosition: "bottom", direction: "down" }
  ],
  right: [
    { targetPosition: "top", direction: "up" },
    { targetPosition: "left", direction: "left" },
    { targetPosition: "bottom", direction: "down" }
  ],
  bottom: [
    { targetPosition: "left", direction: "left" },
    { targetPosition: "top", direction: "up" },
    { targetPosition: "right", direction: "right" }
  ]
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getNormalTableSpacing(
  metrics: NormalViewportLayoutMetrics,
  tokens: NormalTableLayoutTokens = DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS
): NormalTableSpacing {
  return {
    handToLabelGap: clampNumber(Math.round(metrics.cardWidth * 0.18), 12, 18),
    labelToBadgeGap: clampNumber(Math.round(metrics.cardWidth * 0.22), 14, 22),
    handToStageGap: clampNumber(Math.round(metrics.cardHeight * 0.28), 24, 36),
    handToLaneGap: clampNumber(Math.round(metrics.routeCardWidth * 0.36), 18, 24),
    sideLaneInsetFromHand: Math.max(0, Math.round(tokens.sideLaneInsetFromHand)),
    sideLaneVerticalSpacing: Math.max(
      0,
      Math.round(tokens.sideLaneVerticalSpacing)
    ),
    laneSpacing: clampNumber(Math.round(metrics.routeCardWidth * 0.16), 8, 12),
    laneToStageGap: clampNumber(Math.round(metrics.cardWidth * 0.24), 16, 24),
    southToActionRowGap: clampNumber(Math.round(metrics.cardHeight * 0.26), 24, 36),
    northToScoreGap: clampNumber(Math.round(metrics.cardHeight * 0.12), 10, 18),
    edgeInset: clampNumber(Math.round(metrics.cardWidth * 0.32), 20, 30)
  };
}

function cardHeightFromWidth(width: number) {
  return Math.round(width * CARD_HEIGHT_PER_WIDTH);
}

function cardWidthFromHeight(height: number) {
  return Math.floor(height * CARD_ASPECT);
}

export function requiredFanSpan(
  count: number,
  cardPrimarySize: number,
  spread: number
) {
  if (count <= 0) {
    return 0;
  }

  return cardPrimarySize + Math.max(0, count - 1) * spread;
}

function fanDensity(count: number) {
  return clampNumber((count - 8) / 6, 0, 1);
}

function resolveFanRevealRange(config: {
  seat: "top" | "bottom" | "side";
  count: number;
  cardWidth: number;
}) {
  const density = fanDensity(config.count);

  if (config.seat === "bottom") {
    const minimumRatio = 0.42 - density * 0.1;
    const maximumRatio = 0.64 - density * 0.12;
    const minimum = Math.max(20, Math.round(config.cardWidth * minimumRatio));
    const maximum = Math.max(
      minimum,
      Math.round(config.cardWidth * maximumRatio)
    );

    return { minimum, maximum };
  }

  if (config.seat === "side") {
    const minimumRatio = 0.16 - density * 0.04;
    const maximumRatio = 0.24 - density * 0.06;
    const minimum = Math.max(10, Math.round(config.cardWidth * minimumRatio));
    const maximum = Math.max(
      minimum,
      Math.round(config.cardWidth * maximumRatio)
    );

    return { minimum, maximum };
  }

  const minimumRatio = 0.18 - density * 0.04;
  const maximumRatio = 0.3 - density * 0.06;
  const minimum = Math.max(10, Math.round(config.cardWidth * minimumRatio));
  const maximum = Math.max(
    minimum,
    Math.round(config.cardWidth * maximumRatio)
  );

  return { minimum, maximum };
}

function calculateFanStep(config: {
  count: number;
  cardPrimarySize: number;
  availableSpan: number;
  minimumReveal: number;
  maximumReveal: number;
}) {
  if (config.count <= 1) {
    return config.cardPrimarySize;
  }

  const unconstrainedSpread =
    (config.availableSpan - config.cardPrimarySize) / (config.count - 1);

  return clampNumber(
    unconstrainedSpread,
    config.minimumReveal,
    Math.max(config.minimumReveal, config.maximumReveal)
  );
}

type BoardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type AnchorPoint = {
  x: number;
  y: number;
  rotation?: number;
};

function boardAnchorStyle(point: AnchorPoint): CSSProperties {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    transform: `translate(-50%, -50%) rotate(${point.rotation ?? 0}deg)`
  };
}

function elementAnchorToPixels(
  element: NormalLayoutElement,
  metrics: NormalViewportLayoutMetrics
): AnchorPoint {
  const board = getBoardBounds(metrics);
  return {
    x: board.left + board.width * element.x,
    y: board.top + board.height * element.y,
    rotation: element.rotation
  };
}

function interpolateAnchorPoint(
  first: AnchorPoint,
  second: AnchorPoint,
  weight: number
): AnchorPoint {
  const clampedWeight = clamp01(weight);
  return {
    x: first.x + (second.x - first.x) * clampedWeight,
    y: first.y + (second.y - first.y) * clampedWeight,
    rotation:
      (first.rotation ?? 0) +
      ((second.rotation ?? 0) - (first.rotation ?? 0)) * clampedWeight
  };
}

function resolveHandSpan(
  seat: SeatVisualPosition,
  handCardCount: number,
  metrics: NormalViewportLayoutMetrics
) {
  if (seat === "bottom") {
    return {
      span: requiredFanSpan(
        handCardCount,
        metrics.cardWidth,
        metrics.bottomCardStep
      ),
      depth: metrics.cardHeight
    };
  }

  if (seat === "top") {
    return {
      span: requiredFanSpan(
        handCardCount,
        metrics.cardWidth,
        metrics.topCardStep
      ),
      depth: metrics.cardHeight
    };
  }

  return {
    span: requiredFanSpan(
      handCardCount,
      metrics.cardHeight,
      metrics.sideCardStep
    ),
    depth: metrics.cardWidth
  };
}

function getNormalSeatAnchorId(position: SeatVisualPosition): NormalSeatAnchorId {
  switch (position) {
    case "top":
      return "northSeat";
    case "right":
      return "eastSeat";
    case "bottom":
      return "southSeat";
    case "left":
      return "westSeat";
  }
}

function resolveNormalHandBounds(config: {
  position: SeatVisualPosition;
  handAnchor: AnchorPoint;
  handCardCount: number;
  layoutMetrics: NormalViewportLayoutMetrics;
}): NormalHandBounds {
  const handMetrics = resolveHandSpan(
    config.position,
    config.handCardCount,
    config.layoutMetrics
  );
  const isSideSeat =
    config.position === "left" || config.position === "right";
  const width = isSideSeat ? handMetrics.depth : handMetrics.span;
  const height = isSideSeat ? handMetrics.span : handMetrics.depth;
  const left = config.handAnchor.x - width / 2;
  const top = config.handAnchor.y - height / 2;

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    center: config.handAnchor
  };
}

function resolveNormalSeatLabelPoint(
  position: SeatVisualPosition,
  handBounds: NormalHandBounds,
  metrics: NormalViewportLayoutMetrics,
  normalTableLayout: NormalTableLayout
): AnchorPoint {
  const { handToLabelGap, northToScoreGap } = getNormalTableSpacing(metrics);
  const sideLabelBorder = getNormalSideLabelBorderBounds(metrics);

  switch (position) {
    case "top": {
      const scoreAnchor = elementAnchorToPixels(
        normalTableLayout.scoreBadge,
        metrics
      );
      return {
        x: handBounds.center.x,
        y:
          scoreAnchor.y +
          NORMAL_LAYOUT_ELEMENT_SPECS.scoreBadge.height / 2 +
          northToScoreGap +
          NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2
      };
    }
    case "bottom":
      return {
        x: handBounds.center.x,
        y:
          handBounds.bottom +
          handToLabelGap +
          NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.height / 2
      };
    case "left":
      return {
        x: (sideLabelBorder.left + handBounds.left) / 2,
        y: handBounds.center.y
      };
    case "right":
      return {
        x: (handBounds.right + sideLabelBorder.right) / 2,
        y: handBounds.center.y
      };
  }
}

export function anchorStyle(element: NormalLayoutElement): CSSProperties {
  return {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`
  };
}

export function resolveNormalBoardAnchorStyle(
  element: NormalLayoutElement,
  metrics: NormalViewportLayoutMetrics
): CSSProperties {
  const anchor = resolveNormalBoardAnchorPoint(element, metrics);
  return boardAnchorStyle(anchor);
}

export function resolveNormalBoardAnchorPoint(
  element: NormalLayoutElement,
  metrics: NormalViewportLayoutMetrics
): AnchorPoint {
  return elementAnchorToPixels(element, metrics);
}

function resolveBoardRectStyle(config: {
  center: AnchorPoint;
  width: number;
  height: number;
}): CSSProperties {
  return {
    left: `${config.center.x - config.width / 2}px`,
    top: `${config.center.y - config.height / 2}px`,
    width: `${config.width}px`,
    height: `${config.height}px`
  };
}

function scaleNormalLayoutElementSize(
  elementId: NormalLayoutElementId,
  scale: number
) {
  const spec = NORMAL_LAYOUT_ELEMENT_SPECS[elementId];

  return {
    width: Math.max(1, Math.round(spec.width * scale)),
    height: Math.max(1, Math.round(spec.height * scale))
  };
}

export function getNormalPassLaneLayoutId(
  sourcePosition: SeatVisualPosition,
  targetPosition: SeatVisualPosition
): NormalLayoutElementId | null {
  return NORMAL_PASS_LANE_LAYOUT_IDS[sourcePosition][targetPosition] ?? null;
}

function getNormalPartnerLaneTargetPosition(
  sourcePosition: SeatVisualPosition
): SeatVisualPosition {
  switch (sourcePosition) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function getNormalPassVisibleRotation(config: {
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  displayMode?: "passing" | "pickup";
}): number {
  if (
    config.targetPosition ===
    getNormalPartnerLaneTargetPosition(config.sourcePosition)
  ) {
    return 0;
  }

  if (config.sourcePosition === "top") {
    return config.targetPosition === "right" ? -90 : 90;
  }

  if (config.sourcePosition === "bottom") {
    return config.targetPosition === "right" ? 90 : -90;
  }

  if (config.sourcePosition === "left") {
    return config.targetPosition === "top" ? -90 : 90;
  }

  if (config.sourcePosition === "right") {
    return config.targetPosition === "bottom" ? 90 : -90;
  }

  return 0;
}

function isQuarterTurn(rotation: number) {
  return Math.abs(rotation % 180) === 90;
}

function getNormalPassVisualSize(config: {
  width: number;
  height: number;
  rotation: number;
}) {
  return isQuarterTurn(config.rotation)
    ? { width: config.height, height: config.width }
    : { width: config.width, height: config.height };
}

function getNormalPassLaneGapMin(
  layoutMetrics: NormalViewportLayoutMetrics
) {
  return clampNumber(
    Math.round(layoutMetrics.routeCardWidth * 0.12),
    4,
    8
  );
}

function getNormalPassClusterAxisNudge(config: {
  sourcePosition: SeatVisualPosition;
  layoutMetrics: NormalViewportLayoutMetrics;
}) {
  if (config.sourcePosition === "top") {
    return -clampNumber(
      Math.round(config.layoutMetrics.routeCardHeight * 0.1),
      6,
      10
    );
  }

  if (config.sourcePosition === "bottom") {
    return clampNumber(
      Math.round(config.layoutMetrics.routeCardHeight * 0.06),
      0,
      6
    );
  }

  return 0;
}

export function resolveNormalPassLaneGeometry(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
  sourceHandCardCount?: number;
  displayMode?: "passing" | "pickup";
  stackAlignment?: "shared-edge" | "centerline";
}): NormalPassLaneGeometry | null {
  const elementId = getNormalPassLaneLayoutId(
    config.sourcePosition,
    config.targetPosition
  );
  if (!elementId) {
    return null;
  }

  const routeScale =
    config.layoutMetrics.routeCardWidth / NORMAL_ROUTE_CARD_WIDTH;
  const size = scaleNormalLayoutElementSize(elementId, routeScale);
  const visibleRotation = getNormalPassVisibleRotation({
    sourcePosition: config.sourcePosition,
    targetPosition: config.targetPosition,
    displayMode: config.displayMode
  });
  const anchorPoint = resolveNormalPassLaneAnchorPoint({
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    sourcePosition: config.sourcePosition,
    targetPosition: config.targetPosition,
    laneWidth: size.width,
    laneHeight: size.height,
    sourceHandCardCount: config.sourceHandCardCount ?? 1,
    displayMode: config.displayMode ?? "passing",
    stackAlignment: config.stackAlignment ?? "shared-edge"
  });

  return {
    elementId,
    targetPosition: config.targetPosition,
    rotation: visibleRotation,
    width: size.width,
    height: size.height,
    style: {
      ...boardAnchorStyle(anchorPoint),
      width: `${size.width}px`,
      height: `${size.height}px`,
      "--normal-pass-visible-rotation": `${visibleRotation}deg`
    } as CSSProperties
  };
}

export function computeNormalViewportLayoutMetrics(config: {
  viewportWidth: number;
  viewportHeight: number;
  topCount: number;
  bottomCount: number;
  leftCount: number;
  rightCount: number;
  hasVariantPicker: boolean;
  hasWishPicker: boolean;
}): NormalViewportLayoutMetrics {
  const viewportWidth = Math.max(320, Math.round(config.viewportWidth));
  const viewportHeight = Math.max(320, Math.round(config.viewportHeight));
  const shellPaddingX = clampNumber(
    Math.round(viewportWidth * 0.0115),
    8,
    18
  );
  const shellPaddingY = clampNumber(
    Math.round(viewportHeight * 0.0125),
    8,
    16
  );
  const bandGap = clampNumber(Math.round(viewportHeight * 0.009), 6, 10);
  const seatInsetX = clampNumber(Math.round(viewportWidth * 0.006), 6, 10);
  const centerInset = clampNumber(Math.round(viewportWidth * 0.008), 8, 14);
  const headerHeight = clampNumber(Math.round(viewportHeight * 0.046), 38, 48);
  const actionBandHeight =
    46 +
    (config.hasVariantPicker ? 38 : 0) +
    (config.hasWishPicker ? 36 : 0);
  const availableShellWidth = viewportWidth - shellPaddingX * 2;
  const availableShellHeight = viewportHeight - shellPaddingY * 2;
  const maximumCandidateWidth = Math.max(
    NORMAL_MIN_CARD_WIDTH,
    cardWidthFromHeight(
      Math.min(
        NORMAL_MAX_CARD_HEIGHT,
        Math.round(availableShellHeight * NORMAL_MAX_CARD_HEIGHT_VIEWPORT_SHARE)
      )
    )
  );
  const northMetaHeight = 28;
  const southMetaHeight = 34;
  const sideLabelWidth = 26;

  let resolvedCardWidth = NORMAL_MIN_CARD_WIDTH;

  for (
    let candidateWidth = maximumCandidateWidth;
    candidateWidth >= NORMAL_MIN_CARD_WIDTH;
    candidateWidth -= 1
  ) {
    const candidateHeight = cardHeightFromWidth(candidateWidth);
    const selectedLift = Math.min(14, Math.round(candidateWidth * 0.14));
    const topReveal = resolveFanRevealRange({
      seat: "top",
      count: config.topCount,
      cardWidth: candidateWidth
    });
    const bottomReveal = resolveFanRevealRange({
      seat: "bottom",
      count: config.bottomCount,
      cardWidth: candidateWidth
    });
    const sideReveal = resolveFanRevealRange({
      seat: "side",
      count: Math.max(config.leftCount, config.rightCount),
      cardWidth: candidateWidth
    });
    const northBandHeight = candidateHeight + northMetaHeight;
    const southBandHeight = candidateHeight + southMetaHeight + selectedLift;
    const routeCardWidth = clampNumber(
      Math.round(candidateWidth * NORMAL_PASS_LANE_SCALE),
      NORMAL_PASS_LANE_MIN_WIDTH,
      Math.min(candidateWidth - 12, NORMAL_PASS_LANE_MAX_WIDTH)
    );
    const routeCardHeight = cardHeightFromWidth(routeCardWidth);
    const sideColumnWidth =
      candidateWidth + sideLabelWidth + seatInsetX * 2 + centerInset;
    const minimumMiddleWidth = Math.max(
      260,
      Math.round(candidateWidth * 3.4),
      routeCardWidth * 4 + centerInset * 2
    );
    const centerColumnWidth =
      availableShellWidth - sideColumnWidth * 2 - bandGap * 2;
    if (centerColumnWidth < minimumMiddleWidth) {
      continue;
    }

    const centerBandHeight =
      availableShellHeight -
      headerHeight -
      northBandHeight -
      southBandHeight -
      actionBandHeight -
      bandGap * 4;
    const minimumMiddleHeight = Math.max(
      180,
      routeCardHeight * 2 + centerInset * 2,
      Math.round(candidateHeight * 2.2)
    );

    if (centerBandHeight < minimumMiddleHeight) {
      continue;
    }

    resolvedCardWidth = candidateWidth;
    return {
      viewportWidth,
      viewportHeight,
      shellPaddingX,
      shellPaddingY,
      bandGap,
      seatInsetX,
      centerInset,
      headerHeight,
      northBandHeight,
      centerBandHeight,
      southBandHeight,
      actionBandHeight,
      sideColumnWidth,
      centerColumnWidth,
      cardWidth: candidateWidth,
      cardHeight: candidateHeight,
      routeCardWidth,
      routeCardHeight,
      topCardStep: calculateFanStep({
        count: config.topCount,
        cardPrimarySize: candidateWidth,
        availableSpan: centerColumnWidth - seatInsetX * 2,
        minimumReveal: topReveal.minimum,
        maximumReveal: topReveal.maximum
      }),
      bottomCardStep: calculateFanStep({
        count: config.bottomCount,
        cardPrimarySize: candidateWidth,
        availableSpan: centerColumnWidth - seatInsetX * 2,
        minimumReveal: bottomReveal.minimum,
        maximumReveal: bottomReveal.maximum
      }),
      sideCardStep: calculateFanStep({
        count: Math.max(config.leftCount, config.rightCount),
        cardPrimarySize: candidateHeight,
        availableSpan: centerBandHeight - 16,
        minimumReveal: sideReveal.minimum,
        maximumReveal: sideReveal.maximum
      }),
      selectedLift,
      topMinReveal: topReveal.minimum,
      bottomMinReveal: bottomReveal.minimum,
      sideMinReveal: sideReveal.minimum,
      totalRequiredHeight:
        headerHeight +
        northBandHeight +
        centerBandHeight +
        southBandHeight +
        actionBandHeight +
        bandGap * 4,
      minimumMiddleWidth,
      minimumMiddleHeight
    };
  }

  const fallbackCardHeight = cardHeightFromWidth(resolvedCardWidth);
  const fallbackSelectedLift = Math.min(14, Math.round(resolvedCardWidth * 0.14));
  const fallbackRouteCardWidth = clampNumber(
    Math.round(resolvedCardWidth * NORMAL_PASS_LANE_SCALE),
    NORMAL_PASS_LANE_MIN_WIDTH,
    Math.min(resolvedCardWidth - 12, NORMAL_PASS_LANE_MAX_WIDTH)
  );
  const fallbackRouteCardHeight = cardHeightFromWidth(fallbackRouteCardWidth);
  const fallbackNorthBandHeight = fallbackCardHeight + 28;
  const fallbackSouthBandHeight = fallbackCardHeight + 34 + fallbackSelectedLift;
  const fallbackSideColumnWidth =
    resolvedCardWidth + 26 + seatInsetX * 2 + centerInset;
  const fallbackCenterColumnWidth = Math.max(
    260,
    availableShellWidth - fallbackSideColumnWidth * 2 - bandGap * 2
  );
  const fallbackCenterBandHeight = Math.max(
    180,
    availableShellHeight -
      headerHeight -
      fallbackNorthBandHeight -
      fallbackSouthBandHeight -
      actionBandHeight -
      bandGap * 4
  );

  return {
    viewportWidth,
    viewportHeight,
    shellPaddingX,
    shellPaddingY,
    bandGap,
    seatInsetX,
    centerInset,
    headerHeight,
    northBandHeight: fallbackNorthBandHeight,
    centerBandHeight: fallbackCenterBandHeight,
    southBandHeight: fallbackSouthBandHeight,
    actionBandHeight,
    sideColumnWidth: fallbackSideColumnWidth,
    centerColumnWidth: fallbackCenterColumnWidth,
    cardWidth: resolvedCardWidth,
    cardHeight: fallbackCardHeight,
    routeCardWidth: fallbackRouteCardWidth,
    routeCardHeight: fallbackRouteCardHeight,
    topCardStep: fallbackCenterColumnWidth,
    bottomCardStep: fallbackCenterColumnWidth,
    sideCardStep: fallbackCenterBandHeight,
    selectedLift: fallbackSelectedLift,
    topMinReveal: Math.max(10, Math.round(resolvedCardWidth * 0.18)),
    bottomMinReveal: Math.max(20, Math.round(resolvedCardWidth * 0.42)),
    sideMinReveal: Math.max(10, Math.round(resolvedCardWidth * 0.16)),
    totalRequiredHeight:
      headerHeight +
      fallbackNorthBandHeight +
      fallbackCenterBandHeight +
      fallbackSouthBandHeight +
      actionBandHeight +
      bandGap * 4,
    minimumMiddleWidth: Math.max(260, Math.round(resolvedCardWidth * 3.4)),
    minimumMiddleHeight: Math.max(
      180,
      fallbackRouteCardHeight * 2 + centerInset * 2
    )
  };
}

export function getBoardBounds(
  metrics: NormalViewportLayoutMetrics
): BoardRect {
  const boardViewportWidth = Math.max(
    0,
    metrics.viewportWidth - metrics.shellPaddingX * 2
  );
  const boardViewportHeight = Math.max(
    0,
    metrics.viewportHeight - metrics.shellPaddingY * 2
  );
  const width = Math.max(
    0,
    boardViewportWidth - NORMAL_BOARD_INSET.left - NORMAL_BOARD_INSET.right
  );
  const height = Math.max(
    0,
    boardViewportHeight - NORMAL_BOARD_INSET.top - NORMAL_BOARD_INSET.bottom
  );

  return {
    left: NORMAL_BOARD_INSET.left,
    top: NORMAL_BOARD_INSET.top,
    width,
    height,
    right: NORMAL_BOARD_INSET.left + width,
    bottom: NORMAL_BOARD_INSET.top + height
  };
}

function getNormalSideLabelBorderBounds(
  metrics: NormalViewportLayoutMetrics
): NormalSideLabelBorderBounds {
  const board = getBoardBounds(metrics);

  return {
    left: board.left - NORMAL_BOARD_INSET.left,
    right: board.right + NORMAL_BOARD_INSET.right
  };
}

function getNormalPlayAreaBounds(
  normalTableLayout: NormalTableLayout,
  metrics: NormalViewportLayoutMetrics
): BoardRect {
  const center = elementAnchorToPixels(normalTableLayout.playSurface, metrics);
  const width = metrics.centerColumnWidth;
  const height = metrics.centerBandHeight;
  const left = center.x - width / 2;
  const top = center.y - height / 2;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

export function resolveNormalSeatAnchorGeometry(config: {
  position: SeatVisualPosition;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  handCardCount: number;
}): NormalSeatAnchorGeometry {
  const baseHand = elementAnchorToPixels(
    config.normalTableLayout[NORMAL_HAND_LAYOUT_IDS[config.position]],
    config.layoutMetrics
  );
  const handMetrics = resolveHandSpan(
    config.position,
    config.handCardCount,
    config.layoutMetrics
  );
  const isSideSeat =
    config.position === "left" || config.position === "right";
  const hand = { ...baseHand };

  if (config.position === "top") {
    const spacing = getNormalTableSpacing(config.layoutMetrics);
    const scoreAnchor = elementAnchorToPixels(
      config.normalTableLayout.scoreBadge,
      config.layoutMetrics
    );
    const northLabelCenterY =
      scoreAnchor.y +
      NORMAL_LAYOUT_ELEMENT_SPECS.scoreBadge.height / 2 +
      spacing.northToScoreGap +
      NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2;
    const northTightening = clampNumber(
      Math.round(config.layoutMetrics.cardHeight * 0.08),
      4,
      8
    );
    const minimumHandCenterY =
      northLabelCenterY +
      NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2 +
      spacing.handToLabelGap +
      handMetrics.depth / 2 -
      northTightening;

    hand.y = Math.max(hand.y, minimumHandCenterY);
  }

  if (isSideSeat) {
    const spacing = getNormalTableSpacing(config.layoutMetrics);
    const playArea = getNormalPlayAreaBounds(
      config.normalTableLayout,
      config.layoutMetrics
    );
    const sideHandWidth = handMetrics.depth;
    const sideInset = clampNumber(
      Math.round(config.layoutMetrics.cardWidth * 0.36),
      24,
      30
    );

    hand.y = playArea.top + playArea.height / 2;
    hand.x =
      config.position === "left"
        ? playArea.left - spacing.handToLaneGap - sideHandWidth / 2 + sideInset
        : playArea.right + spacing.handToLaneGap + sideHandWidth / 2 - sideInset;
  }

  const handBounds = resolveNormalHandBounds({
    position: config.position,
    handAnchor: hand,
    handCardCount: config.handCardCount,
    layoutMetrics: config.layoutMetrics
  });
  const label = resolveNormalSeatLabelPoint(
    config.position,
    handBounds,
    config.layoutMetrics,
    config.normalTableLayout
  );

  let regionStyle: CSSProperties;
  switch (config.position) {
    case "top":
      regionStyle = {
        position: "absolute",
        ...resolveBoardRectStyle({
          center: hand,
          width: config.layoutMetrics.centerColumnWidth,
          height: config.layoutMetrics.northBandHeight
        })
      };
      break;
    case "bottom":
      regionStyle = {
        position: "absolute",
        ...resolveBoardRectStyle({
          center: hand,
          width: config.layoutMetrics.centerColumnWidth,
          height: config.layoutMetrics.southBandHeight
        })
      };
      break;
    case "left":
    case "right":
      regionStyle = {
        position: "absolute",
        ...resolveBoardRectStyle({
          center: hand,
          width: Math.max(config.layoutMetrics.sideColumnWidth, handBounds.width),
          height: config.layoutMetrics.centerBandHeight
        })
      };
      break;
  }

  return {
    anchorId: getNormalSeatAnchorId(config.position),
    position: config.position,
    hand,
    handBounds,
    label,
    regionStyle
  };
}

export function resolveNormalPlaySurfaceRegionStyle(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const playArea = getNormalPlayAreaBounds(
    config.normalTableLayout,
    config.layoutMetrics
  );

  return {
    position: "absolute",
    ...resolveBoardRectStyle({
      center: {
        x: playArea.left + playArea.width / 2,
        y: playArea.top + playArea.height / 2
      },
      width: playArea.width,
      height: playArea.height
    })
  };
}

export function resolveNormalActionRowRegionStyle(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const board = getBoardBounds(config.layoutMetrics);
  const southAnchor = resolveNormalSeatAnchorGeometry({
    position: "bottom",
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    handCardCount: 1
  });
  const { southToActionRowGap } = getNormalTableSpacing(config.layoutMetrics);
  const southLabelHeight = NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.height;
  const center = {
    x: board.left + board.width * config.normalTableLayout.actionRow.x,
    y: Math.min(
      board.bottom - config.layoutMetrics.actionBandHeight / 2,
      southAnchor.label.y +
        southLabelHeight / 2 +
        southToActionRowGap +
        config.layoutMetrics.actionBandHeight / 2
    ),
    rotation: config.normalTableLayout.actionRow.rotation
  };

  return {
    position: "absolute",
    ...resolveBoardRectStyle({
      center,
      width: config.layoutMetrics.centerColumnWidth,
      height: config.layoutMetrics.actionBandHeight
    })
  };
}

function resolveNormalPassLaneAnchorPoint(config: {
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  laneWidth: number;
  laneHeight: number;
  sourceHandCardCount: number;
  displayMode: "passing" | "pickup";
  stackAlignment?: "shared-edge" | "centerline";
}): AnchorPoint {
  const rawLaneSize = {
    width: config.laneWidth,
    height: config.laneHeight
  };
  const sourceAnchor = resolveNormalSeatAnchorGeometry({
    position: config.sourcePosition,
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    handCardCount: config.sourceHandCardCount
  });
  const playArea = getNormalPlayAreaBounds(
    config.normalTableLayout,
    config.layoutMetrics
  );
  const partnerTargetPosition = getNormalPartnerLaneTargetPosition(
    config.sourcePosition
  );
  const partnerRotation = getNormalPassVisibleRotation({
    sourcePosition: config.sourcePosition,
    targetPosition: partnerTargetPosition,
    displayMode: config.displayMode
  });
  const partnerVisualSize = getNormalPassVisualSize({
    ...rawLaneSize,
    rotation: partnerRotation
  });
  const laneRotation = getNormalPassVisibleRotation({
    sourcePosition: config.sourcePosition,
    targetPosition: config.targetPosition,
    displayMode: config.displayMode
  });
  const laneVisualSize = getNormalPassVisualSize({
    ...rawLaneSize,
    rotation: laneRotation
  });
  const laneGapMin = getNormalPassLaneGapMin(config.layoutMetrics);
  const partnerOffsetIndex =
    config.targetPosition === partnerTargetPosition
      ? 0
      : NORMAL_PASS_STAGE_MAP[config.sourcePosition].findIndex(
            (laneSpec) => laneSpec.targetPosition === config.targetPosition
          ) < NORMAL_PASS_STAGE_MAP[config.sourcePosition].findIndex(
            (laneSpec) => laneSpec.targetPosition === partnerTargetPosition
          )
        ? -1
        : 1;
  const { handToLaneGap, sideLaneInsetFromHand, sideLaneVerticalSpacing } =
    getNormalTableSpacing(config.layoutMetrics);
  const laneClusterStep =
    config.sourcePosition === "top" || config.sourcePosition === "bottom"
      ? partnerVisualSize.width / 2 +
        laneGapMin +
        laneVisualSize.width / 2
      : partnerVisualSize.height / 2 +
        sideLaneVerticalSpacing +
        laneVisualSize.height / 2;
  const axisNudge = getNormalPassClusterAxisNudge({
    sourcePosition: config.sourcePosition,
    layoutMetrics: config.layoutMetrics
  });
  const partnerAnchor =
    config.sourcePosition === "top"
      ? {
          x: playArea.left + playArea.width / 2,
          y:
            sourceAnchor.handBounds.bottom +
            handToLaneGap +
            partnerVisualSize.height / 2 +
            axisNudge
        }
      : config.sourcePosition === "bottom"
        ? {
            x: playArea.left + playArea.width / 2,
            y:
              sourceAnchor.handBounds.top -
              handToLaneGap -
              partnerVisualSize.height / 2 +
              axisNudge
          }
        : config.sourcePosition === "left"
          ? {
              x:
                sourceAnchor.handBounds.right +
                sideLaneInsetFromHand +
                partnerVisualSize.width / 2,
              y: playArea.top + playArea.height / 2
            }
          : {
              x:
                sourceAnchor.handBounds.left -
                sideLaneInsetFromHand -
                partnerVisualSize.width / 2,
              y: playArea.top + playArea.height / 2
            };

  switch (config.sourcePosition) {
    case "top":
      return {
        x: partnerAnchor.x + partnerOffsetIndex * laneClusterStep,
        y:
          partnerAnchor.y +
          (laneVisualSize.height - partnerVisualSize.height) / 2
      };
    case "bottom":
      return {
        x: partnerAnchor.x + partnerOffsetIndex * laneClusterStep,
        y:
          partnerAnchor.y +
          (partnerVisualSize.height - laneVisualSize.height) / 2
      };
    case "left":
      return {
        x:
          config.stackAlignment === "centerline"
            ? partnerAnchor.x
            : partnerAnchor.x +
              (laneVisualSize.width - partnerVisualSize.width) / 2,
        y: partnerAnchor.y + partnerOffsetIndex * laneClusterStep
      };
    case "right":
      return {
        x:
          config.stackAlignment === "centerline"
            ? partnerAnchor.x
            : partnerAnchor.x +
              (partnerVisualSize.width - laneVisualSize.width) / 2,
        y: partnerAnchor.y + partnerOffsetIndex * laneClusterStep
      };
  }
}

export function resolveNormalSeatRegionStyle(config: {
  position: SeatVisualPosition;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  handCardCount?: number;
}): CSSProperties {
  return resolveNormalSeatAnchorGeometry({
    position: config.position,
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    handCardCount: config.handCardCount ?? 1
  }).regionStyle;
}

export function getNormalTrickFanMetrics(
  position: SeatVisualPosition,
  trickCardWidth: number
): NormalTrickFanMetrics {
  const horizontalStep = Math.max(14, Math.round(trickCardWidth * 0.3));
  const verticalStep = Math.max(14, Math.round(trickCardWidth * 0.34));
  const groupHorizontal = Math.max(18, Math.round(trickCardWidth * 0.34));
  const groupVertical = Math.max(18, Math.round(trickCardWidth * 0.38));

  switch (position) {
    case "bottom":
    case "top":
      return {
        cardDx: horizontalStep,
        cardDy: 0,
        rotationStep: 0,
        groupDx: groupHorizontal,
        groupDy: 0
      };
    case "right":
    case "left":
      return {
        cardDx: 0,
        cardDy: verticalStep,
        rotationStep: 0,
        groupDx: 0,
        groupDy: groupVertical
      };
  }
}

function getNormalStageCardSize(metrics: NormalViewportLayoutMetrics) {
  const width = Math.min(84, Math.max(44, Math.round(metrics.cardWidth * 0.82)));

  return {
    width,
    height: Math.round(width * CARD_HEIGHT_PER_WIDTH)
  };
}

function resolveNormalStagePoint(
  position: SeatVisualPosition,
  seatAnchor: NormalSeatAnchorGeometry,
  metrics: NormalViewportLayoutMetrics
): AnchorPoint {
  const spacing = getNormalTableSpacing(metrics);
  const stageCardSize = getNormalStageCardSize(metrics);
  const laneBandDepth = Math.max(metrics.routeCardWidth, metrics.routeCardHeight);
  const stageGap = Math.max(
    spacing.handToStageGap,
    spacing.handToLaneGap + laneBandDepth + spacing.laneToStageGap
  );

  switch (position) {
    case "top":
      return {
        x: seatAnchor.handBounds.center.x,
        y: seatAnchor.handBounds.bottom + stageGap + stageCardSize.height / 2
      };
    case "bottom":
      return {
        x: seatAnchor.handBounds.center.x,
        y: seatAnchor.handBounds.top - stageGap - stageCardSize.height / 2
      };
    case "left":
      return {
        x: seatAnchor.handBounds.right + stageGap + stageCardSize.width / 2,
        y: seatAnchor.handBounds.center.y
      };
    case "right":
      return {
        x: seatAnchor.handBounds.left - stageGap - stageCardSize.width / 2,
        y: seatAnchor.handBounds.center.y
      };
  }
}

function resolveNormalTrickPoint(
  position: SeatVisualPosition,
  handCardCount: number,
  metrics: NormalViewportLayoutMetrics,
  normalTableLayout: NormalTableLayout
): AnchorPoint {
  const middleLaneSpec = NORMAL_PASS_STAGE_MAP[position][1];
  const elementId = middleLaneSpec
    ? getNormalPassLaneLayoutId(position, middleLaneSpec.targetPosition)
    : null;

  if (!middleLaneSpec || !elementId) {
    return elementAnchorToPixels(
      normalTableLayout[NORMAL_STAGE_LAYOUT_IDS[position]],
      metrics
    );
  }

  const routeScale = metrics.routeCardWidth / NORMAL_ROUTE_CARD_WIDTH;
  const laneSize = scaleNormalLayoutElementSize(elementId, routeScale);

  return resolveNormalPassLaneAnchorPoint({
    sourcePosition: position,
    targetPosition: middleLaneSpec.targetPosition,
    normalTableLayout,
    layoutMetrics: metrics,
    laneWidth: laneSize.width,
    laneHeight: laneSize.height,
    sourceHandCardCount: handCardCount
  });
}

export function resolveNormalStageAnchorStyle(
  normalTableLayout: NormalTableLayout,
  position: SeatVisualPosition
): CSSProperties {
  return anchorStyle(normalTableLayout[NORMAL_STAGE_LAYOUT_IDS[position]]);
}

export function getNormalSeatLayout(config: {
  position: SeatVisualPosition;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  handCardCount: number;
}): NormalSeatLayout {
  const seatAnchor = resolveNormalSeatAnchorGeometry({
    position: config.position,
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    handCardCount: config.handCardCount
  });
  const stageAnchor = resolveNormalStagePoint(
    config.position,
    seatAnchor,
    config.layoutMetrics
  );
  const trickAnchor = resolveNormalTrickPoint(
    config.position,
    config.handCardCount,
    config.layoutMetrics,
    config.normalTableLayout
  );
  const pickupAnchor = interpolateAnchorPoint(seatAnchor.hand, stageAnchor, 0.52);

  const nameLabelPoint = seatAnchor.label;
  let callBadgePoint = seatAnchor.label;
  let turnBadgePoint = seatAnchor.label;
  let outBadgePoint = seatAnchor.label;
  const { labelToBadgeGap } = getNormalTableSpacing(config.layoutMetrics);
  const badgeStep = clampNumber(
    Math.round(config.layoutMetrics.cardWidth * 0.58),
    38,
    52
  );
  const sideBadgeY =
    seatAnchor.handBounds.top - labelToBadgeGap;

  switch (config.position) {
    case "bottom":
      callBadgePoint = {
        x:
          nameLabelPoint.x -
          NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.width / 2 -
          labelToBadgeGap,
        y: nameLabelPoint.y
      };
      turnBadgePoint = {
        x:
          nameLabelPoint.x -
          NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.width / 2 -
          labelToBadgeGap -
          badgeStep,
        y: nameLabelPoint.y
      };
      outBadgePoint = {
        x:
          nameLabelPoint.x -
          NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.width / 2 -
          labelToBadgeGap -
          badgeStep * 2,
        y: nameLabelPoint.y
      };
      break;
    case "top":
      callBadgePoint = {
        x:
          nameLabelPoint.x +
          NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.width / 2 +
          labelToBadgeGap,
        y: nameLabelPoint.y
      };
      turnBadgePoint = {
        x:
          nameLabelPoint.x +
          NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.width / 2 +
          labelToBadgeGap +
          badgeStep,
        y: nameLabelPoint.y
      };
      outBadgePoint = {
        x:
          nameLabelPoint.x +
          NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.width / 2 +
          labelToBadgeGap +
          badgeStep * 2,
        y: nameLabelPoint.y
      };
      break;
    case "left":
      callBadgePoint = {
        x: seatAnchor.hand.x - badgeStep / 2,
        y: sideBadgeY
      };
      outBadgePoint = {
        x: seatAnchor.hand.x + badgeStep / 2,
        y: sideBadgeY
      };
      break;
    case "right":
      callBadgePoint = {
        x: seatAnchor.hand.x - badgeStep / 2,
        y: sideBadgeY
      };
      outBadgePoint = {
        x: seatAnchor.hand.x + badgeStep / 2,
        y: sideBadgeY
      };
      break;
  }

  return {
    seat: config.position,
    axis:
      config.position === "left" || config.position === "right"
        ? "vertical"
        : "horizontal",
    nameLabel: boardAnchorStyle(nameLabelPoint),
    callBadge: boardAnchorStyle(callBadgePoint),
    turnBadge: boardAnchorStyle(turnBadgePoint),
    outBadge: boardAnchorStyle(outBadgePoint),
    trickZone: boardAnchorStyle(trickAnchor),
    pickupZone: boardAnchorStyle(pickupAnchor),
    handFanDirection:
      config.position === "left" || config.position === "right"
        ? "vertical"
        : "horizontal",
    trickFanDirection:
      config.position === "top"
        ? "down-right"
        : config.position === "bottom"
          ? "up-left"
          : config.position === "right"
            ? "left"
            : "right"
  };
}
