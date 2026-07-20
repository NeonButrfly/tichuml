import { describe, expect, it } from "vitest";

import { getAltTableReferenceHardwareMaskConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT reference hardware mask config", () => {
  it("limits the reference overlay to rack and rail hardware zones so authored face-up table content does not bleed into the live 3D scene", () => {
    const config = getAltTableReferenceHardwareMaskConfig();

    expect(config.topRack.y).toBeLessThan(80);
    expect(config.leftRack.height).toBeGreaterThan(500);
    expect(config.rightRack.x).toBeGreaterThan(1000);
    expect(config.frontRail.y).toBeGreaterThan(900);
    expect(config.scorePlaque.y).toBeGreaterThan(800);
    expect(config.passPlaque.y).toBeGreaterThan(800);
    expect(config.specialCardPlaque.y).toBeGreaterThan(440);
  });
});
