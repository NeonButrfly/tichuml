import type {
  AlternatePassRoutePlacement,
  AlternateTableLayout,
  Point,
  Rect
} from "./layout";

export type SceneVector = {
  x: number;
  y: number;
  z: number;
};

export type SceneSize = {
  x: number;
  y: number;
  z: number;
};

export type AlternateSceneFeature = {
  center: SceneVector;
  size: SceneSize;
  radius: number;
};

export type AlternateScenePassCup = AlternateSceneFeature & {
  key: string;
  rotationDeg: number;
};

export type AlternateTableSceneLayout = {
  northTray: AlternateSceneFeature;
  westTray: AlternateSceneFeature;
  eastTray: AlternateSceneFeature;
  southShelf: AlternateSceneFeature;
  trickBowl: AlternateSceneFeature;
  passCups: AlternateScenePassCup[];
};

const SCENE_TABLE_WIDTH = 14.8;
const SCENE_TABLE_DEPTH = 11.8;
const SURFACE_Y = 0.2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function unionRects(first: Rect, second: Rect): Rect {
  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function stageToScenePosition(layout: AlternateTableLayout, point: Point) {
  const u = clamp((point.x - layout.boardRect.x) / Math.max(1, layout.boardRect.width), 0, 1);
  const v = clamp((point.y - layout.boardRect.y) / Math.max(1, layout.boardRect.height), 0, 1);
  return {
    x: (u - 0.5) * SCENE_TABLE_WIDTH,
    z: (v - 0.5) * SCENE_TABLE_DEPTH
  };
}

function rectToFeature(
  layout: AlternateTableLayout,
  rect: Rect,
  config: {
    y: number;
    height: number;
    widthInset?: number;
    depthInset?: number;
    minWidth?: number;
    minDepth?: number;
    maxWidth?: number;
    maxDepth?: number;
    radius?: number;
  }
): AlternateSceneFeature {
  const center = rectCenter(rect);
  const sceneCenter = stageToScenePosition(layout, center);
  const widthRatio = rect.width / Math.max(1, layout.boardRect.width);
  const depthRatio = rect.height / Math.max(1, layout.boardRect.height);
  const width = clamp(
    widthRatio * SCENE_TABLE_WIDTH - (config.widthInset ?? 0),
    config.minWidth ?? 0.35,
    config.maxWidth ?? SCENE_TABLE_WIDTH
  );
  const depth = clamp(
    depthRatio * SCENE_TABLE_DEPTH - (config.depthInset ?? 0),
    config.minDepth ?? 0.35,
    config.maxDepth ?? SCENE_TABLE_DEPTH
  );
  return {
    center: {
      x: sceneCenter.x,
      y: config.y,
      z: sceneCenter.z
    },
    size: {
      x: width,
      y: config.height,
      z: depth
    },
    radius: config.radius ?? 0.14
  };
}

export function resolveAlternateTableSceneLayout(
  layout: AlternateTableLayout
): AlternateTableSceneLayout {
  const southShelfRect = unionRects(layout.seats.bottom.rack, layout.southControlRect);
  return {
    northTray: rectToFeature(layout, layout.seats.top.rack, {
      y: SURFACE_Y + 0.14,
      height: 0.16,
      widthInset: 0.55,
      depthInset: 0.38,
      minWidth: 1.95,
      minDepth: 0.68,
      maxWidth: 4.6,
      maxDepth: 0.92,
      radius: 0.2
    }),
    westTray: rectToFeature(layout, layout.seats.left.rack, {
      y: SURFACE_Y + 0.12,
      height: 0.16,
      widthInset: 0.1,
      depthInset: 1.1,
      minWidth: 0.86,
      minDepth: 1.4,
      maxWidth: 1.24,
      maxDepth: 2.45,
      radius: 0.18
    }),
    eastTray: rectToFeature(layout, layout.seats.right.rack, {
      y: SURFACE_Y + 0.12,
      height: 0.16,
      widthInset: 0.1,
      depthInset: 1.1,
      minWidth: 0.86,
      minDepth: 1.4,
      maxWidth: 1.24,
      maxDepth: 2.45,
      radius: 0.18
    }),
    southShelf: rectToFeature(layout, southShelfRect, {
      y: SURFACE_Y + 0.14,
      height: 0.18,
      widthInset: 0.35,
      depthInset: 1.1,
      minWidth: 5.6,
      minDepth: 1.5,
      maxWidth: 8.8,
      maxDepth: 2.3,
      radius: 0.2
    }),
    trickBowl: rectToFeature(layout, layout.trickRect, {
      y: SURFACE_Y + 0.015,
      height: 0.06,
      widthInset: 1.35,
      depthInset: 0.82,
      minWidth: 1.8,
      minDepth: 1.22,
      maxWidth: 2.9,
      maxDepth: 2.1,
      radius: 0.2
    }),
    passCups: layout.passRoutes.map((route) => ({
      ...rectToFeature(layout, route.rect, {
        y: SURFACE_Y + 0.08,
        height: 0.14,
        widthInset: 0.14,
        depthInset: 0.14,
        minWidth: 0.64,
        minDepth: 0.84,
        maxWidth: 1.24,
        maxDepth: 1.5,
        radius: 0.18
      }),
      key: route.key,
      rotationDeg: route.rotation
    }))
  };
}
