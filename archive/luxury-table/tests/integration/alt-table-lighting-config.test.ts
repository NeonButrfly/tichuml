import { describe, expect, it } from "vitest";

import {
  getAltTableLightingConfig,
  getAltTableSurfaceMaterialConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table lighting config", () => {
  it("keeps the felt and dragon readable under the live perspective camera instead of letting the center collapse into near-black", () => {
    const lighting = getAltTableLightingConfig();
    const surface = getAltTableSurfaceMaterialConfig();

    expect(lighting.ambientIntensity).toBeGreaterThan(1.65);
    expect(lighting.keyLightIntensity).toBeGreaterThan(2.15);
    expect(lighting.pointLightIntensity).toBeGreaterThan(14.5);
    expect(surface.feltTopEmissiveIntensity).toBeGreaterThan(0.66);
    expect(surface.dragonOpacity).toBeGreaterThan(0.5);
  });
});
