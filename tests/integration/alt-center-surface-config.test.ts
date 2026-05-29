import { describe, expect, it } from "vitest";

import { getAltTableSurfaceMaterialConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT center surface config", () => {
  it("keeps the felt center and dragon strong enough to read as a green play surface instead of collapsing into a near-black void", () => {
    const config = getAltTableSurfaceMaterialConfig();

    expect(config.feltTopEmissiveIntensity).toBeGreaterThan(0.65);
    expect(config.feltWellEmissiveIntensity).toBeGreaterThan(0.7);
    expect(config.dragonOpacity).toBeGreaterThan(0.78);
  });
});
