import { describe, expect, it } from "vitest";

import { getAltTableInsetConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table inset config", () => {
  it("keeps a visibly broad wood frame around the felt instead of letting felt consume the whole board", () => {
    const config = getAltTableInsetConfig();

    expect(config.frameWidth).toBeGreaterThan(0.75);
    expect(config.borderWidth).toBeGreaterThan(0.68);
    expect(config.feltInsetX).toBeGreaterThan(1.2);
    expect(config.feltInsetZ).toBeGreaterThan(0.95);
  });
});
