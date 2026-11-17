import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Seat } from "./freshTableMath";

export const RAIL_CARD_HEIGHT = 126;
export const RAIL_CARD_THICKNESS = 2.4;
export type RailSeat = Exclude<Seat, "south">;

export function createRailCamera() {
  // Keep a tight clipping range: a near plane of 1 wastes depth precision at
  // this camera distance and lets the card body fight its own printed faces.
  const camera = new PerspectiveCamera(42, 1536 / 1024, 100, 5000);
  camera.position.set(0, 1100, 1500);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

// Intersect artwork coordinates with the table plane. The card's lower edge
// lands on this rail point, while its height rises along world Y.
export function railPointToWorld(x: number, y: number) {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(x / 768 - 1, 1 - y / 512), createRailCamera());
  const point = new Vector3();
  ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), point);
  return point;
}

export function getRailCardPlacement(seat: RailSeat, index: number) {
  const t = Math.max(0, Math.min(13, index)) / 13;
  const base =
    seat === "north"
      ? { x: 478 + t * 580, y: 90 }
      : { x: seat === "west" ? 137 - t * 22 : 1399 + t * 22, y: 280 + t * 420 };
  const foot = railPointToWorld(base.x, base.y);
  // Overlapping upright cards cannot share one plane: their faces/body would
  // intersect and produce triangular depth artifacts. Step the north stack
  // by one card thickness inside the rail groove.
  if (seat === "north") {
    foot.z += (index - 6.5) * (RAIL_CARD_THICKNESS + 0.8);
    const projected = foot.clone().project(createRailCamera());
    base.x = (projected.x + 1) * 768;
    base.y = (1 - projected.y) * 512;
  }
  const height = seat === "north" ? 176 : RAIL_CARD_HEIGHT;
  const yaw =
    seat === "north" ? 0 : seat === "east" ? -Math.PI / 2 : Math.PI / 2;
  const backNormal = new Vector3(0, 0, 1).applyAxisAngle(
    new Vector3(0, 1, 0),
    yaw
  );
  return {
    base,
    foot,
    yaw,
    backNormal,
    height,
    position: [foot.x, height / 2, foot.z] as [number, number, number],
    width: seat === "north" ? 110 : 94
  };
}
