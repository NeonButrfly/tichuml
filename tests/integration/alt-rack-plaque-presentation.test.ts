import { describe, expect, it } from "vitest";

import { getAltRackPlaquePresentationConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT rack plaque presentation", () => {
  it("keeps north and side plaque assemblies large enough and camera-open enough to read as rack hardware", () => {
    const config = getAltRackPlaquePresentationConfig();

    expect(config.northPlaqueDepth).toBeGreaterThan(0.48);
    expect(config.northPlaqueScale).toBeGreaterThan(1.08);
    expect(config.sidePlaqueYaw).toBeGreaterThan(0.45);
    expect(config.sidePlaqueYaw).toBeLessThan(0.7);
    expect(config.sidePlaqueOffset).toBeGreaterThan(0.4);
    expect(config.sidePlaqueScale).toBeGreaterThan(1.05);
  });
});
