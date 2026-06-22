import {
  PASSING_LANE_IDS,
  createDefaultAltTableLayout,
  generateFanLocalTransforms,
  radiansToDegrees,
  type AltTableLayout,
  type PassingLaneId,
  type PassingLaneTransform,
  type SideHandId,
  type SideHandLayout,
  type Vec3
} from "@tichuml/table-layout-schema";
import {
  makeNorthHandAnchors,
  makePassingAnchors,
  makeSideHandAnchors,
  makeSouthHandAnchors,
  makeTrickAnchors,
  type CardAnchor,
  type PassAnchor,
  type TrickAnchor
} from "./freshTableMath";
import { DESIGN_H, DESIGN_W } from "./tableFit";

export type FreshAltHandId = "north" | "east" | "south" | "west";

export interface FreshAltHandRegion {
  id: FreshAltHandId;
  centerPx: { x: number; y: number };
  wPx: number;
  hPx: number;
  locked: boolean;
}

export interface FreshAltPassingAnchor extends PassAnchor {
  laneId: PassingLaneId;
  visible: boolean;
  locked: boolean;
  rotationDeg: number;
  borderOpacity: number;
  fillOpacity: number;
  arrowRotationDeg: number;
  arrowOffsetPx: { x: number; y: number };
  arrowScale: number;
}

export interface FreshAltAuthoringScene {
  design: {
    w: number;
    h: number;
  };
  hands: Record<FreshAltHandId, CardAnchor[]>;
  handRegions: Record<FreshAltHandId, FreshAltHandRegion>;
  passing: FreshAltPassingAnchor[];
  tricks: TrickAnchor[];
}

export interface LaneSelectionModel<TLane> {
  laneIds: PassingLaneId[];
  lanes: Partial<Record<PassingLaneId, TLane>>;
  hasLane: (laneId: PassingLaneId) => boolean;
  getLane: (laneId: PassingLaneId) => TLane | null;
}

const DEFAULT_LAYOUT = createDefaultAltTableLayout();
const EDITABLE_HAND_IDS: FreshAltHandId[] = ["north", "east", "west"];
const WORLD_TO_DESIGN_X = DESIGN_W / DEFAULT_LAYOUT.table.worldWidth;
const WORLD_TO_DESIGN_Z = DESIGN_H / DEFAULT_LAYOUT.table.worldHeight;

const BASE_HAND_ANCHORS: Record<FreshAltHandId, CardAnchor[]> = {
  north: makeNorthHandAnchors(),
  east: makeSideHandAnchors("east"),
  south: makeSouthHandAnchors(),
  west: makeSideHandAnchors("west")
};

const BASE_PASSING_ANCHORS = makePassingAnchors();
const BASE_TRICK_ANCHORS = makeTrickAnchors();

const LANE_ID_BY_ANCHOR_ID: Record<string, PassingLaneId> = {
  north_pass_left: "north-left",
  north_pass_across: "north-across",
  north_pass_right: "north-right",
  east_pass_north: "east-north",
  east_pass_across: "east-across",
  east_pass_south: "east-south",
  south_pass_left: "south-left",
  south_pass_across: "south-across",
  south_pass_right: "south-right",
  west_pass_north: "west-north",
  west_pass_across: "west-across",
  west_pass_south: "west-south"
};

type ProjectionMatrix = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

const SEAT_PROJECTIONS: Record<FreshAltHandId, ProjectionMatrix> = {
  north: calibrateHandProjection("north"),
  east: calibrateHandProjection("east"),
  south: calibrateHandProjection("south"),
  west: calibrateHandProjection("west")
};

export function createFreshAltAuthoringScene(
  layout: AltTableLayout = DEFAULT_LAYOUT
): FreshAltAuthoringScene {
  const hands = {
    north: projectHandLayout("north", layout.hands.north),
    east: projectHandLayout("east", layout.hands.east),
    south: projectHandLayout("south", layout.hands.south),
    west: projectHandLayout("west", layout.hands.west)
  } satisfies Record<FreshAltHandId, CardAnchor[]>;

  return {
    design: {
      w: DESIGN_W,
      h: DESIGN_H
    },
    hands,
    handRegions: {
      north: computeHandRegion("north", hands.north),
      east: computeHandRegion("east", hands.east),
      south: computeHandRegion("south", hands.south),
      west: computeHandRegion("west", hands.west)
    },
    passing: BASE_PASSING_ANCHORS.map((anchor) => {
      const laneId = LANE_ID_BY_ANCHOR_ID[anchor.id];
      if (!laneId) {
        throw new Error(`Missing authoring lane mapping for anchor ${anchor.id}.`);
      }
      return projectPassingLane(anchor, layout.passingLanes[laneId]);
    }),
    tricks: BASE_TRICK_ANCHORS
  };
}

