import type { PassLaneDirection, SeatVisualPosition } from "../table-layout";

export type SouthPerspectiveWorldPoint = {
  x: number;
  y: number;
  z?: number;
};

export type SouthPerspectivePose = {
  screenX: number;
  screenY: number;
  scale: number;
  rotation: number;
  depth: number;
  shadowOffsetY: number;
  shadowBlur: number;
};

export type SouthPerspectiveTableGeometry = {
  viewportWidth: number;
  viewportHeight: number;
  centerX: number;
  frontY: number;
  backY: number;
  tableCenterY: number;
  tableRadiusX: number;
  tableRadiusY: number;
  tableRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type SouthPerspectiveProjector = {
  geometry: SouthPerspectiveTableGeometry;
  yaw: number;
  projectPoint: (
    point: SouthPerspectiveWorldPoint,
    options?: { rotation?: number }
  ) => SouthPerspectivePose;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start: number, end: number, weight: number) {
  return start + (end - start) * weight;
}

function easeOutCubic(value: number) {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function seatAnchor(position: SeatVisualPosition): SouthPerspectiveWorldPoint {
  switch (position) {
    case "bottom":
      return { x: 0, y: 0.1, z: 0 };
    case "top":
      return { x: 0, y: 0.93, z: 0 };
    case "left":
      return { x: -0.92, y: 0.69, z: 0 };
    case "right":
      return { x: 0.92, y: 0.69, z: 0 };
  }
}

export function createSouthPerspectiveProjector(config: {
  viewportWidth: number;
  viewportHeight: number;
  yaw: number;
}): SouthPerspectiveProjector {
  const viewportWidth = Math.max(960, config.viewportWidth);
  const viewportHeight = Math.max(640, config.viewportHeight);
  const centerX = viewportWidth / 2;
  const tableRadiusX = viewportWidth * 0.456;
  const tableRadiusY = Math.min(viewportHeight * 0.385, tableRadiusX * 0.58);
  const frontY = viewportHeight * 0.892;
  const backY = viewportHeight * 0.304;
  const tableCenterY = (frontY + backY) / 2 + viewportHeight * 0.012;

  const geometry: SouthPerspectiveTableGeometry = {
    viewportWidth,
    viewportHeight,
    centerX,
    frontY,
    backY,
    tableCenterY,
    tableRadiusX,
    tableRadiusY,
    tableRect: {
      left: centerX - tableRadiusX,
      top: tableCenterY - tableRadiusY,
      width: tableRadiusX * 2,
      height: tableRadiusY * 2
    }
  };

  return {
    geometry,
    yaw: clamp(config.yaw, -1, 1),
    projectPoint(point, options) {
      const depth = clamp(point.y, 0, 1);
      const scale = lerp(1.04, 0.52, easeOutCubic(depth));
      const compression = lerp(0.98, 0.5, Math.pow(depth, 0.9));
      const pathY = lerp(frontY, backY, depth);
      const bowlLift = Math.sin(depth * Math.PI) * tableRadiusY * 0.074;
      const sideRise = Math.abs(point.x) * depth * 10;
      const yawShift = config.yaw * depth * 52;
      const screenX = centerX + point.x * tableRadiusX * compression + yawShift;
      const screenY =
        pathY - bowlLift + sideRise - (point.z ?? 0) * 78 * scale;

      return {
        screenX,
        screenY,
        scale,
        rotation: (options?.rotation ?? 0) + config.yaw * depth * -4,
        depth: screenY + scale * 100,
        shadowOffsetY: lerp(20, 7, depth),
        shadowBlur: lerp(30, 12, depth)
      };
    }
  };
}

export function resolveSouthHandWorldPose(config: {
  index: number;
  count: number;
  selected: boolean;
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const midpoint = (config.count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (config.index - midpoint) / midpoint;
  const arcDepth = Math.abs(offset) * 0.04;
  return {
    x: offset * 0.52,
    y: 0.1 + arcDepth,
    z: config.selected ? 0.16 : 0,
    rotation: offset * 6.25
  };
}

export function resolveRemoteHandWorldPose(config: {
  position: Exclude<SeatVisualPosition, "bottom">;
  index: number;
  count: number;
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const midpoint = (config.count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (config.index - midpoint) / Math.max(midpoint, 1);

  if (config.position === "top") {
    return {
      x: offset * 0.31,
      y: 0.88 + Math.abs(offset) * 0.02,
      z: 0,
      rotation: offset * 5
    };
  }

  const side = config.position === "left" ? -1 : 1;
  return {
    x: side * (0.86 - Math.abs(offset) * 0.04),
    y: 0.64 + offset * 0.11,
    z: 0,
    rotation: side * -63 + offset * side * 9
  };
}

export function resolveSeatLabelPose(
  projector: SouthPerspectiveProjector,
  position: SeatVisualPosition
) {
  const anchor = seatAnchor(position);
  const point =
    position === "bottom"
      ? { x: anchor.x, y: 0.125, z: 0 }
      : position === "top"
        ? { x: anchor.x, y: 0.82, z: 0 }
        : {
            x: anchor.x * 0.94,
            y: anchor.y + 0.015,
            z: 0
          };
  const pose = projector.projectPoint(point);
  return {
    ...pose,
    rotation:
      position === "left" ? -90 : position === "right" ? 90 : pose.rotation
  };
}

export function resolveStatusPose(projector: SouthPerspectiveProjector) {
  return projector.projectPoint({ x: -0.38, y: 0.35, z: 0 });
}

export function resolveScorePose(projector: SouthPerspectiveProjector) {
  return projector.projectPoint({ x: 0, y: 0.965, z: 0 });
}

export function resolveSeatCountPose(
  projector: SouthPerspectiveProjector,
  position: Exclude<SeatVisualPosition, "bottom">
) {
  const anchor = seatAnchor(position);
  const point =
    position === "top"
      ? { x: anchor.x, y: 0.78, z: 0 }
      : { x: anchor.x * 0.98, y: anchor.y + 0.09, z: 0 };
  return projector.projectPoint(point);
}

export function resolveTrickCardWorldPose(config: {
  position: SeatVisualPosition;
  index: number;
  count: number;
  winning: boolean;
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const stackOffset = config.count <= 1 ? 0 : (config.index - (config.count - 1) / 2) * 0.08;

  switch (config.position) {
    case "top":
      return {
        x: stackOffset,
        y: 0.46,
        z: config.winning ? 0.05 : 0,
        rotation: -2
      };
    case "right":
      return {
        x: 0.18 + stackOffset * 0.5,
        y: 0.55 + Math.abs(stackOffset) * 0.04,
        z: config.winning ? 0.05 : 0,
        rotation: 8
      };
    case "left":
      return {
        x: -0.18 + stackOffset * 0.5,
        y: 0.55 + Math.abs(stackOffset) * 0.04,
        z: config.winning ? 0.05 : 0,
        rotation: -8
      };
    case "bottom":
      return {
        x: stackOffset * 0.72,
        y: 0.64,
        z: config.winning ? 0.05 : 0,
        rotation: 2
      };
  }
}

function laneSourceAnchor(
  position: SeatVisualPosition,
  direction: PassLaneDirection
): SouthPerspectiveWorldPoint {
  switch (position) {
    case "bottom":
      return {
        x: direction === "left" ? -0.34 : direction === "right" ? 0.34 : 0,
        y: 0.2,
        z: 0
      };
    case "top":
      return {
        x: direction === "left" ? -0.28 : direction === "right" ? 0.28 : 0,
        y: 0.8,
        z: 0
      };
    case "left":
      return {
        x: -0.68,
        y: direction === "up" ? 0.57 : direction === "down" ? 0.78 : 0.67,
        z: 0
      };
    case "right":
      return {
        x: 0.68,
        y: direction === "up" ? 0.57 : direction === "down" ? 0.78 : 0.67,
        z: 0
      };
  }
}

function laneTargetAnchor(position: SeatVisualPosition): SouthPerspectiveWorldPoint {
  switch (position) {
    case "bottom":
      return { x: 0, y: 0.22, z: 0 };
    case "top":
      return { x: 0, y: 0.8, z: 0 };
    case "left":
      return { x: -0.72, y: 0.68, z: 0 };
    case "right":
      return { x: 0.72, y: 0.68, z: 0 };
  }
}

export function resolvePassRouteWorldPose(config: {
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
  displayMode: "passing" | "pickup";
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const source = laneSourceAnchor(config.sourcePosition, config.direction);
  const target = laneTargetAnchor(config.targetPosition);
  const control = {
    x: (source.x + target.x) / 2,
    y: Math.min(Math.max((source.y + target.y) / 2, 0.38), 0.72),
    z: 0
  };
  const t = config.displayMode === "passing" ? 0.28 : 0.68;
  const inverse = 1 - t;
  const x =
    inverse * inverse * source.x +
    2 * inverse * t * control.x +
    t * t * target.x;
  const y =
    inverse * inverse * source.y +
    2 * inverse * t * control.y +
    t * t * target.y;
  const tangentX =
    2 * inverse * (control.x - source.x) + 2 * t * (target.x - control.x);
  const tangentY =
    2 * inverse * (control.y - source.y) + 2 * t * (target.y - control.y);
  const rotation = (Math.atan2(tangentY, tangentX) * 180) / Math.PI + 90;

  return { x, y, z: 0, rotation };
}
