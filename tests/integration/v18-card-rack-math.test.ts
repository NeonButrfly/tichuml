import { describe, expect, it } from "vitest";

import {
  makeNorthRackAnchors,
  makeSideRackAnchors,
  makeSouthCards
} from "../../apps/web/src/altTable/v18CardRackMath";

describe("v18 card rack math", () => {
  it("keeps north cards mostly visible with only a shallow hidden strip", () => {
    const north = makeNorthRackAnchors();

    expect(north).toHaveLength(14);
    expect(north.every((anchor) => anchor.renderMode === "north_rack_back_mostly_visible")).toBe(
      true
    );
    expect(north.every((anchor) => (anchor.hiddenBottomPx ?? 0) <= 16)).toBe(true);
    expect(north.every((anchor) => anchor.rotationDeg === 0)).toBe(true);
  });

  it("keeps east and west cards as readable side-rack fans instead of flat ninety-degree strips", () => {
    const east = makeSideRackAnchors("east");
    const west = makeSideRackAnchors("west");

    for (const anchor of [...east, ...west]) {
      expect(anchor.renderMode).toBe("side_rack_readable_fan");
      expect(Math.abs(anchor.rotationDeg)).toBeLessThan(30);
      expect(anchor.scaleX).toBeGreaterThan(0.6);
      expect(anchor.scaleX).toBeLessThan(0.8);
    }
  });

  it("keeps the south hand in a proper player fan anchored to the bottom rail", () => {
    const south = makeSouthCards();

    expect(south).toHaveLength(14);
    expect(south.every((anchor) => anchor.renderMode === "south_player_fan")).toBe(true);
    expect(south[0]?.centerPx.y).toBeGreaterThan(760);
    expect(south[6]?.rotationDeg).toBe(0);
    expect(south.at(-1)?.rotationDeg).toBeGreaterThan(10);
  });
});