export function getEditableHandIds(): FreshAltHandId[] {
  return [...EDITABLE_HAND_IDS];
}

export function isHandLocked(handId: FreshAltHandId): boolean {
  return !EDITABLE_HAND_IDS.includes(handId);
}

export function createLaneSelectionModel<TLane>(layout: {
  passingLanes: Partial<Record<PassingLaneId, TLane>>;
}): LaneSelectionModel<TLane> {
  const lanes = layout.passingLanes;
  const laneIds = PASSING_LANE_IDS.filter((laneId) => Object.hasOwn(lanes, laneId));

  return {
    laneIds,
    lanes,
    hasLane: (laneId) => Object.hasOwn(lanes, laneId),
    getLane: (laneId) => (Object.hasOwn(lanes, laneId) ? lanes[laneId] ?? null : null)
  };
}

function projectHandLayout(handId: FreshAltHandId, hand: SideHandLayout): CardAnchor[] {
  const defaults = DEFAULT_LAYOUT.hands[handId];
  const baseAnchors = resampleAnchors(BASE_HAND_ANCHORS[handId], hand.fan.cardCount);
  const defaultLocals = generateFanLocalTransforms({
    ...defaults.fan,
    cardCount: hand.fan.cardCount
  });
  const currentLocals = generateFanLocalTransforms(hand.fan);
  const projection = SEAT_PROJECTIONS[handId];
  const baseCenter = averagePoint(baseAnchors);
  const masterTranslation = worldDeltaToPixels(
    subtractVec3(hand.master.position, defaults.master.position)
  );
  const pivotTranslation = worldDeltaToPixels(
    subtractVec3(hand.master.pivot, defaults.master.pivot)
  );
  const rotationDeg =
    radiansToDegrees(hand.master.rotation.y - defaults.master.rotation.y) +
    radiansToDegrees(hand.master.rotation.z - defaults.master.rotation.z);
  const scaleX = safeRatio(hand.master.scale.x, defaults.master.scale.x);
  const scaleY = safeRatio(hand.master.scale.z, defaults.master.scale.z);
  const widthRatio = safeRatio(hand.fan.cardWidth, defaults.fan.cardWidth);
  const heightRatio = safeRatio(hand.fan.cardHeight, defaults.fan.cardHeight);

  return baseAnchors.map((anchor, index) => {
    const defaultLocal = defaultLocals[index];
    const currentLocal = currentLocals[index];
    const deltaPosition = currentLocal && defaultLocal
      ? projectLocalDelta(projection, {
          x: currentLocal.position.x - defaultLocal.position.x,
          y: currentLocal.position.y - defaultLocal.position.y
        })
      : { x: 0, y: 0 };
    const deltaRotation =
      currentLocal && defaultLocal
        ? radiansToDegrees(currentLocal.rotation.z - defaultLocal.rotation.z)
        : 0;
    const translatedCenter = {
      x: anchor.centerPx.x + deltaPosition.x,
      y: anchor.centerPx.y + deltaPosition.y
    };
    const scaledCenter = scalePointAroundCenter(translatedCenter, baseCenter, scaleX, scaleY);
    const rotatedCenter = rotatePointAroundCenter(scaledCenter, baseCenter, rotationDeg);

    return {
      ...anchor,
      centerPx: {
        x: rotatedCenter.x + masterTranslation.x + pivotTranslation.x,
        y: rotatedCenter.y + masterTranslation.y + pivotTranslation.y
      },
      wPx: anchor.wPx * widthRatio * scaleX,
      hPx: anchor.hPx * heightRatio * scaleY,
      rotationDeg: anchor.rotationDeg + deltaRotation + rotationDeg,
      localRotationDeg: {
        x: roundDegrees(radiansToDegrees(hand.fan.cardLocalRotation.x)),
        y: roundDegrees(radiansToDegrees(hand.fan.cardLocalRotation.y)),
        z: roundDegrees(radiansToDegrees(hand.fan.cardLocalRotation.z))
      },
      transformOrigin: getCardTransformOrigin(hand.fan.cardLocalPivot)
    };
  });
}

