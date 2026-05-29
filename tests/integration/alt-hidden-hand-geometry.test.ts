import { describe, expect, it } from "vitest";

import {
  designToWorld,
  getHiddenCardWorldSize,
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
      center_px:
        seat === "north"
          ? { x: 768 + (slotIndex - 6.5) * 38, y: 110 }
          : seat === "east"
            ? { x: 1405, y: 210 + slotIndex * 34 }
            : { x: 131, y: 210 + slotIndex * 34 },
      bbox_px:
        seat === "north"
          ? { x: 708 + (slotIndex - 6.5) * 38, y: 20, w: 120, h: 180 }
          : seat === "east"
            ? { x: 1345, y: 120 + slotIndex * 34, w: 120, h: 180 }
            : { x: 71, y: 120 + slotIndex * 34, w: 120, h: 180 },
      polygon_px: []
    }
  };
}

describe("ALT hidden-hand geometry", () => {
  it("keeps north cards upright but exposes more back surface toward the camera", () => {
    const card = buildHiddenCard("north", 6);
    const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
    const size = getHiddenCardWorldSize(card.anchor);
    const placement = resolveHiddenHandPlacement(card);

    expect(placement.rotation[0]).toBeGreaterThan(0.05);
    expect(placement.position[2]).toBeGreaterThan(base[2] - size.width * 0.24);
  });

  it("keeps east and west cards less buried and more camera-readable inside their trays", () => {
    const eastCard = buildHiddenCard("east", 6);
    const westCard = buildHiddenCard("west", 6);
    const eastBase = designToWorld(eastCard.anchor.center_px.x, eastCard.anchor.center_px.y);
    const westBase = designToWorld(westCard.anchor.center_px.x, westCard.anchor.center_px.y);
    const size = getHiddenCardWorldSize(eastCard.anchor);
    const eastPlacement = resolveHiddenHandPlacement(eastCard);
    const westPlacement = resolveHiddenHandPlacement(westCard);

    expect(eastPlacement.position[0]).toBeLessThan(eastBase[0] + size.width * 0.2);
    expect(westPlacement.position[0]).toBeGreaterThan(westBase[0] - size.width * 0.2);
    expect(eastPlacement.rotation[1]).toBeLessThan(-0.92);
    expect(westPlacement.rotation[1]).toBeGreaterThan(0.92);
  });
});
