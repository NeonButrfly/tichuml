import { describe, expect, it } from "vitest";

import {
  getAltTableReferenceCenterConfig,
  getAltTableReferenceCenterMaskConfig
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT reference center config", () => {
  it("keeps a subtle scene-owned reference dragon lift active without washing the felt center back into a flat green patch", () => {
    const config = getAltTableReferenceCenterConfig();

    expect(config.opacity).toBeGreaterThan(0.15);
    expect(config.opacity).toBeLessThan(0.3);
    expect(config.brightness).toBeGreaterThan(1);
    expect(config.yOffset).toBeGreaterThan(0.09);
  });

  it("limits the center reference mask to the dragon zone so authored cards and plaques do not bleed back into the live scene", () => {
    const config = getAltTableReferenceCenterMaskConfig();

    expect(config.dragonField.cx).toBeGreaterThan(650);
    expect(config.dragonField.cy).toBeGreaterThan(300);
    expect(config.dragonField.rx).toBeLessThan(320);
    expect(config.dragonField.ry).toBeLessThan(260);
  });
});
