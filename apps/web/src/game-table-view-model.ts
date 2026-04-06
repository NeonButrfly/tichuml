import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RoundPhase } from "@tichuml/engine";

export type UiMode = "normal" | "debug";
export type UiDialogId =
  | "hotkeys"
  | "how_to_play"
  | "random_sources"
  | "score_history";
export type HotkeyContextId = "global" | "table_editor" | "dialogs";
export type UiCommandId =
  | "new_game"
  | "toggle_table_editor"
  | "toggle_debug_mode"
  | "open_score_history_dialog"
  | "open_random_sources_dialog"
  | "open_hotkeys_dialog"
  | "open_how_to_play_dialog"
  | "close_active_overlay";

export type NormalActionSlotId =
  | "next"
  | "grand_tichu"
  | "pass"
  | "tichu"
  | "exchange"
  | "pickup"
  | "play"
  | "new_round";

export type NormalActionSlot = {
  id: NormalActionSlotId;
  label: string;
  enabled: boolean;
  tone: "primary" | "secondary" | "muted";
};

export type NormalActionRailConfig = {
  phase: RoundPhase;
  nextEnabled: boolean;
  nextDealEnabled: boolean;
  grandTichuEnabled: boolean;
  tichuEnabled: boolean;
  passEnabled: boolean;
  exchangeEnabled: boolean;
  pickupEnabled: boolean;
  playEnabled: boolean;
  matchComplete: boolean;
};

export type HotkeyEventLike = Pick<
  KeyboardEvent | ReactKeyboardEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key"
>;

