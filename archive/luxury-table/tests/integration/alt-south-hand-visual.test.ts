import { describe, expect, it } from "vitest";

import { resolveCardSpriteVisualTuning } from "../../apps/web/src/alt-table-3d/AltTichuTable3D";

const southAnchor = {
  idx: 0,
  id: "south_01",
  zone: "south_hand",
  kind: "card",
  seat: "south",
  slot: 0,
  layout_source: "prototype_layer",
  role: "hand",
  face_policy: "front",
  orientation: "portrait",
  rotation_deg: 0,
  w_px: 120,
  h_px: 180,
  center_px: { x: 768, y: 905 },
  bbox_px: { x: 708, y: 815, w: 120, h: 180 },
  polygon_px: []
} as const;

describe("ALT south-hand visual tuning", () => {
  it("keeps the south fan compact and seated lower in the frame", () => {
    const outer = resolveCardSpriteVisualTuning(southAnchor, "south_hand", 0, 14);
    const inner = resolveCardSpriteVisualTuning(southAnchor, "south_hand", 6, 14);

    expect(outer.width).toBeLessThan(86);
    expect(outer.height).toBeLessThan(129);
    expect(Math.abs(outer.translateX)).toBeLessThan(80);
    expect(outer.translateY).toBeGreaterThan(70);
    expect(inner.translateY).toBeGreaterThan(82);
    expect(outer.transformOrigin).toBe("center 86%");
  });
});
