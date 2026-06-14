export const SCHEMA_VERSION = 1;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Scale3 {
  x: number;
  y: number;
  z: number;
}

export interface HandMasterTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Scale3;
  pivot: Vec3;
}

export interface CardFanSettings {
  cardCount: number;
  cardWidth: number;
  cardHeight: number;
  overlap: number;
  spread: number;
  arc: number;
  depthStep: number;
  localRotationStep: number;
  startOffset: number;
  fanDirection: 1 | -1;
  reverseOrder: boolean;
}

export type SideHandId = "north" | "east" | "west" | "south";

export interface SideHandLayout {
  id: SideHandId;
  master: HandMasterTransform;
  fan: CardFanSettings;
}

export type PassingLaneId =
  | "north-left"
  | "north-across"
  | "north-right"
  | "east-north"
  | "east-across"
  | "east-south"
  | "south-left"
  | "south-across"
  | "south-right"
  | "west-north"
  | "west-across"
  | "west-south";

export interface PassingLaneTransform {
  id: PassingLaneId;
  position: Vec3;
  rotation: Vec3;
  scale: Scale3;
  width: number;
  height: number;
  arrowRotation: number;
  arrowOffset: Vec3;
  arrowScale: number;
  visible: boolean;
  locked: boolean;
  borderThickness: number;
  borderOpacity: number;
  fillOpacity: number;
}

export interface AltTableLayout {
  schemaVersion: number;
  coordinateSystem: {
    origin: "table-center";
    positiveX: "right";
    positiveY: "up";
    positiveZ: "toward-camera";
    rotationOrder: "XYZ";
    units: "world-units";
    rotationsStoredAs: "radians";
  };
  table: {
    designWidth: number;
    designHeight: number;
    worldWidth: number;
    worldHeight: number;
  };
  hands: {
    north: SideHandLayout;
    east: SideHandLayout;
    west: SideHandLayout;
    south: SideHandLayout;
  };
  passingLanes: Record<PassingLaneId, PassingLaneTransform>;
}

export function createDefaultVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function createDefaultScale3(x = 1, y = 1, z = 1): Scale3 {
  return { x, y, z };
}

export function createDefaultHandMasterTransform(): HandMasterTransform {
  return {
    position: createDefaultVec3(),
    rotation: createDefaultVec3(),
    scale: createDefaultScale3(),
    pivot: createDefaultVec3()
  };
}

export function createDefaultCardFanSettings(): CardFanSettings {
  return {
    cardCount: 14,
    cardWidth: 0.46,
    cardHeight: 0.644,
    overlap: 0.08,
    spread: 0.114,
    arc: 0.15,
    depthStep: 0.02,
    localRotationStep: 0.009,
    startOffset: 0,
    fanDirection: 1,
    reverseOrder: false
  };
}

export function createDefaultSideHandLayout(id: SideHandId): SideHandLayout {
  const positions: Record<SideHandId, Vec3> = {
    north: { x: 0, y: 0.1, z: -3.2 },
    east: { x: 4.5, y: 0.1, z: 0 },
    west: { x: -4.5, y: 0.1, z: 0 },
    south: { x: 0, y: 0.1, z: 3.2 }
  };

  const rotations: Record<SideHandId, Vec3> = {
    north: { x: 0, y: 0, z: 0 },
    east: { x: 0, y: -0.44, z: 0 },
    west: { x: 0, y: 0.44, z: 0 },
    south: { x: 0, y: Math.PI, z: 0 }
  };

  return {
    id,
    master: {
      position: positions[id],
      rotation: rotations[id],
      scale: createDefaultScale3(),
      pivot: createDefaultVec3()
    },
    fan: createDefaultCardFanSettings()
  };
}

