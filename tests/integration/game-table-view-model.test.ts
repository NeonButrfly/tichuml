import { describe, expect, it } from "vitest";
import {
  createNormalActionRail,
  isDebugToggleShortcut
} from "../../apps/web/src/game-table-view-model";

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
});