function roundDegrees(value: number): number {
  return Number(value.toFixed(6));
}

function getCardTransformOrigin(pivot: Vec3): string {
  const x = (pivot.x + 0.5) * 100;
  const y = (pivot.y + 0.5) * 100;

  return `${roundCssPercent(x)}% ${roundCssPercent(y)}%`;
}

function roundCssPercent(value: number): number {
  return Number(value.toFixed(4));
}

function projectPassingLane(
  anchor: PassAnchor,
  lane: PassingLaneTransform
): FreshAltPassingAnchor {
  const defaults = DEFAULT_LAYOUT.passingLanes[lane.id];
  const translation = worldDeltaToPixels(subtractVec3(lane.position, defaults.position));
  const arrowOffsetPx = worldDeltaToPixels(lane.arrowOffset);
  const widthRatio = safeRatio(lane.width, defaults.width);
  const heightRatio = safeRatio(lane.height, defaults.height);
  const scaleX = safeRatio(lane.scale.x, defaults.scale.x);
  const scaleY = safeRatio(lane.scale.z, defaults.scale.z);

  return {
    ...anchor,
    laneId: lane.id,
    centerPx: {
      x: anchor.centerPx.x + translation.x,
      y: anchor.centerPx.y + translation.y
    },
    wPx: anchor.wPx * widthRatio * scaleX,
    hPx: anchor.hPx * heightRatio * scaleY,
    visible: lane.visible,
    locked: lane.locked,
    rotationDeg: radiansToDegrees(lane.rotation.z - defaults.rotation.z),
    borderOpacity: lane.borderOpacity,
    fillOpacity: lane.fillOpacity,
    arrowRotationDeg: radiansToDegrees(lane.arrowRotation),
    arrowOffsetPx,
    arrowScale: lane.arrowScale
  };
}

