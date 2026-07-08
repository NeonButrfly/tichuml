import { describe, expect, it } from "vitest";
import {
  getAltTablePassingLaneLayout,
  getAltTableSouthHandLayout,
  projectAltTablePassingLaneToDesignRect
} from "../../apps/web/src/alt-table-3d/altTable3DGeometry";
import { makePassingAnchors } from "../../apps/web/src/altTableFresh/freshTableMath";

const LANE_KEY_BY_ANCHOR_ID = {
  north_pass_left: "north:east",
  north_pass_across: "north:south",
  north_pass_right: "north:west",
  south_pass_left: "south:west",
  south_pass_across: "south:north",
  south_pass_right: "south:east",
  west_pass_north: "west:north",
  west_pass_across: "west:east",
  west_pass_south: "west:south",
  east_pass_north: "east:north",
  east_pass_across: "east:west",
  east_pass_south: "east:south"
} as const;

describe("fresh alt pass anchors", () => {
  it("projects live pass-lane anchors from the canonical 3D table geometry", () => {
    const lanes = getAltTablePassingLaneLayout();
    const laneByKey = new Map(
      lanes.map((lane) => [`${lane.seat}:${lane.target}`, lane] as const)
    );
    const anchors = makePassingAnchors();

    expect(anchors).toHaveLength(12);

    for (const anchor of anchors) {
      const laneKey = LANE_KEY_BY_ANCHOR_ID[anchor.id as keyof typeof LANE_KEY_BY_ANCHOR_ID];
      const lane = laneByKey.get(laneKey);
      expect(lane).toBeTruthy();

      const projected = projectAltTablePassingLaneToDesignRect(lane!);
      expect(anchor.centerPx.x).toBeCloseTo(projected.centerPx.x, 3);
      expect(anchor.centerPx.y).toBeCloseTo(projected.centerPx.y, 3);
      expect(anchor.wPx).toBeCloseTo(projected.wPx, 3);
      expect(anchor.hPx).toBeCloseTo(projected.hPx, 3);
    }
  });

  it("keeps the south passing row above the south hand and side rows ordered north to south", () => {
    const anchors = makePassingAnchors();
    const southHand = getAltTableSouthHandLayout();
    const southY = anchors
      .filter((anchor) => anchor.seat === "south")
      .map((anchor) => anchor.centerPx.y);
    const westY = anchors
      .filter((anchor) => anchor.seat === "west")
      .map((anchor) => anchor.centerPx.y);
    const eastY = anchors
      .filter((anchor) => anchor.seat === "east")
      .map((anchor) => anchor.centerPx.y);

    const southHandPx = projectAltTablePassingLaneToDesignRect({
      seat: "south",
      target: "north",
      label: "south hand reference",
      center: southHand.center,
      width: 0.62,
      depth: 0.88,
      arrowDir: { x: 0, z: -1 }
    }).centerPx.y;

    expect(Math.max(...southY)).toBeLessThan(southHandPx);
    expect(westY[0]).toBeLessThan(westY[1]!);
    expect(westY[1]).toBeLessThan(westY[2]!);
    expect(eastY[0]).toBeLessThan(eastY[1]!);
    expect(eastY[1]).toBeLessThan(eastY[2]!);
  });
});
