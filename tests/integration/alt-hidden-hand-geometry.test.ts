import { describe, expect, it } from "vitest";

import {
  designToWorld,
  getHiddenHandPresenceConfig,
  getHiddenHandSeatLayoutConfig,
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
  it("keeps hidden cards at a readable physical size with only shallow rack burial", () => {
    const config = getHiddenHandPresenceConfig();
    const seatLayout = getHiddenHandSeatLayoutConfig();

    expect(config.cardWidth).toBeGreaterThan(0.44);
    expect(config.cardHeight).toBeGreaterThan(0.62);
    expect(config.rackBuryDepth).toBeLessThan(0.035);
    expect(config.rackFloorY).toBeGreaterThan(0.09);
    expect(seatLayout.northTilt).toBeGreaterThan(0.26);
    expect(seatLayout.northYawSpread).toBeLessThanOrEqual(0.01);
    expect(seatLayout.sideYaw).toBeGreaterThan(0.42);
    expect(seatLayout.sideYaw).toBeLessThanOrEqual(0.5);
    expect(seatLayout.sideYawSpread).toBeLessThanOrEqual(0.003);
    expect(seatLayout.sideCardStepZ).toBeGreaterThan(0.11);
    expect(seatLayout.sideCardStepZ).toBeLessThan(0.14);
    expect(seatLayout.sideInboardOffset).toBeGreaterThan(0.27);
  });

  it("keeps north cards upright but exposes more back surface toward the camera", () => {
    const card = buildHiddenCard("north", 6);
    const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
    const placement = resolveHiddenHandPlacement(card);

    expect(placement.rotation[0]).toBeGreaterThan(0.2);
    expect(placement.position[2]).toBeGreaterThan(base[2] + 0.18);
  });

  it("compresses hidden-hand span into rack-local spacing instead of replaying the full 2D authored fan", () => {
    const northFirst = resolveHiddenHandPlacement(buildHiddenCard("north", 0));
    const northLast = resolveHiddenHandPlacement(buildHiddenCard("north", 13));
    const eastFirst = resolveHiddenHandPlacement(buildHiddenCard("east", 0));
    const eastLast = resolveHiddenHandPlacement(buildHiddenCard("east", 13));
    const westFirst = resolveHiddenHandPlacement(buildHiddenCard("west", 0));
    const westLast = resolveHiddenHandPlacement(buildHiddenCard("west", 13));

    expect(Math.abs(northLast.position[0] - northFirst.position[0])).toBeLessThan(2.35);
    expect(Math.abs(eastLast.position[2] - eastFirst.position[2])).toBeLessThan(1.7);
    expect(Math.abs(westLast.position[2] - westFirst.position[2])).toBeLessThan(1.7);
  });

  it("keeps east and west cards less buried, more camera-open, and pulled inward into the trays", () => {
    const eastCard = buildHiddenCard("east", 6);
    const westCard = buildHiddenCard("west", 6);
    const eastBase = designToWorld(eastCard.anchor.center_px.x, eastCard.anchor.center_px.y);
    const westBase = designToWorld(westCard.anchor.center_px.x, westCard.anchor.center_px.y);
    const eastPlacement = resolveHiddenHandPlacement(eastCard);
    const westPlacement = resolveHiddenHandPlacement(westCard);

    expect(eastPlacement.position[0]).toBeLessThan(eastBase[0]);
    expect(westPlacement.position[0]).toBeGreaterThan(westBase[0]);
    expect(Math.abs(eastPlacement.position[2])).toBeLessThan(Math.abs(eastBase[2]));
    expect(Math.abs(westPlacement.position[2])).toBeLessThan(Math.abs(westBase[2]));
    expect(eastPlacement.rotation[1]).toBeLessThan(-0.42);
    expect(eastPlacement.rotation[1]).toBeGreaterThan(-0.52);
    expect(westPlacement.rotation[1]).toBeGreaterThan(0.42);
    expect(westPlacement.rotation[1]).toBeLessThan(0.52);
  });
});
