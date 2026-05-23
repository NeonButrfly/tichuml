import { describe, expect, it } from "vitest";
import { resolveAlternateSouthHandLayout } from "../../apps/web/src/alternate-table/hand-layout";

describe("alternate south hand layout", () => {
  it("centers the hand fan on the tray axis", () => {
    const layout = resolveAlternateSouthHandLayout({
      count: 5,
      rackWidth: 900,
      viewportWidth: 1440
    });

    expect(layout.placements[0]?.offsetPx).toBe(-layout.placements[4]!.offsetPx);
    expect(layout.placements[1]?.offsetPx).toBe(-layout.placements[3]!.offsetPx);
    expect(layout.placements[2]?.offsetPx).toBe(0);
  });

  it("compresses spacing on tighter trays instead of using a fixed offset", () => {
    const wide = resolveAlternateSouthHandLayout({
      count: 14,
      rackWidth: 980,
      viewportWidth: 1440
    });
    const tight = resolveAlternateSouthHandLayout({
      count: 14,
      rackWidth: 620,
      viewportWidth: 1440
    });

    const wideStep = wide.placements[7]!.offsetPx - wide.placements[6]!.offsetPx;
    const tightStep = tight.placements[7]!.offsetPx - tight.placements[6]!.offsetPx;

    expect(tightStep).toBeLessThan(wideStep);
  });
});
