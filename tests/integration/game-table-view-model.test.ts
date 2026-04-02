import { describe, expect, it } from "vitest";
import defaultLayoutText from "../../apps/web/src/layout.xml?raw";
import {
  createNormalActionRail,
  isDebugToggleShortcut
} from "../../apps/web/src/game-table-view-model";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  formatEvent,
  parseNormalTableLayoutConfigText
} from "../../apps/web/src/game-table-views";

describe("milestone 4.5.2 view-model helpers", () => {
  it("toggles debug mode only for ctrl+d", () => {
    expect(
      isDebugToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: "d"
      })
    ).toBe(true);

    expect(
      isDebugToggleShortcut({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: "d"
      })
    ).toBe(false);

    expect(
      isDebugToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false,
        key: "d"
      })
    ).toBe(false);
  });

  it("keeps the grand tichu action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "grand_tichu_window",
        nextEnabled: true,
        grandTichuEnabled: true,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: false
      }).map((slot) => slot.label)
    ).toEqual(["Next", "Grand Tichu", "Pass"]);
  });

  it("keeps the exchange phase action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "pass_select",
        nextEnabled: false,
        grandTichuEnabled: false,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: true,
        pickupEnabled: false,
        playEnabled: false
      }).map((slot) => slot.label)
    ).toEqual(["Tichu", "Pass", "Exchange"]);
  });

  it("keeps the trick-play action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "trick_play",
        nextEnabled: false,
        grandTichuEnabled: false,
        tichuEnabled: true,
        passEnabled: true,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: true
      }).map((slot) => slot.label)
    ).toEqual(["Pass", "Tichu", "Play"]);
  });

  it("describes single-card plays explicitly in the event feed", () => {
    expect(formatEvent({ type: "cards_played", detail: "seat-1:single" })).toBe("East played Single.");
  });

  it("keeps the shipped layout config aligned with the normalized defaults", () => {
    const parsed = parseNormalTableLayoutConfigText(defaultLayoutText);

    expect(parsed?.elements).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT);
    expect(parsed?.tokens).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS);
  });
});
