import { describe, expect, it } from "vitest";

import { getAltTableRackMaterialConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT rack material config", () => {
  it("keeps visible trim on the ALT racks and frame so they do not collapse into dark blockouts", () => {
    const config = getAltTableRackMaterialConfig();

    expect(config.rackTrimOpacity).toBeGreaterThan(0.85);
    expect(config.frameTrimOpacity).toBeGreaterThan(0.84);
  });

  it("uses a more polished rack wood finish than the base body slabs", () => {
    const config = getAltTableRackMaterialConfig();

    expect(config.rackWoodRoughness).toBeLessThan(0.65);
    expect(config.rackWoodMetalness).toBeGreaterThan(0.14);
  });
});
