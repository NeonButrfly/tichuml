import { describe, expect, it } from "vitest";

import {
  getAltTableReferenceCenterConfig,
  getAltTableReferenceCenterMaskConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT reference center config", () => {
  it("keeps a scene-owned reference felt layer active so the live ALT scene can inherit the committed green felt and dragon read", () => {
    const config = getAltTableReferenceCenterConfig();

    expect(config.opacity).toBeGreaterThan(0.7);
    expect(config.brightness).toBeGreaterThan(1);
    expect(config.yOffset).toBeGreaterThan(0.09);
  });

  it("limits the center reference mask to the dragon/felt field so authored cards and plaques do not bleed back into the live scene", () => {
    const config = getAltTableReferenceCenterMaskConfig();

    expect(config.dragonField.x).toBeGreaterThan(250);
    expect(config.dragonField.y).toBeGreaterThan(100);
    expect(config.dragonField.width).toBeLessThan(1000);
    expect(config.dragonField.height).toBeLessThan(560);
  });
});
