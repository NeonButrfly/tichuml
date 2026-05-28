import { describe, expect, it } from "vitest";
import {
  computeNormalSpriteTransform,
  getNormalSpritePassDirection,
  getNormalSpriteSelectedHandAnchors,
  resolveNormalSpriteCardFaceSrc,
  resolveNormalSpritePassAnchor,
  resolveNormalSpriteTrickAnchor
} from "../../apps/web/src/normal-table-sprite-assets";

describe("normal table sprite assets", () => {
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
});
