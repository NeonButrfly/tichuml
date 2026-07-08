import { describe, expect, it } from "vitest";

import { getAltTableWorldPlateConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT world plate config", () => {
  it("keeps an authored tv7 plate texture visibly present inside the 3D world scene instead of relying only on procedural dark slabs", () => {
    const config = getAltTableWorldPlateConfig();

    expect(config.opacity).toBeGreaterThan(0.34);
    expect(config.brightness).toBeGreaterThan(0.82);
    expect(config.yOffset).toBeGreaterThan(0.09);
  });
});
