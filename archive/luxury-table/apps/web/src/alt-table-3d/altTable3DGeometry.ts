import { PerspectiveCamera, Vector3 } from "three";

const DESIGN_W = 1536;
const DESIGN_H = 1024;

type AltTableCompassSeat = "north" | "south" | "west" | "east";

export type AltTablePassingLane3D = {
  seat: AltTableCompassSeat;
  target: AltTableCompassSeat;
  label: string;
  center: { x: number; y: number; z: number };
  width: number;
  depth: number;
  arrowDir: { x: -1 | 0 | 1; z: -1 | 0 | 1 };
};

export function getAltTablePassingLaneLayout(): AltTablePassingLane3D[] {
  const y = 0.012;
  const horizontal = { width: 1.45, depth: 0.55 };
  const vertical = { width: 0.7, depth: 1.05 };

  return [
    { seat: "north", target: "east", label: "PASS EAST", center: { x: -1.8, y, z: -3 }, ...horizontal, arrowDir: { x: -1, z: 0 } },
    { seat: "north", target: "south", label: "PASS SOUTH", center: { x: 0, y, z: -3 }, ...vertical, arrowDir: { x: 0, z: 1 } },
    { seat: "north", target: "west", label: "PASS WEST", center: { x: 1.8, y, z: -3 }, ...horizontal, arrowDir: { x: 1, z: 0 } },
    { seat: "south", target: "west", label: "PASS WEST", center: { x: -1.8, y, z: 2.65 }, ...horizontal, arrowDir: { x: -1, z: 0 } },
    { seat: "south", target: "north", label: "PASS NORTH", center: { x: 0, y, z: 2.65 }, ...vertical, arrowDir: { x: 0, z: -1 } },
    { seat: "south", target: "east", label: "PASS EAST", center: { x: 1.8, y, z: 2.65 }, ...horizontal, arrowDir: { x: 1, z: 0 } },
    { seat: "west", target: "north", label: "PASS NORTH", center: { x: -5.8, y, z: -1.7 }, ...vertical, arrowDir: { x: 0, z: -1 } },
    { seat: "west", target: "east", label: "PASS EAST", center: { x: -5.8, y, z: 0 }, ...horizontal, arrowDir: { x: 1, z: 0 } },
    { seat: "west", target: "south", label: "PASS SOUTH", center: { x: -5.8, y, z: 1.7 }, ...vertical, arrowDir: { x: 0, z: 1 } },
    { seat: "east", target: "north", label: "PASS NORTH", center: { x: 5.8, y, z: -1.7 }, ...vertical, arrowDir: { x: 0, z: -1 } },
    { seat: "east", target: "west", label: "PASS WEST", center: { x: 5.8, y, z: 0 }, ...horizontal, arrowDir: { x: -1, z: 0 } },
    { seat: "east", target: "south", label: "PASS SOUTH", center: { x: 5.8, y, z: 1.7 }, ...vertical, arrowDir: { x: 0, z: 1 } }
  ];
}

export function getAltTableSouthHandLayout() {
  return {
    center: { x: 0, y: 0.018, z: 3.65 },
    cardTiltRadians: -Math.PI * 0.44
  } as const;
}

export function getAltTableActionButtonLayout() {
  return {
    center: { x: 0, y: 0.024, z: 4.55 },
    labels: ["PASS", "TICHU", "GRAND TICHU"] as const
  } as const;
}

export function getAltTableSeatLabelLayout() {
  return [
    { seat: "north", text: "NORTH", center: { x: 0, y: 0.03, z: -4.25 } },
    { seat: "south", text: "SOUTH", center: { x: 0, y: 0.03, z: 4.25 } },
    { seat: "west", text: "WEST", center: { x: -7.25, y: 0.03, z: 0 } },
    { seat: "east", text: "EAST", center: { x: 7.25, y: 0.03, z: 0 } }
  ] as const;
}

export function getAltTableCameraConfig() {
  return {
    position: [0, 9, 10] as const,
    target: [0, 0, 0] as const,
    fov: 40,
    near: 0.1,
    far: 64
  } as const;
}

export function projectAltTableWorldToDesignPx(point: {
  x: number;
  y: number;
  z: number;
}) {
  const cameraConfig = getAltTableCameraConfig();
  const camera = new PerspectiveCamera(
    cameraConfig.fov,
    DESIGN_W / DESIGN_H,
    cameraConfig.near,
    cameraConfig.far
  );
  camera.position.set(...cameraConfig.position);
  camera.lookAt(...cameraConfig.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const projected = new Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * DESIGN_W,
    y: (-projected.y * 0.5 + 0.5) * DESIGN_H
  } as const;
}

export function projectAltTablePassingLaneToDesignRect(lane: AltTablePassingLane3D) {
  const centerPx = projectAltTableWorldToDesignPx(lane.center);
  const leftPx = projectAltTableWorldToDesignPx({
    x: lane.center.x - lane.width / 2,
    y: lane.center.y,
    z: lane.center.z
  });
  const rightPx = projectAltTableWorldToDesignPx({
    x: lane.center.x + lane.width / 2,
    y: lane.center.y,
    z: lane.center.z
  });
  const topPx = projectAltTableWorldToDesignPx({
    x: lane.center.x,
    y: lane.center.y,
    z: lane.center.z - lane.depth / 2
  });
  const bottomPx = projectAltTableWorldToDesignPx({
    x: lane.center.x,
    y: lane.center.y,
    z: lane.center.z + lane.depth / 2
  });

  return {
    centerPx,
    wPx: Math.abs(rightPx.x - leftPx.x),
    hPx: Math.abs(bottomPx.y - topPx.y)
  } as const;
}