function computeHandRegion(
  handId: FreshAltHandId,
  cards: CardAnchor[]
): FreshAltHandRegion {
  const bounds = cards.reduce(
    (acc, card) => {
      const halfW = card.wPx / 2;
      const halfH = card.hPx / 2;
      return {
        left: Math.min(acc.left, card.centerPx.x - halfW),
        right: Math.max(acc.right, card.centerPx.x + halfW),
        top: Math.min(acc.top, card.centerPx.y - halfH),
        bottom: Math.max(acc.bottom, card.centerPx.y + halfH)
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  );

  return {
    id: handId,
    centerPx: {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2
    },
    wPx: bounds.right - bounds.left + 20,
    hPx: bounds.bottom - bounds.top + 20,
    locked: isHandLocked(handId)
  };
}

function resampleAnchors(anchors: CardAnchor[], count: number): CardAnchor[] {
  const normalizedCount = Math.max(1, Math.floor(count));

  if (normalizedCount === anchors.length) {
    return anchors.map((anchor) => ({ ...anchor, centerPx: { ...anchor.centerPx } }));
  }

  if (normalizedCount === 1) {
    const middle = anchors[Math.floor(anchors.length / 2)]!;
    return [
      {
        ...middle,
        centerPx: { ...middle.centerPx },
        id: `${middle.seat}-1`,
        index: 1
      }
    ];
  }

  return Array.from({ length: normalizedCount }, (_, index) => {
    const t = normalizedCount <= 1 ? 0 : index / (normalizedCount - 1);
    return interpolateAnchor(anchors, t, index + 1);
  });
}

function interpolateAnchor(
  anchors: CardAnchor[],
  t: number,
  index: number
): CardAnchor {
  const scaled = t * (anchors.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(anchors.length - 1, Math.ceil(scaled));
  const localT = scaled - leftIndex;
  const left = anchors[leftIndex]!;
  const right = anchors[rightIndex]!;

  const interpolated: CardAnchor = {
    id: `${left.seat}-${index}`,
    seat: left.seat,
    zone: left.zone,
    index,
    renderMode: left.renderMode,
    centerPx: {
      x: lerp(left.centerPx.x, right.centerPx.x, localT),
      y: lerp(left.centerPx.y, right.centerPx.y, localT)
    },
    wPx: lerp(left.wPx, right.wPx, localT),
    hPx: lerp(left.hPx, right.hPx, localT),
    rotationDeg: lerp(left.rotationDeg, right.rotationDeg, localT),
    scaleX: lerp(left.scaleX, right.scaleX, localT),
    scaleY: lerp(left.scaleY, right.scaleY, localT),
    zIndex: Math.round(lerp(left.zIndex, right.zIndex, localT))
  };

  if (left.cardBackFaces !== undefined) {
    interpolated.cardBackFaces = left.cardBackFaces;
  }

  if (left.hiddenBottomPx !== undefined || right.hiddenBottomPx !== undefined) {
    return {
      ...interpolated,
      hiddenBottomPx: lerp(left.hiddenBottomPx ?? 0, right.hiddenBottomPx ?? 0, localT)
    };
  }

  return interpolated;
}

function calibrateHandProjection(handId: FreshAltHandId): ProjectionMatrix {
  const defaults = DEFAULT_LAYOUT.hands[handId];
  const anchors = BASE_HAND_ANCHORS[handId];
  const locals = generateFanLocalTransforms(defaults.fan);
  const anchorCenter = averagePoint(anchors);
  const localCenter = averageLocalPosition(locals);

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sdx = 0;
  let sdy = 0;
  let tdx = 0;
  let tdy = 0;

  anchors.forEach((anchor, index) => {
    const local = locals[index]!;
    const lx = local.position.x - localCenter.x;
    const ly = local.position.y - localCenter.y;
    const dx = anchor.centerPx.x - anchorCenter.x;
    const dy = anchor.centerPx.y - anchorCenter.y;

    sxx += lx * lx;
    sxy += lx * ly;
    syy += ly * ly;
    sdx += lx * dx;
    sdy += ly * dx;
    tdx += lx * dy;
    tdy += ly * dy;
  });

  const determinant = sxx * syy - sxy * sxy;
  if (Math.abs(determinant) < 1e-9) {
    return { ax: 0, ay: 0, bx: 0, by: 0 };
  }

  return {
    ax: (sdx * syy - sdy * sxy) / determinant,
    ay: (sdy * sxx - sdx * sxy) / determinant,
    bx: (tdx * syy - tdy * sxy) / determinant,
    by: (tdy * sxx - tdx * sxy) / determinant
  };
}

function projectLocalDelta(
  projection: ProjectionMatrix,
  delta: { x: number; y: number }
) {
  return {
    x: projection.ax * delta.x + projection.ay * delta.y,
    y: projection.bx * delta.x + projection.by * delta.y
  };
}

function worldDeltaToPixels(delta: Vec3) {
  return {
    x: delta.x * WORLD_TO_DESIGN_X,
    y: delta.z * WORLD_TO_DESIGN_Z
  };
}

function averagePoint(anchors: CardAnchor[]) {
  const total = anchors.reduce(
    (acc, anchor) => ({
      x: acc.x + anchor.centerPx.x,
      y: acc.y + anchor.centerPx.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / anchors.length,
    y: total.y / anchors.length
  };
}

function averageLocalPosition(
  locals: ReturnType<typeof generateFanLocalTransforms>
) {
  const total = locals.reduce(
    (acc, local) => ({
      x: acc.x + local.position.x,
      y: acc.y + local.position.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / locals.length,
    y: total.y / locals.length
  };
}

function scalePointAroundCenter(
  point: { x: number; y: number },
  center: { x: number; y: number },
  scaleX: number,
  scaleY: number
) {
  return {
    x: center.x + (point.x - center.x) * scaleX,
    y: center.y + (point.y - center.y) * scaleY
  };
}

function rotatePointAroundCenter(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotationDeg: number
) {
  if (rotationDeg === 0) {
    return point;
  }

  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
}

function safeRatio(value: number, fallback: number) {
  return fallback === 0 ? 1 : value / fallback;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
