import { describe, expect, it } from "vitest";

import {
  getAltTableCenterMotifConfig,
  getAltTableReferenceCenterConfig,
  getAltTableSurfaceMaterialConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT center motif visibility", () => {
  it("keeps the scene-owned medallion strong enough to read in the live perspective camera", () => {
    const config = getAltTableCenterMotifConfig();

    expect(config.medallionScale).toBeGreaterThan(1.6);
    expect(config.outerRingOpacity).toBeGreaterThan(0.55);
    expect(config.planeOpacity).toBeGreaterThan(0.26);
    expect(config.centerRingOpacity).toBeGreaterThan(0.26);
  });

  it("keeps the felt center and reference lift bright enough to support the stronger motif", () => {
    const surface = getAltTableSurfaceMaterialConfig();
    const reference = getAltTableReferenceCenterConfig();

    expect(surface.feltTopEmissiveIntensity).toBeGreaterThan(0.75);
    expect(surface.feltWellEmissiveIntensity).toBeGreaterThan(0.82);
    expect(reference.opacity).toBeGreaterThan(0.22);
    expect(reference.brightness).toBeGreaterThan(1.06);
  });
});
