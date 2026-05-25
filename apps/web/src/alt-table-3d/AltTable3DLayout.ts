import type { PassTarget } from "../table-model";
import type { SeatVisualPosition } from "../table-layout";

export const ALT_TABLE_CAMERA = {
  position: [0, 10.4, 18.6] as const,
  fov: 40
};

export const ALT_TABLE_CAMERA_TARGET = [0, -0.3, 0.15] as const;

export const ALT_TABLE_ROOT_POSITION = [0, -1.2, 0] as const;

export const SEAT_TRAY_POSITIONS: Record<SeatVisualPosition, [number, number, number]> = {
  top: [0, 0.72, -4.65],
  right: [6.12, 0.72, 0],
  bottom: [0, 0.72, 4.7],
  left: [-6.12, 0.72, 0]
};

export const SEAT_CARD_ROTATIONS: Record<SeatVisualPosition, [number, number, number]> = {
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
    left: [-1.65, 0.045, 2.25],
    partner: [0, 0.045, 1.55],
    right: [1.65, 0.045, 2.25]
  },
  top: {
    left: [1.65, 0.045, -2.25],
    partner: [0, 0.045, -1.55],
    right: [-1.65, 0.045, -2.25]
  },
  left: {
    left: [-4.1, 0.045, -1.6],
    partner: [-3.35, 0.045, 0],
    right: [-4.1, 0.045, 1.6]
  },
  right: {
    left: [4.1, 0.045, 1.6],
    partner: [3.35, 0.045, 0],
    right: [4.1, 0.045, -1.6]
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
      return [0, 0.42, -5.72];
    case "right":
      return [7.16, 0.42, 0];
    case "bottom":
      return [0, 0.42, 5.78];
    case "left":
      return [-7.16, 0.42, 0];
  }
}

export function getSeatStatusPosition(position: SeatVisualPosition): [number, number, number] {
  switch (position) {
    case "top":
      return [0, 0.42, -3.82];
    case "right":
      return [4.94, 0.42, 0];
    case "bottom":
      return [0, 0.42, 3.88];
    case "left":
      return [-4.94, 0.42, 0];
  }
}
