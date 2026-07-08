import { describe, expect, it } from "vitest";

import {
  getAltTableActionButtonLayout,
  getAltTableCameraConfig,
  getAltTableInsetConfig,
  getAltTablePassingLaneLayout,
  getAltTableSeatLabelLayout,
  getAltTableSouthHandLayout,
  getFrontRailAssemblyConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";
import {
  getTableWorldSize,
  resolveHiddenHandPlacement,
  type HiddenHandCard
} from "../../apps/web/src/alt-table-3d/AltTableCards3D";

function buildHiddenCard(
  seat: HiddenHandCard["seat"],
  slotIndex: number,
  handCount = 14
): HiddenHandCard {
  return {
    seat,
    slotIndex,
    handCount,
    zone: `${seat}_hand`,
    card: {
      id: `${seat}-${slotIndex}`,
      kind: "standard",
      suit: "jades",
      rank: "9",
      label: "9 of Jades",
      src: "/tv7/c/jades-9.png"
    },
    anchor: {
      idx: slotIndex,
      id: `${seat}-${slotIndex}`,
      zone: `${seat}_hand`,
      kind: "card",
      seat,
      slot: slotIndex,
      layout_source: "prototype_layer",
      role: "hand",
      face_policy: "back",
      orientation: "portrait",
      rotation_deg: 0,
      w_px: 120,
      h_px: 180,
      center_px: { x: 768, y: 512 },
      bbox_px: { x: 708, y: 422, w: 120, h: 180 },
      polygon_px: []
    }
  };
}

function rotateVectorByEuler(
  vector: readonly [number, number, number],
  rotation: readonly [number, number, number]
) {
  const [x, y, z] = vector;
  const [rx, ry, rz] = rotation;
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);

  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;

  return [x3, y3, z2] as const;
}

function normalize(vector: readonly [number, number, number]) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length] as const;
}

function dot(a: readonly [number, number, number], b: readonly [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

describe("canonical ALT 3D table scene geometry", () => {
  it("uses the requested open 16 by 10 felt coordinate system with thin rails", () => {
    const world = getTableWorldSize();
    const inset = getAltTableInsetConfig();
    const frontRail = getFrontRailAssemblyConfig();

    expect(world).toEqual({ width: 16, height: 10 });
    expect(inset.feltInsetX).toBe(0);
    expect(inset.feltInsetZ).toBe(0);
    expect(inset.frameWidth).toBeLessThanOrEqual(0.35);
    expect(inset.borderWidth).toBeLessThanOrEqual(0.35);
    expect(frontRail.railDepth).toBeLessThanOrEqual(0.35);
  });

  it("frames the scene from the south player perspective without extreme distortion", () => {
    const camera = getAltTableCameraConfig();

    expect(camera.position).toEqual([0, 9, 10]);
    expect(camera.target).toEqual([0, 0, 0]);
    expect(camera.fov).toBeGreaterThanOrEqual(36);
    expect(camera.fov).toBeLessThanOrEqual(44);
  });

  it("orients every opponent card back normal inward toward table center", () => {
    const inwardBySeat = {
      north: [0, 0, 1],
      east: [-1, 0, 0],
      west: [1, 0, 0]
    } as const;

    for (const seat of ["north", "east", "west"] as const) {
      const placement = resolveHiddenHandPlacement(buildHiddenCard(seat, 6));
      const backNormal = normalize(rotateVectorByEuler([0, 0, -1], placement.rotation));

      expect(dot(backNormal, inwardBySeat[seat])).toBeGreaterThan(0.95);
    }
  });

  it("defines the 12 flat passing rectangles and arrows in world XZ", () => {
    const lanes = getAltTablePassingLaneLayout();

    expect(lanes).toHaveLength(12);
    expect(lanes.map((lane) => `${lane.seat}:${lane.target}`)).toEqual([
      "north:east",
      "north:south",
      "north:west",
      "south:west",
      "south:north",
      "south:east",
      "west:north",
      "west:east",
      "west:south",
      "east:north",
      "east:west",
      "east:south"
    ]);

    expect(lanes.map((lane) => lane.arrowDir)).toEqual([
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
      { x: 0, z: 1 }
    ]);

    const northAcross = lanes.find((lane) => lane.seat === "north" && lane.target === "south")!;
    const southAcross = lanes.find((lane) => lane.seat === "south" && lane.target === "north")!;
    const westAcross = lanes.find((lane) => lane.seat === "west" && lane.target === "east")!;
    const eastAcross = lanes.find((lane) => lane.seat === "east" && lane.target === "west")!;

    expect(northAcross.depth).toBeGreaterThan(northAcross.width);
    expect(southAcross.depth).toBeGreaterThan(southAcross.width);
    expect(westAcross.width).toBeGreaterThan(westAcross.depth);
    expect(eastAcross.width).toBeGreaterThan(eastAcross.depth);
    expect(lanes.every((lane) => lane.center.y > 0 && lane.center.y < 0.02)).toBe(true);
  });

  it("keeps south lanes above the south hand and actions below without duplicate score labels", () => {
    const lanes = getAltTablePassingLaneLayout();
    const southLaneZ = lanes
      .filter((lane) => lane.seat === "south")
      .map((lane) => lane.center.z);
    const southHand = getAltTableSouthHandLayout();
    const actions = getAltTableActionButtonLayout();
    const labels = getAltTableSeatLabelLayout();

    expect(new Set(southLaneZ)).toEqual(new Set([2.65]));
    expect(southHand.center.z).toBeGreaterThan(Math.max(...southLaneZ));
    expect(actions.center.z).toBeGreaterThan(southHand.center.z);
    expect(labels.filter((label) => label.seat === "south")).toHaveLength(1);
    expect(labels.some((label) => /1100/.test(label.text))).toBe(false);
  });
});
