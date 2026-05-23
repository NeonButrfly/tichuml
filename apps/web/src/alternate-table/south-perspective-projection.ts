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

export type SouthPerspectiveLayoutConfig = {
  tableCenterX: number;
  tableCenterY: number;
  tableRadiusX: number;
  tableRadiusY: number;
  nearEdgeY: number;
  farEdgeY: number;
  scaleNear: number;
  scaleFar: number;
  compressionFar: number;
  tabletopArc: number;
  sideRise: number;
  liftStrength: number;
  uiSafeMargin: number;
};

export type SouthPerspectiveDebugLayout = {
  viewport: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  tableRect: SouthPerspectiveTableGeometry["tableRect"];
  safeTopLeft: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  safeBottomLeft: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  safeBottomRight: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  anchors: Array<{
    key: string;
    x: number;
    y: number;
  }>;
};

export const SOUTH_PERSPECTIVE_LAYOUT: SouthPerspectiveLayoutConfig = {
  tableCenterX: 0.5,
  tableCenterY: 0.56,
  tableRadiusX: 0.47,
  tableRadiusY: 0.34,
  nearEdgeY: 0.94,
  farEdgeY: 0.22,
  scaleNear: 1.15,
  scaleFar: 0.48,
  compressionFar: 0.55,
  tabletopArc: 0.064,
  sideRise: 0.045,
  liftStrength: 74,
  uiSafeMargin: 0.02
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start: number, end: number, weight: number) {
  return start + (end - start) * weight;
}

function roundToViewport(value: number) {
  return Math.round(value * 10) / 10;
}

function getSeatAnchor(position: SeatVisualPosition): SouthPerspectiveWorldPoint {
  switch (position) {
    case "bottom":
      return { x: 0, y: 0.24, z: 0 };
    case "top":
      return { x: 0, y: 0.94, z: 0 };
    case "left":
      return { x: -0.82, y: 0.68, z: 0 };
    case "right":
      return { x: 0.82, y: 0.68, z: 0 };
  }
}

