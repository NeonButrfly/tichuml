import { describe, expect, it } from "vitest";

import { getAltRackInteriorFinishConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT rack interior finish", () => {
  it("keeps dedicated inner back-wall finish layers active so the hidden hands read seated in finished tray interiors", () => {
    const config = getAltRackInteriorFinishConfig();

    expect(config.backPanelOpacity).toBeGreaterThan(0.2);
    expect(config.backPanelGlowOpacity).toBeGreaterThan(0.1);
    expect(config.sideWallEdgeOpacity).toBeGreaterThan(0.18);
  });
});
