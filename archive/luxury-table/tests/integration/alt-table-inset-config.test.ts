import { describe, expect, it } from "vitest";

import { getAltTableInsetConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table inset config", () => {
  it("keeps the felt open with only thin rails around the gameplay area", () => {
    const config = getAltTableInsetConfig();

    expect(config.frameWidth).toBeLessThanOrEqual(0.35);
    expect(config.borderWidth).toBeLessThanOrEqual(0.35);
    expect(config.feltInsetX).toBe(0);
    expect(config.feltInsetZ).toBe(0);
  });
});
