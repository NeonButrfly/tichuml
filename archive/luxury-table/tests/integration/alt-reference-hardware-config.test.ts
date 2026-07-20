import { describe, expect, it } from "vitest";

import { getAltTableReferenceHardwareConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT reference hardware config", () => {
  it("keeps a scene-owned reference-hardware overlay active so the ALT table can inherit more of the committed rack and rail look", () => {
    const config = getAltTableReferenceHardwareConfig();

    expect(config.opacity).toBeGreaterThan(0.5);
    expect(config.brightness).toBeGreaterThan(0.9);
    expect(config.yOffset).toBeGreaterThan(0.1);
  });
});
