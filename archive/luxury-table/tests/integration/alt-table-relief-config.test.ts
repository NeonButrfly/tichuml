import { describe, expect, it } from "vitest";

import { getAltTableReliefConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT table relief config", () => {
  it("keeps a visibly stepped wood shoulder around the felt so the board reads like a carved table instead of a flat slab", () => {
    const config = getAltTableReliefConfig();

    expect(config.topShoulderInset).toBeGreaterThan(0.34);
    expect(config.topShoulderHeight).toBeGreaterThan(0.09);
    expect(config.feltWellDrop).toBeGreaterThan(0.08);
    expect(config.centerHighlightOpacity).toBeGreaterThan(0.12);
  });
});
