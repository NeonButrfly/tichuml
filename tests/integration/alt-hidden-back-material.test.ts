import { describe, expect, it } from "vitest";

import { getAltHiddenCardMaterialConfig } from "../../apps/web/src/alt-table-3d/AltTableCards3D";
import { getAltHiddenBackArtConfig } from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT hidden card back presentation", () => {
  it("keeps the hidden-card back material bright enough for the live camera read", () => {
    const material = getAltHiddenCardMaterialConfig();

    expect(material.backEmissiveIntensity).toBeGreaterThan(1);
    expect(material.backRoughness).toBeLessThan(0.22);
    expect(material.frameColor).toBe("#d6b86f");
  });

  it("keeps the generated back art bold enough to read as a full printed back instead of a flat stripe", () => {
    const art = getAltHiddenBackArtConfig();

    expect(art.outerBorderWidth).toBeGreaterThan(5);
    expect(art.emblemStrokeWidth).toBeGreaterThan(12);
    expect(art.cornerRadius).toBeGreaterThan(9);
    expect(art.guideOpacity).toBeGreaterThan(0.35);
  });
});
