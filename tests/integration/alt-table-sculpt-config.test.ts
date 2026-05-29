import { describe, expect, it } from "vitest";

import { getAltTableSculptConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table sculpt config", () => {
  it("keeps the board on a layered carved-body setup instead of a single flat slab", () => {
    const config = getAltTableSculptConfig();

    expect(config.plinthHeight).toBeGreaterThan(0.08);
    expect(config.upperDeckHeight).toBeGreaterThan(0.07);
    expect(config.upperDeckReveal).toBeGreaterThan(0.2);
    expect(config.innerRailHeight).toBeGreaterThan(0.05);
    expect(config.innerRailWidth).toBeGreaterThan(0.15);
  });

  it("preserves extra tray mass on the hidden-hand racks", () => {
    const config = getAltTableSculptConfig();

    expect(config.rackTrayBridgeHeight).toBeGreaterThan(0.1);
    expect(config.rackRearSpineHeight).toBeGreaterThan(0.15);
  });
});
