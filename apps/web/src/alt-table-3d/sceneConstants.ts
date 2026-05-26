export const SHOW_DEBUG_ANCHORS = false;

export const ALT_TABLE_BACKGROUND = "#070301";

export const TABLE_W = 11.8;
export const TABLE_D = 8.75;
export const TABLE_H = 0.34;

export const FELT_W = 9.55;
export const FELT_D = 6.55;
export const FELT_Y = 0.19;

export const RAIL_H = 0.34;
export const RAIL_DEPTH = 0.7;
export const RAIL_RADIUS = 0.12;

export const NORTH_RAIL_W = 5.0;
export const SOUTH_RAIL_W = 7.1;
export const SIDE_RAIL_W = 4.5;

export const NORTH_Z = -3.18;
export const SOUTH_Z = 2.18;
export const WEST_X = -4.08;
export const EAST_X = 4.08;

export const LABEL_Y_OFFSET = 0.09;

export const ALT_TABLE_CAMERA = {
  fov: 42,
  near: 0.1,
  far: 100,
  position: [0, 6.95, 7.25] as const
};

export const ALT_TABLE_CAMERA_TARGET = [0, 0.03, -0.18] as const;

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
