import { describe, expect, it } from "vitest";

import { resolveCardSpriteVisualTuning } from "../../apps/web/src/alt-table-3d/AltTichuTable3D";
import { getFrontRailAssemblyConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT front rail visibility", () => {
  it("keeps the south hand lower and smaller so the front rail hardware can stay visible", () => {
    const visual = resolveCardSpriteVisualTuning(
      {
        idx: 0,
        id: "south_01",
        zone: "south_hand",
        kind: "card",
        seat: "south",
        slot: 0,
        layout_source: "prototype_layer",
        role: "hand",
        face_policy: "face",
        orientation: "portrait",
        rotation_deg: -12,
        w_px: 120,
        h_px: 180,
        center_px: { x: 768, y: 820 },
        bbox_px: { x: 708, y: 730, w: 120, h: 180 },
        polygon_px: []
      },
      "south_hand",
      6,
      14
    );

    expect(visual.width).toBeLessThan(96);
    expect(visual.height).toBeLessThan(144);
    expect(visual.translateY).toBeGreaterThan(68);
  });

  it("uses a more prominent front rail assembly for the south plaque, score, and pass blocks", () => {
    const config = getFrontRailAssemblyConfig();

    expect(config.railHeight).toBeGreaterThan(0.28);
    expect(config.railDepth).toBeGreaterThan(0.4);
    expect(config.centerBlockHeight).toBeGreaterThan(0.5);
    expect(config.sideBlockHeight).toBeGreaterThan(0.42);
  });
});
