import type { PassTarget } from "../table-model";
import type { SeatVisualPosition } from "../table-layout";

export const ALT_TABLE_CAMERA = {
  position: [0, 6.4, 11.8] as const,
  fov: 29
};

export const ALT_TABLE_CAMERA_TARGET = [0, 0.7, 1.8] as const;

export const ALT_TABLE_ROOT_POSITION = [0, -0.82, 0.05] as const;

export const SEAT_TRAY_POSITIONS: Record<SeatVisualPosition, [number, number, number]> = {
  top: [0, 0.78, -3.68],
  right: [5.55, 0.78, 0.1],
  bottom: [0, 0.78, 4.48],
  left: [-5.55, 0.78, 0.1]
};

export const SEAT_HAND_CARD_ROTATIONS: Record<SeatVisualPosition, [number, number, number]> = {
  top: [-0.98, Math.PI, 0],
  right: [-0.92, 0, -0.24],
  bottom: [-0.72, 0, 0],
  left: [-0.92, 0, 0.24]
};

export const SEAT_CENTER_CARD_ROTATIONS: Record<SeatVisualPosition, [number, number, number]> = {
  top: [-1.18, Math.PI, 0],
  right: [-1.18, -Math.PI / 2, 0],
  bottom: [-1.18, 0, 0],
  left: [-1.18, Math.PI / 2, 0]
};

const PASS_LANE_OFFSETS: Record<
  SeatVisualPosition,
  Record<PassTarget, [number, number, number]>
> = {
  bottom: {
    left: [-2.26, 0.28, 4.82],
    partner: [0, 0.2, 3.82],
    right: [4.76, 0.28, 4.86]
  },
  top: {
    left: [-4.44, 0.28, -3.54],
    partner: [0, 0.2, -2.84],
    right: [4.44, 0.28, -3.54]
  },
  left: {
    left: [-5.32, 0.24, -2.54],
    partner: [-4.18, 0.2, 0.1],
    right: [-5.32, 0.24, 2.68]
  },
  right: {
    left: [5.32, 0.24, 2.68],
    partner: [4.18, 0.2, 0.1],
    right: [5.32, 0.24, -2.54]
  }
};

export function getPassLanePosition(
  sourcePosition: SeatVisualPosition,
  target: PassTarget
) {
  return PASS_LANE_OFFSETS[sourcePosition][target];
}

export function getSeatLabelPosition(position: SeatVisualPosition): [number, number, number] {
  switch (position) {
    case "top":
      return [0, 1, -3.7];
    case "right":
      return [5.2, 0.98, 0.08];
    case "bottom":
      return [0, 0.88, 4.9];
    case "left":
      return [-5.2, 0.98, 0.08];
  }
}

export function getSeatStatusPosition(position: SeatVisualPosition): [number, number, number] {
  switch (position) {
    case "top":
      return [0, 0.46, -2.7];
    case "right":
      return [4.58, 0.46, 0.08];
    case "bottom":
      return [0, 0.44, 3.74];
    case "left":
      return [-4.58, 0.46, 0.08];
  }
}
