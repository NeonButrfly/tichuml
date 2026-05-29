import { describe, expect, it } from "vitest";

import { getAltRackSlotDividerConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT rack slot dividers", () => {
  it("keeps divider hardware present so hidden hands read as cards seated into individual rack slots", () => {
    const config = getAltRackSlotDividerConfig();

    expect(config.dividerThickness).toBeGreaterThan(0.015);
    expect(config.dividerHeight).toBeGreaterThan(0.14);
    expect(config.northInset).toBeGreaterThan(0.06);
    expect(config.sideInset).toBeGreaterThan(0.04);
  });
});
