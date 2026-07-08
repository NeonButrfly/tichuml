import { describe, expect, it } from "vitest";

import { getAltTablePlateBlendConfig } from "../../apps/web/src/alt-table-3d/AltTichuTable3D";

describe("ALT table plate blend config", () => {
  it("keeps the committed tv7 table plate visibly contributing to the final ALT board instead of being effectively hidden", () => {
    const config = getAltTablePlateBlendConfig();

    expect(config.opacity).toBeGreaterThan(0.14);
    expect(config.brightness).toBeGreaterThan(0.78);
    expect(config.saturate).toBeGreaterThan(0.75);
  });
});
