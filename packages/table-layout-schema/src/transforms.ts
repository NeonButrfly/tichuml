import type { Vec3, Scale3, CardFanSettings, SideHandLayout, SideHandId, PassingLaneTransform, PassingLaneId } from "./schema.js";

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function vec3ToDegrees(v: Vec3): Vec3 {
  return {
    x: radiansToDegrees(v.x),
    y: radiansToDegrees(v.y),
    z: radiansToDegrees(v.z)
  };
}

export function vec3FromDegrees(v: Vec3): Vec3 {
  return {
    x: degreesToRadians(v.x),
    y: degreesToRadians(v.y),
    z: degreesToRadians(v.z)
  };
}

export interface CardLocalTransform {
  index: number;
  position: Vec3;
  rotation: Vec3;
  scale: Scale3;
}

export function generateFanLocalTransforms(fan: CardFanSettings): CardLocalTransform[] {
  const count = Math.max(0, Math.floor(fan.cardCount));
  const result: CardLocalTransform[] = [];

  for (let i = 0; i < count; i++) {
    const orderIndex = fan.reverseOrder ? (count - 1 - i) : i;
    const centerT = count <= 1 ? 0 : (orderIndex / (count - 1)) - 0.5;

    const spreadOffset = centerT * fan.spread * (count - 1);
    const arcOffset = Math.sin(centerT * Math.PI) * fan.arc;
    const depthOffset = -Math.abs(centerT) * fan.depthStep * (count - 1);
    const localRot = centerT * fan.localRotationStep * (count - 1) * fan.fanDirection;

    const startX = fan.startOffset * fan.fanDirection;

    result.push({
      index: i,
      position: {
        x: startX + spreadOffset,
        y: arcOffset,
        z: depthOffset
      },
      rotation: {
        x: 0,
        y: 0,
        z: localRot
      },
      scale: { x: 1, y: 1, z: 1 }
    });
  }

  return result;
}

export function mirrorVec3X(v: Vec3): Vec3 {
  return { x: -v.x, y: v.y, z: v.z };
}

export function mirrorRotationY(r: Vec3): Vec3 {
  return { x: -r.x, y: -r.y + Math.PI, z: -r.z };
}

export function mirrorVec3Z(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: -v.z };
}

export function mirrorRotationNorthSouth(r: Vec3): Vec3 {
  return { x: -r.x, y: r.y + Math.PI, z: -r.z };
}

export function mirrorHandLayout(source: SideHandLayout, targetId: SideHandId): SideHandLayout {
  const isHorizontalMirror =
    (source.id === "east" && targetId === "west") ||
    (source.id === "west" && targetId === "east");

  const isVerticalMirror =
    (source.id === "north" && targetId === "south") ||
    (source.id === "south" && targetId === "north");

  if (!isHorizontalMirror && !isVerticalMirror) {
    return {
      id: targetId,
      master: {
        position: { ...source.master.position },
        rotation: { ...source.master.rotation },
        scale: { ...source.master.scale },
        pivot: { ...source.master.pivot }
      },
      fan: { ...source.fan }
    };
  }

  if (isHorizontalMirror) {
    return {
      id: targetId,
      master: {
        position: mirrorVec3X(source.master.position),
        rotation: mirrorRotationY(source.master.rotation),
        scale: { ...source.master.scale },
        pivot: mirrorVec3X(source.master.pivot)
      },
      fan: {
        ...source.fan,
        fanDirection: (source.fan.fanDirection === 1 ? -1 : 1) as 1 | -1,
        reverseOrder: !source.fan.reverseOrder,
        localRotationStep: -source.fan.localRotationStep,
        cardLocalRotation: mirrorRotationY(source.fan.cardLocalRotation),
        cardLocalPivot: mirrorVec3X(source.fan.cardLocalPivot)
      }
    };
  }

  return {
    id: targetId,
    master: {
      position: mirrorVec3Z(source.master.position),
      rotation: mirrorRotationNorthSouth(source.master.rotation),
      scale: { ...source.master.scale },
      pivot: mirrorVec3Z(source.master.pivot)
    },
    fan: {
      ...source.fan,
      fanDirection: (source.fan.fanDirection === 1 ? -1 : 1) as 1 | -1,
      reverseOrder: !source.fan.reverseOrder,
      localRotationStep: -source.fan.localRotationStep,
      cardLocalRotation: mirrorRotationNorthSouth(source.fan.cardLocalRotation),
      cardLocalPivot: mirrorVec3Z(source.fan.cardLocalPivot)
    }
  };
}

export function copyHandLayout(source: SideHandLayout, targetId: SideHandId): SideHandLayout {
  return {
    id: targetId,
    master: {
      position: { ...source.master.position },
      rotation: { ...source.master.rotation },
      scale: { ...source.master.scale },
      pivot: { ...source.master.pivot }
    },
    fan: { ...source.fan }
  };
}

const LANE_MIRROR_PAIRS: Record<string, PassingLaneId> = {
  "north-left": "north-right",
  "north-right": "north-left",
  "south-left": "south-right",
  "south-right": "south-left",
  "east-north": "west-north",
  "east-across": "west-across",
  "east-south": "west-south",
  "west-north": "east-north",
  "west-across": "east-across",
  "west-south": "east-south",
  "north-across": "south-across",
  "south-across": "north-across"
};

export function mirrorPassingLane(source: PassingLaneTransform, targetId: PassingLaneId): PassingLaneTransform {
  const isEastWest = source.id.startsWith("east-") || source.id.startsWith("west-");
  const isNorthSouth = source.id.startsWith("north-") || source.id.startsWith("south-");

  let mirroredPosition: Vec3;
  let mirroredRotation: Vec3;
  let mirroredArrowRotation: number;

  if (isEastWest) {
    mirroredPosition = mirrorVec3X(source.position);
    mirroredRotation = { x: -source.rotation.x, y: -source.rotation.y, z: -source.rotation.z };
    mirroredArrowRotation = -source.arrowRotation + Math.PI;
  } else if (isNorthSouth) {
    if (source.id.includes("left") || source.id.includes("right")) {
      mirroredPosition = mirrorVec3X(source.position);
      mirroredRotation = { ...source.rotation };
      mirroredArrowRotation = -source.arrowRotation;
    } else {
      mirroredPosition = { x: source.position.x, y: source.position.y, z: -source.position.z };
      mirroredRotation = { ...source.rotation };
      mirroredArrowRotation = source.arrowRotation + Math.PI;
    }
  } else {
    mirroredPosition = { ...source.position };
    mirroredRotation = { ...source.rotation };
    mirroredArrowRotation = source.arrowRotation;
  }

  return {
    id: targetId,
    position: mirroredPosition,
    rotation: mirroredRotation,
    scale: { ...source.scale },
    width: source.width,
    height: source.height,
    arrowRotation: mirroredArrowRotation,
    arrowOffset: isEastWest ? mirrorVec3X(source.arrowOffset) : { ...source.arrowOffset },
    arrowScale: source.arrowScale,
    visible: source.visible,
    locked: source.locked,
    borderThickness: source.borderThickness,
    borderOpacity: source.borderOpacity,
    fillOpacity: source.fillOpacity
  };
}

export function getMirrorLaneId(laneId: PassingLaneId): PassingLaneId {
  return LANE_MIRROR_PAIRS[laneId] ?? laneId;
}
