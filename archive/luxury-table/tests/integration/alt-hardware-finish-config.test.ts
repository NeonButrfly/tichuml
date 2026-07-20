import { describe, expect, it } from "vitest";

import {
  getAltTableHardwareFinishConfig,
  getAltTableRackMaterialConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT hardware finish", () => {
  it("keeps dedicated frame and front-rail glow layers active so the hardware reads less like matte slabs", () => {
    const config = getAltTableHardwareFinishConfig();

    expect(config.frameTopGlowOpacity).toBeGreaterThan(0.18);
    expect(config.railTopGlowOpacity).toBeGreaterThan(0.2);
    expect(config.railLipGlowOpacity).toBeGreaterThan(0.26);
    expect(config.centerBlockGlowOpacity).toBeGreaterThan(0.24);
    expect(config.sideBlockGlowOpacity).toBeGreaterThan(0.2);
  });

  it("keeps rack and frame finish values polished enough to support the added glow layers", () => {
    const config = getAltTableRackMaterialConfig();

    expect(config.rackWoodRoughness).toBeLessThan(0.53);
    expect(config.rackWoodMetalness).toBeGreaterThan(0.18);
    expect(config.frameWoodAccentOpacity).toBeGreaterThan(0.2);
  });
});
