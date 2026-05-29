import { describe, expect, it } from "vitest";

import { getAltRackLinerConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT rack liner finish", () => {
  it("keeps dedicated slot-liner layers active so the hidden hands read seated into finished trays instead of raw dark wells", () => {
    const config = getAltRackLinerConfig();

    expect(config.linerOpacity).toBeGreaterThan(0.3);
    expect(config.linerEmissiveOpacity).toBeGreaterThan(0.14);
    expect(config.goldEdgeOpacity).toBeGreaterThan(0.2);
    expect(config.northInset).toBeGreaterThan(0.04);
    expect(config.sideInset).toBeGreaterThan(0.03);
  });
});
