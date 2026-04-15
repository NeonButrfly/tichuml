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

const NORMAL_LAYOUT_TOKEN_KEYS = [
  "topHandOverlap",
  "bottomHandOverlap",
  "sideHandOverlap",
  "trickLaneGap",
  "playCardOverlap",
  "passCardOverlap",
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
  eastLabel: { label: "East Label", width: 32, height: 160 },
  southLabel: { label: "South Label", width: 120, height: 28 },
  westLabel: { label: "West Label", width: 32, height: 160 }
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
    { targetPosition: "bottom", direction: "down" },
    { targetPosition: "right", direction: "right" }
  ],
  right: [
    { targetPosition: "top", direction: "up" },
    { targetPosition: "bottom", direction: "down" },
    { targetPosition: "left", direction: "left" }
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

function offsetAnchorPoint(
  point: AnchorPoint,
  deltaX: number,
  deltaY: number
): AnchorPoint {
  return {
    x: point.x + deltaX,
    y: point.y + deltaY,
    rotation: point.rotation
  };
}

function resolvePassLaneInwardOffset(
  sourcePosition: SeatVisualPosition,
  metrics: NormalViewportLayoutMetrics
): { x: number; y: number } {
  const inwardOffset = Math.max(
    18,
    Math.round(Math.max(metrics.routeCardWidth, metrics.routeCardHeight) * 0.42)
  );

  switch (sourcePosition) {
    case "top":
      return { x: 0, y: inwardOffset };
    case "bottom":
      return { x: 0, y: -inwardOffset };
    case "left":
      return { x: inwardOffset, y: 0 };
    case "right":
      return { x: -inwardOffset, y: 0 };
  }
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

function getPassTokenRotation(direction: PassLaneDirection): number {
  switch (direction) {
    case "right":
      return 90;
    case "left":
      return -90;
    default:
      return 0;
  }
}

export function resolveNormalPassLaneGeometry(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
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
  const layoutElement = config.normalTableLayout[elementId];
  const size = scaleNormalLayoutElementSize(elementId, routeScale);
  const anchorPoint = offsetAnchorPoint(
    resolveNormalBoardAnchorPoint(layoutElement, config.layoutMetrics),
    resolvePassLaneInwardOffset(config.sourcePosition, config.layoutMetrics).x,
    resolvePassLaneInwardOffset(config.sourcePosition, config.layoutMetrics).y
  );

  return {
    elementId,
    targetPosition: config.targetPosition,
    rotation: layoutElement.rotation,
    width: size.width,
    height: size.height,
    style: {
      ...boardAnchorStyle(anchorPoint),
      width: `${size.width}px`,
      height: `${size.height}px`,
      "--normal-pass-token-rotation": `${getPassTokenRotation(config.direction) - layoutElement.rotation}deg`
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
      candidateHeight + sideLabelWidth + seatInsetX * 2 + 6;
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
    fallbackCardHeight + 26 + seatInsetX * 2 + 6;
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
  const width = Math.max(
    0,
    metrics.viewportWidth - NORMAL_BOARD_INSET.left - NORMAL_BOARD_INSET.right
  );
  const height = Math.max(
    0,
    metrics.viewportHeight - NORMAL_BOARD_INSET.top - NORMAL_BOARD_INSET.bottom
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

export function resolveNormalPlaySurfaceRegionStyle(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const center = elementAnchorToPixels(
    config.normalTableLayout.playSurface,
    config.layoutMetrics
  );

  return {
    position: "absolute",
    ...resolveBoardRectStyle({
      center,
      width: config.layoutMetrics.centerColumnWidth,
      height: config.layoutMetrics.centerBandHeight
    })
  };
}

export function resolveNormalActionRowRegionStyle(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const center = elementAnchorToPixels(
    config.normalTableLayout.actionRow,
    config.layoutMetrics
  );

  return {
    position: "absolute",
    ...resolveBoardRectStyle({
      center,
      width: config.layoutMetrics.centerColumnWidth,
      height: config.layoutMetrics.actionBandHeight
    })
  };
}

export function resolveNormalSeatRegionStyle(config: {
  position: SeatVisualPosition;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const center = elementAnchorToPixels(
    config.normalTableLayout[NORMAL_HAND_LAYOUT_IDS[config.position]],
    config.layoutMetrics
  );

  switch (config.position) {
    case "top":
      return {
        position: "absolute",
        ...resolveBoardRectStyle({
          center,
          width: config.layoutMetrics.centerColumnWidth,
          height: config.layoutMetrics.northBandHeight
        })
      };
    case "bottom":
      return {
        position: "absolute",
        ...resolveBoardRectStyle({
          center,
          width: config.layoutMetrics.centerColumnWidth,
          height: config.layoutMetrics.southBandHeight
        })
      };
    case "left":
    case "right":
      return {
        position: "absolute",
        ...resolveBoardRectStyle({
          center,
          width: config.layoutMetrics.sideColumnWidth,
          height: config.layoutMetrics.centerBandHeight
        })
      };
  }
}

export function getNormalTrickFanMetrics(
  position: SeatVisualPosition,
  trickCardWidth: number
): NormalTrickFanMetrics {
  const horizontalStep = Math.max(11, Math.round(trickCardWidth * 0.22));
  const verticalStep = Math.max(7, Math.round(trickCardWidth * 0.12));
  const groupHorizontal = Math.max(16, Math.round(trickCardWidth * 0.28));
  const groupVertical = Math.max(10, Math.round(trickCardWidth * 0.18));

  switch (position) {
    case "bottom":
      return {
        cardDx: -horizontalStep,
        cardDy: -verticalStep,
        rotationStep: -4,
        groupDx: -groupHorizontal,
        groupDy: -groupVertical
      };
    case "right":
      return {
        cardDx: -horizontalStep,
        cardDy: 0,
        rotationStep: -2,
        groupDx: -groupHorizontal,
        groupDy: 0
      };
    case "left":
      return {
        cardDx: horizontalStep,
        cardDy: 0,
        rotationStep: 2,
        groupDx: groupHorizontal,
        groupDy: 0
      };
    default:
      return {
        cardDx: horizontalStep,
        cardDy: verticalStep,
        rotationStep: 4,
        groupDx: groupHorizontal,
        groupDy: groupVertical
      };
  }
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
  const handElement =
    config.normalTableLayout[NORMAL_HAND_LAYOUT_IDS[config.position]];
  const trickElement =
    config.normalTableLayout[NORMAL_STAGE_LAYOUT_IDS[config.position]];
  const handAnchor = elementAnchorToPixels(handElement, config.layoutMetrics);
  const trickAnchor = elementAnchorToPixels(trickElement, config.layoutMetrics);
  const actionAnchor = elementAnchorToPixels(
    config.normalTableLayout.actionRow,
    config.layoutMetrics
  );
  const labelAnchor = elementAnchorToPixels(
    config.normalTableLayout[NORMAL_LABEL_LAYOUT_IDS[config.position]],
    config.layoutMetrics
  );
  const boardBounds = getBoardBounds(config.layoutMetrics);
  const handMetrics = resolveHandSpan(
    config.position,
    config.handCardCount,
    config.layoutMetrics
  );
  const handLeft =
    config.position === "left" || config.position === "right"
      ? handAnchor.x - handMetrics.depth / 2
      : handAnchor.x - handMetrics.span / 2;
  const handRight =
    config.position === "left" || config.position === "right"
      ? handAnchor.x + handMetrics.depth / 2
      : handAnchor.x + handMetrics.span / 2;
  const handTop =
    config.position === "left" || config.position === "right"
      ? handAnchor.y - handMetrics.span / 2
      : handAnchor.y - handMetrics.depth / 2;
  const horizontalBadgeOffset = Math.max(
    18,
    Math.round(config.layoutMetrics.cardWidth * 0.36)
  );
  const verticalBadgeOffset = Math.max(
    18,
    Math.round(config.layoutMetrics.cardHeight * 0.32)
  );
  const sideLabelEdgeInset = Math.max(
    24,
    Math.round(config.layoutMetrics.cardWidth * 0.46)
  );
  const sideLabelHandGap = Math.max(
    12,
    Math.round(config.layoutMetrics.cardWidth * 0.18)
  );
  const pickupAnchor = interpolateAnchorPoint(handAnchor, trickAnchor, 0.52);

  let nameLabelPoint = labelAnchor;
  let callBadgePoint = labelAnchor;
  let turnBadgePoint = labelAnchor;
  let outBadgePoint = labelAnchor;

  switch (config.position) {
    case "bottom":
      nameLabelPoint = {
        x: labelAnchor.x,
        y: Math.min(
          actionAnchor.y - config.layoutMetrics.actionBandHeight / 2 - 10,
          Math.max(
            labelAnchor.y,
            handTop - Math.max(14, Math.round(config.layoutMetrics.cardHeight * 0.16))
          )
        )
      };
      callBadgePoint = {
        x: handLeft - horizontalBadgeOffset,
        y: handAnchor.y
      };
      turnBadgePoint = {
        x: nameLabelPoint.x,
        y:
          nameLabelPoint.y -
          Math.max(34, Math.round(config.layoutMetrics.cardHeight * 0.32))
      };
      outBadgePoint = {
        x:
          nameLabelPoint.x -
          Math.max(58, Math.round(config.layoutMetrics.cardWidth * 0.82)),
        y: nameLabelPoint.y
      };
      break;
    case "top":
      nameLabelPoint = {
        x: labelAnchor.x,
        y: Math.min(
          labelAnchor.y,
          handTop - Math.max(14, Math.round(config.layoutMetrics.cardHeight * 0.16))
        )
      };
      callBadgePoint = {
        x: handLeft - horizontalBadgeOffset,
        y: handAnchor.y
      };
      turnBadgePoint = {
        x: nameLabelPoint.x + Math.max(54, Math.round(config.layoutMetrics.cardWidth * 0.75)),
        y: nameLabelPoint.y
      };
      outBadgePoint = {
        x: nameLabelPoint.x - Math.max(54, Math.round(config.layoutMetrics.cardWidth * 0.75)),
        y: nameLabelPoint.y
      };
      break;
    case "left":
      nameLabelPoint = {
        x: Math.min(
          handLeft - sideLabelHandGap,
          Math.max(boardBounds.left + sideLabelEdgeInset, labelAnchor.x)
        ),
        y: labelAnchor.y
      };
      callBadgePoint = {
        x: handAnchor.x,
        y: handTop - verticalBadgeOffset
      };
      turnBadgePoint = {
        x: nameLabelPoint.x,
        y: nameLabelPoint.y - Math.max(42, Math.round(config.layoutMetrics.cardWidth * 0.58))
      };
      outBadgePoint = {
        x: nameLabelPoint.x,
        y: nameLabelPoint.y + Math.max(42, Math.round(config.layoutMetrics.cardWidth * 0.58))
      };
      break;
    case "right":
      nameLabelPoint = {
        x: Math.max(
          handRight + sideLabelHandGap,
          Math.min(boardBounds.right - sideLabelEdgeInset, labelAnchor.x)
        ),
        y: labelAnchor.y
      };
      callBadgePoint = {
        x: handAnchor.x,
        y: handTop - verticalBadgeOffset
      };
      turnBadgePoint = {
        x: nameLabelPoint.x,
        y: nameLabelPoint.y - Math.max(42, Math.round(config.layoutMetrics.cardWidth * 0.58))
      };
      outBadgePoint = {
        x: nameLabelPoint.x,
        y: nameLabelPoint.y + Math.max(42, Math.round(config.layoutMetrics.cardWidth * 0.58))
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
