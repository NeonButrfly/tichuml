import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RoundPhase } from "@tichuml/engine";

export type UiMode = "normal" | "debug";

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
  grandTichuEnabled: boolean;
  tichuEnabled: boolean;
  passEnabled: boolean;
  exchangeEnabled: boolean;
  pickupEnabled: boolean;
  playEnabled: boolean;
};

type DebugToggleEventLike = Pick<
  KeyboardEvent | ReactKeyboardEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key"
>;

export function isDebugToggleShortcut(event: DebugToggleEventLike): boolean {
  return (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "d"
  );
}

export function createNormalActionRail(config: NormalActionRailConfig): NormalActionSlot[] {
  switch (config.phase) {
    case "grand_tichu_window":
      return [
        { id: "next", label: "Next", enabled: config.nextEnabled, tone: "secondary" },
        { id: "grand_tichu", label: "Grand Tichu", enabled: config.grandTichuEnabled, tone: "primary" },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" }
      ];
    case "pass_select":
      return [
        { id: "tichu", label: "Tichu", enabled: config.tichuEnabled, tone: "secondary" },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" },
        { id: "exchange", label: "Exchange", enabled: config.exchangeEnabled, tone: "primary" }
      ];
    case "pass_reveal":
    case "exchange_complete":
      return [
        { id: "tichu", label: "Tichu", enabled: false, tone: "muted" },
        { id: "pass", label: "Pass", enabled: false, tone: "muted" },
        { id: "pickup", label: "Pickup", enabled: config.pickupEnabled, tone: "primary" }
      ];
    case "trick_play":
      return [
        { id: "pass", label: "Pass", enabled: config.passEnabled, tone: "secondary" },
        { id: "tichu", label: "Tichu", enabled: config.tichuEnabled, tone: "secondary" },
        { id: "play", label: "Play", enabled: config.playEnabled, tone: "primary" }
      ];
    case "round_scoring":
    case "finished":
      return [{ id: "new_round", label: "New Round", enabled: true, tone: "primary" }];
    default:
      return [];
  }
}
