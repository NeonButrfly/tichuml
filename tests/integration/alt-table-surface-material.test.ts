import { describe, expect, it } from "vitest";

import { getAltTableSurfaceMaterialConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table surface material", () => {
  it("keeps the felt well visibly lit and distinct from the dark wood body", () => {
    const config = getAltTableSurfaceMaterialConfig();

    expect(config.feltTopEmissiveIntensity).toBeGreaterThan(0.4);
    expect(config.feltWellEmissiveIntensity).toBeGreaterThan(0.5);
  });

  it("keeps the dragon and gold trim visible on the ALT surface", () => {
    const config = getAltTableSurfaceMaterialConfig();

    expect(config.dragonOpacity).toBeGreaterThan(0.28);
    expect(config.goldTrimOpacity).toBeGreaterThan(0.8);
  });
});
