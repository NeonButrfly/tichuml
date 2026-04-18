import {
  getCanonicalCardIdsKey,
  type Card,
  type EngineAction,
  type LegalAction
} from "@tichuml/engine";
import type { PassLegalAction, PlayLegalAction, PolicyTag } from "./types.js";

export function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
}

export function isPassLegalAction(action: LegalAction): action is PassLegalAction {
  return action.type === "pass_turn";
}

export function isStandardCard(card: Card): card is Extract<Card, { kind: "standard" }> {
  return card.kind === "standard";
}

export function cardStrength(card: Card): number {
  if (card.kind === "standard") {
    return card.rank + (card.rank >= 12 ? 4 : 0);
  }

  switch (card.id) {
    case "dog":
      return 1;
    case "mahjong":
      return 6;
    case "phoenix":
      return 18;
    case "dragon":
      return 20;
  }
}

export function isPointCard(card: Card): boolean {
  if (card.kind === "special") {
    return card.special === "dragon";
  }

  return card.rank === 5 || card.rank === 10 || card.rank === 13;
}

export function appendUniqueTags(target: PolicyTag[], ...tags: PolicyTag[]): void {
  for (const tag of tags) {
    if (!target.includes(tag)) {
      target.push(tag);
    }
  }
}

export function getConcreteActionSortKey(action: EngineAction): string {
  switch (action.type) {
    case "play_cards":
      return [
        action.type,
        action.seat,
        getCanonicalCardIdsKey(action.cardIds),
        action.phoenixAsRank ?? "",
        action.wishRank ?? ""
      ].join("|");
    case "select_pass":
      return [
        action.type,
        action.seat,
        action.left,
        action.partner,
        action.right
      ].join("|");
    case "assign_dragon_trick":
      return [action.type, action.seat, action.recipient].join("|");
    case "advance_phase":
      return [action.type, action.actor].join("|");
    default:
      return [action.type, "seat" in action ? action.seat : ""].join("|");
  }
}