export type HotkeyCombo = {
  key: string | string[];
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type HotkeyDefinition = {
  id: string;
  combo: HotkeyCombo;
  comboLabel: string;
  context: HotkeyContextId;
  actionLabel: string;
  description: string;
  commandId?: UiCommandId;
};

export type GameMenuItemDefinition = {
  id: string;
  label: string;
  description: string;
  commandId: UiCommandId;
};

export const HOTKEY_CONTEXT_LABELS: Record<HotkeyContextId, string> = {
  global: "Global",
  table_editor: "Table Editor",
  dialogs: "Menus & Dialogs"
};

export const HOTKEY_CONTEXT_ORDER: HotkeyContextId[] = [
  "global",
  "table_editor",
  "dialogs"
];

export const GAME_MENU_ITEMS: readonly GameMenuItemDefinition[] = [
  {
    id: "new_game",
    label: "New Game",
    description: "Start a fresh game from the current reset flow.",
    commandId: "new_game"
  },
  {
    id: "table_editor",
    label: "Table Editor",
    description: "Open or close the table editor overlay.",
    commandId: "toggle_table_editor"
  },
  {
    id: "debug_mode",
    label: "Debug Mode",
    description: "Toggle the debug table view on or off.",
    commandId: "toggle_debug_mode"
  },
  {
    id: "hot_keys",
    label: "Hot Keys",
    description: "Show the current keyboard shortcuts.",
    commandId: "open_hotkeys_dialog"
  },
  {
    id: "random_sources",
    label: "Random Sources",
    description: "Inspect the most recent entropy collection and derived seeds.",
    commandId: "open_random_sources_dialog"
  },
  {
    id: "how_to_play_tichu",
    label: "How To Play Tichu",
    description: "Open a quick guide for new players.",
    commandId: "open_how_to_play_dialog"
  }
];

export const UI_HOTKEYS: readonly HotkeyDefinition[] = [
  {
    id: "toggle_table_editor",
    combo: { key: "e", ctrl: true },
    comboLabel: "Ctrl+E",
    context: "global",
    actionLabel: "Table Editor",
    description: "Open or close the table editor overlay.",
    commandId: "toggle_table_editor"
  },
  {
    id: "toggle_debug_mode",
    combo: { key: "d", ctrl: true },
    comboLabel: "Ctrl+D",
    context: "global",
    actionLabel: "Debug Mode",
    description: "Switch between the gameplay table and debug mode.",
    commandId: "toggle_debug_mode"
  },
  {
    id: "export_layout_json",
    combo: { key: "s", ctrl: true },
    comboLabel: "Ctrl+S",
    context: "table_editor",
    actionLabel: "Export Layout JSON",
    description: "Download the current table layout as JSON."
  },
  {
    id: "toggle_layout_guides",
    combo: { key: "g", ctrl: true },
    comboLabel: "Ctrl+G",
    context: "table_editor",
    actionLabel: "Toggle Guides",
    description: "Show or hide the table-alignment guides."
  },
  {
    id: "toggle_layout_inspector",
    combo: { key: "d", ctrl: true },
    comboLabel: "Ctrl+D",
    context: "table_editor",
    actionLabel: "Toggle Inspector",
    description: "Show or hide the layout inspector panel."
  },
  {
    id: "next_layout_element",
    combo: { key: "Tab" },
    comboLabel: "Tab",
    context: "table_editor",
    actionLabel: "Next Element",
    description: "Select the next editable layout element."
  },
  {
    id: "previous_layout_element",
    combo: { key: "Tab", shift: true },
    comboLabel: "Shift+Tab",
    context: "table_editor",
    actionLabel: "Previous Element",
    description: "Select the previous editable layout element."
  },
  {
    id: "nudge_layout_element",
    combo: {
      key: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
    },
    comboLabel: "Arrow Keys",
    context: "table_editor",
    actionLabel: "Nudge Element",
    description: "Move the selected layout element by 10 pixels."
  },
  {
    id: "nudge_layout_element_fast",
    combo: {
      key: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
      shift: true
    },
    comboLabel: "Shift+Arrow Keys",
    context: "table_editor",
    actionLabel: "Nudge Element Faster",
    description: "Move the selected layout element by 50 pixels."
  },
  {
    id: "rotate_layout_element_ccw",
    combo: { key: "[" },
    comboLabel: "[",
    context: "table_editor",
    actionLabel: "Rotate -15°",
    description: "Rotate the selected layout element counter-clockwise."
  },
  {
    id: "rotate_layout_element_cw",
    combo: { key: "]" },
    comboLabel: "]",
    context: "table_editor",
    actionLabel: "Rotate +15°",
    description: "Rotate the selected layout element clockwise."
  },
  {
    id: "close_active_overlay",
    combo: { key: "Escape" },
    comboLabel: "Escape",
    context: "dialogs",
    actionLabel: "Close Menu / Dialog",
    description: "Close the open menu or modal dialog.",
    commandId: "close_active_overlay"
  }
];

function normalizeHotkeyKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function matchesHotkey(
  event: HotkeyEventLike,
  combo: HotkeyCombo
): boolean {
  const expectedKeys = Array.isArray(combo.key) ? combo.key : [combo.key];

  return (
    Boolean(combo.ctrl) === event.ctrlKey &&
    Boolean(combo.meta) === event.metaKey &&
    Boolean(combo.alt) === event.altKey &&
    Boolean(combo.shift) === event.shiftKey &&
    expectedKeys.some(
      (key) => normalizeHotkeyKey(key) === normalizeHotkeyKey(event.key)
    )
  );
}

export function findMatchingHotkey(
  event: HotkeyEventLike,
  contexts: readonly HotkeyContextId[],
  hotkeys: readonly HotkeyDefinition[] = UI_HOTKEYS
): HotkeyDefinition | null {
  return (
    hotkeys.find(
      (hotkey) =>
        contexts.includes(hotkey.context) && matchesHotkey(event, hotkey.combo)
    ) ?? null
  );
}

export function getHotkeysForContext(
  context: HotkeyContextId,
  hotkeys: readonly HotkeyDefinition[] = UI_HOTKEYS
): HotkeyDefinition[] {
  return hotkeys.filter((hotkey) => hotkey.context === context);
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function isDebugToggleShortcut(event: HotkeyEventLike): boolean {
  const debugHotkey = UI_HOTKEYS.find((hotkey) => hotkey.id === "toggle_debug_mode");
  return debugHotkey ? matchesHotkey(event, debugHotkey.combo) : false;
}

export function createNormalActionRail(
  config: NormalActionRailConfig
): NormalActionSlot[] {
  switch (config.phase) {
    case "grand_tichu_window":
      return [
        {
          id: "next",
          label: "Next",
          enabled: config.nextEnabled,
          tone: "secondary"
        },
        {
          id: "grand_tichu",
          label: "Grand Tichu",
          enabled: config.grandTichuEnabled,
          tone: "primary"
        },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" }
      ];
    case "pass_select":
      return [
        {
          id: "tichu",
          label: "Tichu",
          enabled: config.tichuEnabled,
          tone: "secondary"
        },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" },
        {
          id: "exchange",
          label: "Exchange",
          enabled: config.exchangeEnabled,
          tone: "primary"
        }
      ];
    case "pass_reveal":
    case "exchange_complete":
      return [
        {
          id: "tichu",
          label: "Tichu",
          enabled: config.tichuEnabled,
          tone: config.tichuEnabled ? "secondary" : "muted"
        },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" },
        {
          id: "pickup",
          label: "Pickup",
          enabled: config.pickupEnabled,
          tone: "primary"
        }
      ];
    case "trick_play":
      return [
        {
          id: "pass",
          label: "Pass",
          enabled: config.passEnabled,
          tone: "secondary"
        },
        {
          id: "tichu",
          label: "Tichu",
          enabled: config.tichuEnabled,
          tone: "secondary"
        },
        {
          id: "play",
          label: "Play",
          enabled: config.playEnabled,
          tone: "primary"
        }
      ];
    case "round_scoring":
    case "finished":
      if (config.matchComplete) {
        return [];
      }

      return [
        {
          id: "new_round",
          label: "Next Deal",
          enabled: config.nextDealEnabled,
          tone: "primary"
        }
      ];
    default:
      return [];
  }
}
