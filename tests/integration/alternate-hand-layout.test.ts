import { describe, expect, it } from "vitest";
import { resolveAlternateSouthHandLayout } from "../../apps/web/src/alternate-table/hand-layout";

describe("alternate south hand layout", () => {
  it("centers the hand fan on the tray axis", () => {
    const layout = resolveAlternateSouthHandLayout({
      count: 5,
      rackWidth: 900,
      baseCardWidth: 102
    });

    expect(layout.placements[0]?.offsetPx).toBe(-layout.placements[4]!.offsetPx);
    expect(layout.placements[1]?.offsetPx).toBe(-layout.placements[3]!.offsetPx);
    expect(layout.placements[2]?.offsetPx).toBe(0);
  });

  it("compresses spacing on tighter trays instead of using a fixed offset", () => {
    const wide = resolveAlternateSouthHandLayout({
      count: 14,
      rackWidth: 980,
      baseCardWidth: 102
    });
    const tight = resolveAlternateSouthHandLayout({
      count: 14,
      rackWidth: 620,
      baseCardWidth: 102
    });

    const wideStep = wide.placements[7]!.offsetPx - wide.placements[6]!.offsetPx;
    const tightStep = tight.placements[7]!.offsetPx - tight.placements[6]!.offsetPx;

    expect(tightStep).toBeLessThan(wideStep);
  });

  it("keeps the edge cards lower than the center for a cleaner seated fan", () => {
    const layout = resolveAlternateSouthHandLayout({
      count: 9,
      rackWidth: 860,
      baseCardWidth: 102
    });

    expect(layout.placements[4]?.liftPx).toBeLessThan(layout.placements[0]!.liftPx);
    expect(layout.placements[4]?.liftPx).toBeLessThan(layout.placements[8]!.liftPx);
  });
});
