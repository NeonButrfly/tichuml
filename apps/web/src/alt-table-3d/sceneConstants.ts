export const SHOW_DEBUG_ANCHORS = false;

export const ALT_TABLE_BACKGROUND = "#070301";

export const TABLE_W = 10.8;
export const TABLE_D = 7.6;
export const TABLE_H = 0.36;

export const FELT_W = 9.15;
export const FELT_D = 6.05;
export const FELT_Y = 0.235;

export const RAIL_H = 0.42;
export const RAIL_DEPTH = 0.52;
export const RAIL_RADIUS = 0.12;

export const NORTH_RAIL_W = 4.6;
export const SOUTH_RAIL_W = 5.9;
export const SIDE_RAIL_W = 3.6;

export const NORTH_Z = -2.88;
export const SOUTH_Z = 2.8;
export const WEST_X = -4.5;
export const EAST_X = 4.5;

export const LABEL_Y_OFFSET = 0.225;

export const ALT_TABLE_CAMERA = {
  fov: 40,
  near: 0.1,
  far: 100,
  position: [0, 6.9, 7.05] as const
};

export const ALT_TABLE_CAMERA_TARGET = [0, 0.12, 0.08] as const;

export const ALT_SCENE_MARKERS = {
  tableRoot: "TableRoot",
  feltInset: "felt-inset",
  northRail: "north-rail",
  southRail: "south-rail",
  eastRail: "east-rail",
  westRail: "west-rail",
  northLabel: "north-label",
  southLabel: "south-label",
  eastLabel: "east-label",
  westLabel: "west-label"
} as const;