export function createDefaultPassingLane(id: PassingLaneId): PassingLaneTransform {
  const defaults: Record<PassingLaneId, Partial<PassingLaneTransform>> = {
    "north-left": { position: { x: -1.2, y: 0.05, z: -2.8 }, width: 1.0, height: 0.56, arrowRotation: Math.PI / 2 },
    "north-across": { position: { x: 0, y: 0.05, z: -2.8 }, width: 0.56, height: 0.9, arrowRotation: Math.PI },
    "north-right": { position: { x: 1.2, y: 0.05, z: -2.8 }, width: 1.0, height: 0.56, arrowRotation: -Math.PI / 2 },
    "east-north": { position: { x: 4.2, y: 0.05, z: -1.8 }, width: 0.56, height: 0.9, arrowRotation: Math.PI / 2 },
    "east-across": { position: { x: 4.2, y: 0.05, z: 0 }, width: 1.0, height: 0.56, arrowRotation: Math.PI },
    "east-south": { position: { x: 4.2, y: 0.05, z: 1.8 }, width: 0.56, height: 0.9, arrowRotation: -Math.PI / 2 },
    "south-left": { position: { x: -1.2, y: 0.05, z: 2.8 }, width: 1.0, height: 0.56, arrowRotation: Math.PI / 2 },
    "south-across": { position: { x: 0, y: 0.05, z: 2.8 }, width: 0.56, height: 0.9, arrowRotation: 0 },
    "south-right": { position: { x: 1.2, y: 0.05, z: 2.8 }, width: 1.0, height: 0.56, arrowRotation: -Math.PI / 2 },
    "west-north": { position: { x: -4.2, y: 0.05, z: -1.8 }, width: 0.56, height: 0.9, arrowRotation: -Math.PI / 2 },
    "west-across": { position: { x: -4.2, y: 0.05, z: 0 }, width: 1.0, height: 0.56, arrowRotation: 0 },
    "west-south": { position: { x: -4.2, y: 0.05, z: 1.8 }, width: 0.56, height: 0.9, arrowRotation: Math.PI / 2 }
  };

  const config = defaults[id] ?? {};

  return {
    id,
    position: config.position ?? createDefaultVec3(),
    rotation: createDefaultVec3(),
    scale: createDefaultScale3(),
    width: config.width ?? 1.0,
    height: config.height ?? 0.56,
    arrowRotation: config.arrowRotation ?? 0,
    arrowOffset: createDefaultVec3(),
    arrowScale: 1.0,
    visible: true,
    locked: false,
    borderThickness: 0.02,
    borderOpacity: 0.8,
    fillOpacity: 0.15
  };
}

export function createDefaultPassingLanes(): Record<PassingLaneId, PassingLaneTransform> {
  const ids: PassingLaneId[] = [
    "north-left", "north-across", "north-right",
    "east-north", "east-across", "east-south",
    "south-left", "south-across", "south-right",
    "west-north", "west-across", "west-south"
  ];

  const lanes = {} as Record<PassingLaneId, PassingLaneTransform>;
  for (const id of ids) {
    lanes[id] = createDefaultPassingLane(id);
  }
  return lanes;
}

export function createDefaultAltTableLayout(): AltTableLayout {
  return {
    schemaVersion: SCHEMA_VERSION,
    coordinateSystem: {
      origin: "table-center",
      positiveX: "right",
      positiveY: "up",
      positiveZ: "toward-camera",
      rotationOrder: "XYZ",
      units: "world-units",
      rotationsStoredAs: "radians"
    },
    table: {
      designWidth: 1536,
      designHeight: 1024,
      worldWidth: 11.4,
      worldHeight: 7.6
    },
    hands: {
      north: createDefaultSideHandLayout("north"),
      east: createDefaultSideHandLayout("east"),
      west: createDefaultSideHandLayout("west"),
      south: createDefaultSideHandLayout("south")
    },
    passingLanes: createDefaultPassingLanes()
  };
}

export const PASSING_LANE_IDS: PassingLaneId[] = [
  "north-left", "north-across", "north-right",
  "east-north", "east-across", "east-south",
  "south-left", "south-across", "south-right",
  "west-north", "west-across", "west-south"
];

export const SIDE_HAND_IDS: SideHandId[] = ["north", "east", "west", "south"];
