import { describe, expect, it } from "vitest";
import defaultLayoutText from "../../apps/web/src/layout.json?raw";
import {
  createNormalActionRail,
  findMatchingHotkey,
  GAME_MENU_ITEMS,
  getHotkeysForContext,
  isDebugToggleShortcut
} from "../../apps/web/src/game-table-view-model";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  formatEvent,
  parseNormalTableLayoutConfigText,
  serializeNormalTableLayoutConfig
} from "../../apps/web/src/game-table-views";

describe("game-table view-model helpers", () => {
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

  it("keeps the documented menu contract fixed", () => {
    expect(GAME_MENU_ITEMS.map((item) => item.label)).toEqual([
      "New Game",
      "Table Editor",
      "Debug Mode",
      "Backend Settings",
      "Hot Keys",
      "Random Sources",
      "How To Play Tichu"
    ]);
  });

  it("matches hotkeys by context from the centralized registry", () => {
    expect(
      findMatchingHotkey(
        {
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          key: "e"
        },
        ["global"]
      )?.commandId
    ).toBe("toggle_table_editor");

    expect(
      findMatchingHotkey(
        {
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          key: "d"
        },
        ["table_editor"]
      )?.id
    ).toBe("toggle_layout_inspector");

    expect(getHotkeysForContext("dialogs").map((hotkey) => hotkey.comboLabel)).toEqual([
      "Escape"
    ]);
  });

  it("keeps the grand tichu action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "grand_tichu_window",
        nextEnabled: true,
        nextDealEnabled: false,
        grandTichuEnabled: true,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: false,
        matchComplete: false
      }).map((slot) => slot.label)
    ).toEqual(["Next", "Grand Tichu", "Pass"]);
  });

  it("keeps the exchange phase action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "pass_select",
        nextEnabled: false,
        nextDealEnabled: false,
        grandTichuEnabled: false,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: true,
        pickupEnabled: false,
        playEnabled: false,
        matchComplete: false
      }).map((slot) => slot.label)
    ).toEqual(["Tichu", "Pass", "Exchange"]);
  });

  it("keeps the trick-play action strip in screenshot order", () => {
    expect(
      createNormalActionRail({
        phase: "trick_play",
        nextEnabled: false,
        nextDealEnabled: false,
        grandTichuEnabled: false,
        tichuEnabled: true,
        passEnabled: true,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: true,
        matchComplete: false
      }).map((slot) => slot.label)
    ).toEqual(["Pass", "Tichu", "Play"]);
  });

  it("keeps Tichu live in the pickup rail when the seat has not played yet", () => {
    const slots = createNormalActionRail({
      phase: "exchange_complete",
      nextEnabled: false,
      nextDealEnabled: false,
      grandTichuEnabled: false,
      tichuEnabled: true,
      passEnabled: false,
      exchangeEnabled: false,
      pickupEnabled: true,
      playEnabled: false,
      matchComplete: false
    });

    expect(slots.map((slot) => slot.label)).toEqual([
      "Tichu",
      "Pass",
      "Pickup"
    ]);
    expect(slots[0]).toEqual({
      id: "tichu",
      label: "Tichu",
      enabled: true,
      tone: "secondary"
    });
  });

  it("shows Next Deal only while the match is still live", () => {
    expect(
      createNormalActionRail({
        phase: "finished",
        nextEnabled: false,
        nextDealEnabled: true,
        grandTichuEnabled: false,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: false,
        matchComplete: false
      }).map((slot) => slot.label)
    ).toEqual(["Next Deal"]);

    expect(
      createNormalActionRail({
        phase: "finished",
        nextEnabled: false,
        nextDealEnabled: false,
        grandTichuEnabled: false,
        tichuEnabled: false,
        passEnabled: false,
        exchangeEnabled: false,
        pickupEnabled: false,
        playEnabled: false,
        matchComplete: true
      })
    ).toEqual([]);
  });

  it("describes single-card plays explicitly in the event feed", () => {
    expect(formatEvent({ type: "cards_played", detail: "seat-1:single" })).toBe(
      "East played Single."
    );
  });

  it("describes match completion events explicitly", () => {
    expect(formatEvent({ type: "match_completed", detail: "team-0" })).toBe(
      "NS won the match."
    );
  });

  it("keeps the shipped layout config aligned with the normalized defaults", () => {
    const parsed = parseNormalTableLayoutConfigText(defaultLayoutText);

    expect(parsed?.elements).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT);
    expect(parsed?.tokens).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS);
  });

  it("round-trips the canonical layout config without schema drift", () => {
    const serialized = serializeNormalTableLayoutConfig(
      DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG
    );
    const parsed = parseNormalTableLayoutConfigText(serialized);

    expect(parsed).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG);
    expect(JSON.parse(serialized)).toEqual(DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG);
  });
});