export function createSouthPerspectiveProjector(config: {
  viewportWidth: number;
  viewportHeight: number;
  yaw: number;
}): SouthPerspectiveProjector {
  const viewportWidth = Math.max(320, config.viewportWidth);
  const viewportHeight = Math.max(320, config.viewportHeight);
  const centerX = viewportWidth * SOUTH_PERSPECTIVE_LAYOUT.tableCenterX;
  const tableCenterY = viewportHeight * SOUTH_PERSPECTIVE_LAYOUT.tableCenterY;
  const tableRadiusX = viewportWidth * SOUTH_PERSPECTIVE_LAYOUT.tableRadiusX;
  const tableRadiusY = viewportHeight * SOUTH_PERSPECTIVE_LAYOUT.tableRadiusY;
  const frontY = viewportHeight * SOUTH_PERSPECTIVE_LAYOUT.nearEdgeY;
  const backY = viewportHeight * SOUTH_PERSPECTIVE_LAYOUT.farEdgeY;

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

  const yaw = clamp(config.yaw, -1, 1);

  return {
    geometry,
    yaw,
    projectPoint(point, options) {
      const depth = clamp(point.y, 0, 1);
      const scale = lerp(
        SOUTH_PERSPECTIVE_LAYOUT.scaleNear,
        SOUTH_PERSPECTIVE_LAYOUT.scaleFar,
        depth
      );
      const xCompression = lerp(
        1,
        SOUTH_PERSPECTIVE_LAYOUT.compressionFar,
        depth
      );
      const tableDepth = frontY - backY;
      const baseY = frontY - depth * tableDepth;
      const tabletopLift =
        Math.sin(depth * Math.PI) *
        tableRadiusY *
        SOUTH_PERSPECTIVE_LAYOUT.tabletopArc;
      const sideRise =
        Math.abs(point.x) *
        depth *
        tableRadiusY *
        SOUTH_PERSPECTIVE_LAYOUT.sideRise;
      const yawShift = yaw * tableRadiusX * 0.09 * (0.25 + depth * 0.75);
      const screenX =
        centerX + point.x * tableRadiusX * xCompression + yawShift;
      const screenY =
        baseY - tabletopLift + sideRise - (point.z ?? 0) * SOUTH_PERSPECTIVE_LAYOUT.liftStrength * scale;

      return {
        screenX: roundToViewport(screenX),
        screenY: roundToViewport(screenY),
        scale: roundToViewport(scale),
        rotation: roundToViewport((options?.rotation ?? 0) + yaw * depth * -3.2),
        depth: roundToViewport(screenY + scale * 100),
        shadowOffsetY: roundToViewport(lerp(24, 9, depth)),
        shadowBlur: roundToViewport(lerp(34, 14, depth))
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
  const spread = Math.max(midpoint, 1);
  const offset = midpoint === 0 ? 0 : (config.index - midpoint) / spread;
  const arcDepth = Math.abs(offset) * 0.035;
  return {
    x: offset * 0.42,
    y: 0.24 + arcDepth,
    z: config.selected ? 0.14 : 0,
    rotation: offset * 5.6
  };
}

export function resolveRemoteHandWorldPose(config: {
  position: Exclude<SeatVisualPosition, "bottom">;
  index: number;
  count: number;
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const midpoint = (config.count - 1) / 2;
  const spread = Math.max(midpoint, 1);
  const offset = midpoint === 0 ? 0 : (config.index - midpoint) / spread;

  if (config.position === "top") {
    return {
      x: offset * 0.28,
      y: 0.94 + Math.abs(offset) * 0.015,
      z: 0,
      rotation: offset * 4.5
    };
  }

  const side = config.position === "left" ? -1 : 1;
  return {
    x: side * (0.82 - Math.abs(offset) * 0.035),
    y: 0.68 + offset * 0.1,
    z: 0,
    rotation: side * -21 + offset * side * 11
  };
}

export function resolveSeatLabelPose(
  projector: SouthPerspectiveProjector,
  position: SeatVisualPosition
) {
  const point =
    position === "bottom"
      ? { x: 0, y: 0.14, z: 0 }
      : position === "top"
        ? { x: 0, y: 0.985, z: 0 }
        : position === "left"
          ? { x: -0.98, y: 0.66, z: 0 }
          : { x: 0.98, y: 0.66, z: 0 };
  const pose = projector.projectPoint(point);
  return {
    ...pose,
    rotation:
      position === "left" ? -90 : position === "right" ? 90 : pose.rotation
  };
}

export function resolveStatusPose(projector: SouthPerspectiveProjector) {
  return projector.projectPoint({ x: -0.82, y: 0.9, z: 0 });
}

export function resolveScorePose(projector: SouthPerspectiveProjector) {
  return projector.projectPoint({ x: 0, y: 1, z: 0 });
}

export function resolveSeatCountPose(
  projector: SouthPerspectiveProjector,
  position: Exclude<SeatVisualPosition, "bottom">
) {
  const point =
    position === "top"
      ? { x: 0, y: 0.9, z: 0 }
      : position === "left"
        ? { x: -0.91, y: 0.58, z: 0 }
        : { x: 0.91, y: 0.58, z: 0 };
  return projector.projectPoint(point);
}

export function resolveTrickCardWorldPose(config: {
  position: SeatVisualPosition;
  index: number;
  count: number;
  winning: boolean;
}): SouthPerspectiveWorldPoint & { rotation: number } {
  const midpoint = (config.count - 1) / 2;
  const offset = config.count <= 1 ? 0 : (config.index - midpoint) / Math.max(midpoint, 1);

  switch (config.position) {
    case "top":
      return {
        x: offset * 0.14,
        y: 0.64,
        z: config.winning ? 0.04 : 0,
        rotation: offset * 6 - 3
      };
    case "right":
      return {
        x: 0.18 + offset * 0.08,
        y: 0.6 + Math.abs(offset) * 0.03,
        z: config.winning ? 0.04 : 0,
        rotation: 12 + offset * 4
      };
    case "left":
      return {
        x: -0.18 + offset * 0.08,
        y: 0.6 + Math.abs(offset) * 0.03,
        z: config.winning ? 0.04 : 0,
        rotation: -12 + offset * 4
      };
    case "bottom":
      return {
        x: offset * 0.16,
        y: 0.54,
        z: config.winning ? 0.04 : 0,
        rotation: offset * 4 + 2
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
        x: direction === "left" ? -0.28 : direction === "right" ? 0.28 : 0,
        y: 0.31,
        z: 0
      };
    case "top":
      return {
        x: direction === "left" ? -0.24 : direction === "right" ? 0.24 : 0,
        y: 0.86,
        z: 0
      };
    case "left":
      return {
        x: -0.6,
        y: direction === "up" ? 0.73 : direction === "down" ? 0.43 : 0.57,
        z: 0
      };
    case "right":
      return {
        x: 0.6,
        y: direction === "up" ? 0.73 : direction === "down" ? 0.43 : 0.57,
        z: 0
      };
  }
}

function laneTargetAnchor(position: SeatVisualPosition): SouthPerspectiveWorldPoint {
  switch (position) {
    case "bottom":
      return { x: 0, y: 0.29, z: 0 };
    case "top":
      return { x: 0, y: 0.87, z: 0 };
    case "left":
      return { x: -0.66, y: 0.58, z: 0 };
    case "right":
      return { x: 0.66, y: 0.58, z: 0 };
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
    y:
      config.sourcePosition === "bottom" || config.targetPosition === "bottom"
        ? 0.5
        : 0.67,
    z: 0
  };
  const t = config.displayMode === "passing" ? 0.42 : 0.75;
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

export function resolveSouthPerspectiveDebugLayout(
  projector: SouthPerspectiveProjector
): SouthPerspectiveDebugLayout {
  const margin = projector.geometry.viewportWidth * SOUTH_PERSPECTIVE_LAYOUT.uiSafeMargin;
  const leftPanelWidth = Math.min(
    projector.geometry.viewportWidth * 0.2,
    256
  );
  const rightPanelWidth = Math.min(
    projector.geometry.viewportWidth * 0.21,
    332
  );
  const bottomPanelHeight = Math.min(
    projector.geometry.viewportHeight * 0.18,
    200
  );

  return {
    viewport: {
      left: 0,
      top: 0,
      width: projector.geometry.viewportWidth,
      height: projector.geometry.viewportHeight
    },
    tableRect: projector.geometry.tableRect,
    safeTopLeft: {
      left: margin,
      top: margin,
      width: leftPanelWidth,
      height: 184
    },
    safeBottomLeft: {
      left: margin,
      top: projector.geometry.viewportHeight - bottomPanelHeight - margin,
      width: leftPanelWidth,
      height: bottomPanelHeight
    },
    safeBottomRight: {
      left:
        projector.geometry.viewportWidth - rightPanelWidth - margin,
      top: projector.geometry.viewportHeight - bottomPanelHeight - margin,
      width: rightPanelWidth,
      height: bottomPanelHeight
    },
    anchors: [
      { key: "south-hand", ...projector.projectPoint({ x: 0, y: 0.24, z: 0 }) },
      { key: "center-trick", ...projector.projectPoint({ x: 0, y: 0.56, z: 0 }) },
      { key: "north-hand", ...projector.projectPoint({ x: 0, y: 0.94, z: 0 }) },
      { key: "west-hand", ...projector.projectPoint({ x: -0.82, y: 0.68, z: 0 }) },
      { key: "east-hand", ...projector.projectPoint({ x: 0.82, y: 0.68, z: 0 }) }
    ].map(({ key, screenX, screenY }) => ({
      key,
      x: screenX,
      y: screenY
    }))
  };
}

export function resolvePrimarySeatAnchor(
  projector: SouthPerspectiveProjector,
  position: SeatVisualPosition
) {
  return projector.projectPoint(getSeatAnchor(position));
}
