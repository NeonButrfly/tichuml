import { describe, expect, it } from "vitest";

import { getAltTableWorldPlateConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT world plate mask config", () => {
  it("keeps the authored world plate strongest at the table border while cutting back its influence across the center play surface", () => {
    const config = getAltTableWorldPlateConfig();

    expect(config.centerInsetX).toBeGreaterThan(0.9);
    expect(config.centerInsetZ).toBeGreaterThan(0.72);
    expect(config.opacity).toBeGreaterThan(0.5);
  });
});
