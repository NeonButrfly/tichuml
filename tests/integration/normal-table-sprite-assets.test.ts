import { describe, expect, it } from "vitest";
import {
  computeNormalSpriteTransform,
  NORMAL_TABLE_SPRITE_BASE_SRC,
  NORMAL_TABLE_SPRITE_DRAGON_SRC,
  getNormalSpriteHiddenPassCount,
  getNormalSpritePassDirection,
  getNormalSpriteSelectedHandAnchors,
  getNormalSpriteSeatwardOffset,
  resolveNormalSpriteRack,
  resolveNormalSpriteCardFaceSrc,
  resolveNormalSpritePassAnchor,
  resolveNormalSpriteTrickAnchor,
  shouldRenderNormalSpritePassCard
} from "../../apps/web/src/normal-table-sprite-assets";

describe("normal table sprite assets", () => {
  it("pins the classic runtime to the flattened 2D plate instead of the split base plus dragon stack", () => {
    expect(NORMAL_TABLE_SPRITE_BASE_SRC).toBe("/tv_ed/t/plate.png");
    expect(NORMAL_TABLE_SPRITE_DRAGON_SRC).toBeNull();
  });

  it("maps standard and special cards to the authored sprite pack", () => {
    expect(
      resolveNormalSpriteCardFaceSrc({
        id: "jade-14",
        kind: "standard",
        suit: "jade",
        rank: 14
      })
    ).toBe("/tv_ed/c/std/jd_A.png");

    expect(
      resolveNormalSpriteCardFaceSrc({
        id: "dragon",
        kind: "special",
        special: "dragon"
      })
    ).toBe("/tv_ed/c/sp/dragon.png");
  });

  it("selects a centered anchor subset for partial hands", () => {
    const anchors = getNormalSpriteSelectedHandAnchors({
      seat: "south",
      count: 8
    });

    expect(anchors).toHaveLength(8);
    expect(anchors[0]?.id).toBe("s04");
    expect(anchors.at(-1)?.id).toBe("s11");
  });

  it("resolves canonical pass-lane anchors and directions", () => {
    const eastAcross = resolveNormalSpritePassAnchor({
      sourcePosition: "right",
      targetPosition: "left"
    });

    expect(eastAcross?.id).toBe("east_pass_across");
    expect(getNormalSpritePassDirection(eastAcross!)).toBe("left");

    const westNorth = resolveNormalSpritePassAnchor({
      sourcePosition: "left",
      targetPosition: "top"
    });

    expect(westNorth?.id).toBe("west_pass_north");
    expect(getNormalSpritePassDirection(westNorth!)).toBe("up");
  });

  it("keeps the authored design-space transform stable", () => {
    expect(
      computeNormalSpriteTransform({
        viewportWidth: 1536,
        viewportHeight: 1024
      })
    ).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0
    });
  });

  it("exposes the authored trick anchors for live staging", () => {
    expect(resolveNormalSpriteTrickAnchor("center")?.id).toBe("trick_center");
    expect(resolveNormalSpriteTrickAnchor("south")?.center_px.y).toBe(580);
  });

  it("exposes the rack groove bounds and seatward offsets for rail-seated hands", () => {
    expect(resolveNormalSpriteRack("north")?.card_channel_px?.w).toBe(616);
    const offset = getNormalSpriteSeatwardOffset({
      position: "top",
      width: 40,
      height: 60
    });
    expect(offset.x).toBe(0);
    expect(offset.y).toBeCloseTo(-9.6);

    const sideOffset = getNormalSpriteSeatwardOffset({
      position: "left",
      width: 46,
      height: 74
    });
    expect(sideOffset.x).toBeCloseTo(-12.88);
    expect(sideOffset.y).toBe(0);
  });

  it("keeps remote rack counts full during passing and suppresses hidden remote pass cards", () => {
    expect(
      getNormalSpriteHiddenPassCount({
        seat: "seat-2",
        passRouteViews: [
          { sourceSeat: "seat-2", occupied: true },
          { sourceSeat: "seat-2", occupied: true },
          { sourceSeat: "seat-2", occupied: true },
          { sourceSeat: "seat-1", occupied: true }
        ]
      })
    ).toBe(3);

    expect(
      shouldRenderNormalSpritePassCard({
        sourceSeat: "seat-2",
        occupied: true,
        visibleCardId: null
      })
    ).toBe(false);
    expect(
      shouldRenderNormalSpritePassCard({
        sourceSeat: "seat-0",
        occupied: true,
        visibleCardId: null
      })
    ).toBe(true);
  });
});
