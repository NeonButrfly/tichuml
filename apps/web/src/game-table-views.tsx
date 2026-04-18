/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import type { ChosenDecision } from "@tichuml/ai-heuristics";
import {
  cardsFromIds,
  getCanonicalCardIdsKey,
  getCardsPoints,
  SYSTEM_ACTOR,
  type ActorId,
  type Card,
  type EngineAction,
  type EngineEvent,
  type EngineResult,
  type MatchHandHistoryEntry,
  type LegalAction,
  type SeatId,
  type StandardRank,
  type TeamId,
  type TrickEntry
} from "@tichuml/engine";
import type {
  HotkeyDefinition,
  NormalActionSlot,
  NormalActionSlotId,
  UiCommandId,
  UiDialogId,
  UiMode
} from "./game-table-view-model";
import type {
  SeedDebugSnapshot,
  SeedJsonValue,
  BackendRuntimeSettings
} from "@tichuml/shared";
import type { BackendReachability } from "./backend/settings";
import {
  findMatchingHotkey,
  GAME_MENU_ITEMS,
  getHotkeysForContext,
  HOTKEY_CONTEXT_LABELS,
  HOTKEY_CONTEXT_ORDER
} from "./game-table-view-model";
import {
  getExchangeFlowState,
  isExchangePhase,
  type HandSortMode,
  type PassTarget,
  type PlayLegalAction
} from "./table-model";
export type {
  AnchorPoint,
  NormalHandBounds,
  NormalLayoutElement,
  NormalLayoutElementId,
  NormalPassLaneGeometry,
  NormalPassLaneSpec,
  NormalSeatAnchorGeometry,
  NormalSeatAnchorId,
  NormalTableLayout,
  NormalTableLayoutConfig,
  NormalTableSpacing,
  NormalTableLayoutTokens,
  NormalTrickFanMetrics,
  NormalViewportLayoutMetrics,
  PassLaneDirection,
  SeatVisualPosition
} from "./table-layout";
export {
  anchorStyle,
  CARD_ASPECT,
  computeNormalViewportLayoutMetrics,
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  DEFAULT_NORMAL_TABLE_SURFACE,
  getBoardBounds,
  getNormalPassLaneLayoutId,
  getNormalSeatLayout,
  getNormalTableSpacing,
  getNormalTrickFanMetrics,
  NORMAL_BOARD_INSET,
  NORMAL_HAND_LAYOUT_IDS,
  NORMAL_LABEL_LAYOUT_IDS,
  NORMAL_LAYOUT_EDITOR_ORDER,
  NORMAL_LAYOUT_ELEMENT_SPECS,
  NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS,
  NORMAL_PASS_LANE_LAYOUT_IDS,
  NORMAL_PASS_LANE_SCALE,
  NORMAL_PASS_STAGE_MAP,
  NORMAL_STAGE_LAYOUT_IDS,
  requiredFanSpan,
  resolveNormalActionRowRegionStyle,
  resolveNormalBoardAnchorPoint,
  resolveNormalBoardAnchorStyle,
  resolveNormalPassLaneGeometry,
  resolveNormalPlaySurfaceRegionStyle,
  resolveNormalSeatAnchorGeometry,
  resolveNormalSeatRegionStyle,
  resolveNormalStageAnchorStyle
} from "./table-layout";
import {
  CARD_ASPECT,
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  DEFAULT_NORMAL_TABLE_SURFACE,
  computeNormalViewportLayoutMetrics,
  getBoardBounds,
  getNormalSeatLayout,
  getNormalTableSpacing,
  getNormalTrickFanMetrics,
  NORMAL_HAND_LAYOUT_IDS,
  NORMAL_LAYOUT_EDITOR_ORDER,
  NORMAL_LAYOUT_ELEMENT_SPECS,
  NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS,
  NORMAL_PASS_LANE_LAYOUT_IDS,
  NORMAL_PASS_STAGE_MAP,
  NORMAL_STAGE_LAYOUT_IDS,
  requiredFanSpan,
  resolveNormalActionRowRegionStyle,
  resolveNormalBoardAnchorPoint,
  resolveNormalBoardAnchorStyle,
  resolveNormalPassLaneGeometry,
  resolveNormalPlaySurfaceRegionStyle,
  resolveNormalSeatAnchorGeometry,
  resolveNormalSeatRegionStyle,
  type AnchorPoint,
  type NormalLayoutElement,
  type NormalLayoutElementId,
  type NormalTableLayout,
  type NormalTableLayoutConfig,
  type NormalTableLayoutTokens,
  type NormalTrickFanMetrics,
  type NormalViewportLayoutMetrics,
  type PassLaneDirection,
  type SeatVisualPosition
} from "./table-layout";

export type SeatView = {
  seat: SeatId;
  position: SeatVisualPosition;
  title: string;
  relation: string;
  handCount: number;
  cards: Card[];
  callState: {
    grandTichu: boolean;
    smallTichu: boolean;
    hasPlayedFirstCard: boolean;
  };
  passReady: boolean;
  finishIndex: number;
  isLocalSeat: boolean;
  isPrimarySeat: boolean;
  isThinkingSeat: boolean;
};

export type SeatPlayView = {
  seat: SeatId;
  position: SeatVisualPosition;
  label: string;
  plays: Array<Extract<TrickEntry, { type: "play" }>>;
};

export type DogLeadAnimationView = {
  sourceSeat: SeatId;
  targetSeat: SeatId;
};

export type PassLaneView = {
  target: PassTarget;
  targetSeat: SeatId;
  assignedCardId: string | null;
};

export type PassSurfaceView = {
  seat: SeatId;
  position: SeatVisualPosition;
  label: string;
  cardIds: string[];
};

export type PassRouteView = {
  key: string;
  sourceSeat: SeatId;
  sourcePosition: SeatVisualPosition;
  target: PassTarget;
  targetSeat: SeatId;
  displayMode: "passing" | "pickup";
  occupied: boolean;
  visibleCardId: string | null;
  faceDown: boolean;
  interactive: boolean;
};

export type GameTableViewProps = {
  roundSeed: string;
  decisionCount: number;
  state: EngineResult["nextState"];
  derived: EngineResult["derivedView"];
  controlHint: string;
  seatViews: SeatView[];
  seatRelativePlays: SeatPlayView[];
  displayedTrick: EngineResult["derivedView"]["currentTrick"] | null;
  trickIsResolving: boolean;
  pickupStageViews: PassSurfaceView[];
  dogLeadAnimation: DogLeadAnimationView | null;
  tablePassGroups: PassSurfaceView[];
  passRouteViews: PassRouteView[];
  passLaneViews: PassLaneView[];
  sortedLocalHand: Card[];
  localCanInteract: boolean;
  localPassInteractionEnabled: boolean;
  localLegalCardIds: Set<string>;
  selectedCardIds: string[];
  selectedPassTarget: PassTarget;
  passSelectionReady: boolean;
  matchingPlayActions: PlayLegalAction[];
  activePlayVariant: PlayLegalAction | null;
  resolvedWishRank: WishSelectionValue;
  wishDialogOpen: boolean;
  wishSelectionOptions: WishSelectionValue[];
  wishConfirmDisabled: boolean;
  wishSubmissionPending: boolean;
  normalActionRail: NormalActionSlot[];
  sortMode: HandSortMode;
  autoplayLocal: boolean;
  lastAiDecision: ChosenDecision | null;
  recentEvents: string[];
  localActionSummary: string[];
  localSummaryText: string;
  canContinueAi: boolean;
  localDragonRecipients: SeatId[];
  uiMode: UiMode;
  normalTableLayout: NormalTableLayout;
  normalTableLayoutTokens: NormalTableLayoutTokens;
  layoutEditorActive: boolean;
  mainMenuOpen: boolean;
  activeDialog: UiDialogId | null;
  latestEntropyDebug: SeedDebugSnapshot | null;
  backendSettings: BackendRuntimeSettings;
  backendStatus: BackendReachability;
  hotkeyDefinitions: readonly HotkeyDefinition[];
  cardLookup: ReadonlyMap<string, Card>;
  onAutoplayChange: (checked: boolean) => void;
  onContinueAi: () => void;
  onSortModeChange: (mode: HandSortMode) => void;
  onLocalCardClick: (cardId: string) => void;
  onPassTargetSelect: (target: PassTarget) => void;
  onPassLaneDrop: (target: PassTarget, cardId: string) => void;
  onPassLaneCardClick: (target: PassTarget) => void;
  onPassLaneCardDragStart: (target: PassTarget, cardId: string) => void;
  onPassLaneCardDragEnd: (target: PassTarget, cardId: string) => void;
  onVariantSelect: (key: string) => void;
  onWishRankSelect: (rank: WishSelectionValue) => void;
  onWishConfirm: () => void;
  onWishCancel: () => void;
  onDragonRecipientSelect: (recipient: SeatId) => void;
  onNormalAction: (slotId: NormalActionSlotId) => void;
  onNormalTableLayoutChange: (nextLayout: NormalTableLayout) => void;
  onNormalTableLayoutImport: (nextConfig: NormalTableLayoutConfig) => void;
  onExportNormalTableLayout: () => void;
  onBackendSettingsChange: (nextSettings: BackendRuntimeSettings) => void;
  onTestBackend: () => void;
  onUiCommand: (commandId: UiCommandId) => void;
  onMainMenuOpenChange: (open: boolean) => void;
};

export type WishSelectionValue = StandardRank | null;

export const MAHJONG_WISH_RANKS: StandardRank[] = [
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14
];

export function formatRank(rank: number): string {
  switch (rank) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    default:
      return String(rank);
  }
}

export function formatSuitName(
  card: Extract<Card, { kind: "standard" }>
): string {
  switch (card.suit) {
    case "jade":
      return "Jade";
    case "sword":
      return "Sword";
    case "pagoda":
      return "Pagoda";
    case "star":
      return "Star";
  }
}

type StandardSuit = Extract<Card, { kind: "standard" }>["suit"];
type SpecialCardName = Extract<Card, { kind: "special" }>["special"];

const SPECIAL_CARD_NAMES: Record<SpecialCardName, string> = {
  dragon: "Dragon",
  phoenix: "Phoenix",
  dog: "Dog",
  mahjong: "Mahjong"
};

const SPECIAL_CARD_CORNER_LABELS: Record<SpecialCardName, string> = {
  dragon: "DRG",
  phoenix: "PHX",
  dog: "DOG",
  mahjong: "1"
};

const SPECIAL_CARD_SUBTITLES: Record<SpecialCardName, string> = {
  dragon: "Imperial",
  phoenix: "Luminous",
  dog: "Guardian",
  mahjong: "Ancient Tile"
};

export function formatSeatShort(seat: SeatId): string {
  switch (seat) {
    case "seat-0":
      return "South";
    case "seat-1":
      return "East";
    case "seat-2":
      return "North";
    case "seat-3":
      return "West";
  }
}

function formatTeamShort(team: TeamId): string {
  return team === "team-0" ? "NS" : "EW";
}

function getTichuMarkerLabel(callState: SeatView["callState"]): "GT" | "T" | null {
  if (callState.grandTichu) {
    return "GT";
  }

  if (callState.smallTichu) {
    return "T";
  }

  return null;
}

type ScoreMarker = {
  key: string;
  label: "T" | "GT" | "DO";
  tone: "accent" | "alert" | "success";
  detail: string;
};

function getTeamScoreMarkers(
  handHistory: MatchHandHistoryEntry | null,
  team: TeamId
): ScoreMarker[] {
  if (!handHistory) {
    return [];
  }

  const markers = handHistory.tichuBonuses
    .filter((bonus) => bonus.team === team)
    .map<ScoreMarker>((bonus) => ({
      key: `${bonus.seat}-${bonus.label}-${bonus.amount}`,
      label: bonus.label === "grand" ? "GT" : "T",
      tone: bonus.label === "grand" ? "alert" : "accent",
      detail: `${formatSeatShort(bonus.seat)} ${bonus.label === "grand" ? "Grand Tichu" : "Tichu"} ${bonus.amount > 0 ? `+${bonus.amount}` : String(bonus.amount)}`
    }));

  if (handHistory.doubleVictory === team) {
    markers.push({
      key: `${team}-double-victory`,
      label: "DO",
      tone: "success",
      detail: `${formatTeamShort(team)} double-out`
    });
  }

  return markers;
}

function formatPassDirectionLabel(direction: PassLaneDirection): string {
  switch (direction) {
    case "up":
      return "up";
    case "right":
      return "right";
    case "down":
      return "down";
    case "left":
      return "left";
  }
}

export function formatActorLabel(actor: ActorId): string {
  return actor === SYSTEM_ACTOR ? "System" : formatSeatShort(actor);
}

export function formatCombinationKind(kind: string): string {
  switch (kind) {
    case "pair-sequence":
      return "Pair Sequence";
    case "full-house":
      return "Full House";
    case "bomb-four-kind":
      return "Four of a Kind Bomb";
    case "bomb-straight":
      return "Straight Bomb";
    default:
      return kind
        .split("-")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");
  }
}

export function formatPlacement(index: number): string {
  switch (index) {
    case 0:
      return "1st out";
    case 1:
      return "2nd out";
    case 2:
      return "3rd out";
    case 3:
      return "4th out";
    default:
      return `${index + 1}th out`;
  }
}

function parseCardsPlayedEventDetail(
  detail?: string
): { seat: SeatId; kind: string } | null {
  if (!detail) {
    return null;
  }

  const [seatToken, kind] = detail.split(":");

  if (!seatToken || !kind || !seatToken.startsWith("seat-")) {
    return null;
  }

  return { seat: seatToken as SeatId, kind };
}

export function formatEvent(event: EngineEvent): string {
  switch (event.type) {
    case "shuffle_completed":
      return "Deck shuffled from deterministic seed.";
    case "deal8_completed":
      return "Opening eight cards dealt to every seat.";
    case "grand_tichu_called":
      return `${formatSeatShort(event.detail as SeatId)} called Grand Tichu.`;
    case "grand_tichu_declined":
      return `${formatSeatShort(event.detail as SeatId)} passed on Grand Tichu.`;
    case "complete_deal":
      return "Final six cards dealt to every seat.";
    case "pass_selected":
      return `${formatSeatShort(event.detail as SeatId)} locked in a pass lane.`;
    case "passes_revealed":
      return "Pass selections revealed across the table.";
    case "exchange_completed":
      return "Exchange complete. Trick play is live.";
    case "cards_played": {
      const playDetail = parseCardsPlayedEventDetail(event.detail);
      return playDetail
        ? `${formatSeatShort(playDetail.seat)} played ${formatCombinationKind(playDetail.kind)}.`
        : "A seat played cards.";
    }
    case "seat_passed":
      return `${formatSeatShort(event.detail as SeatId)} passed.`;
    case "dog_led":
      return `${formatSeatShort(event.detail as SeatId)} led Dog to partner.`;
    case "dragon_gift_pending":
      return `${formatSeatShort(event.detail as SeatId)} must assign the Dragon trick.`;
    case "tichu_called":
      return `${formatSeatShort(event.detail as SeatId)} called Tichu.`;
    case "trick_resolved":
      return "The trick resolved and control moved to the winner.";
    case "round_scored":
      return "Round scoring completed.";
    case "match_completed":
      return event.detail === "team-0"
        ? "NS won the match."
        : event.detail === "team-1"
          ? "EW won the match."
          : "The match completed at the score threshold.";
    case "phase_changed":
      return `Phase changed to ${event.detail}.`;
    default:
      return event.detail ? `${event.type}: ${event.detail}` : event.type;
  }
}

export function describeAction(action: EngineAction | LegalAction): string {
  switch (action.type) {
    case "call_grand_tichu":
      return "Grand Tichu";
    case "decline_grand_tichu":
      return "Continue";
    case "call_tichu":
      return "Tichu";
    case "select_pass":
      return "Confirm Pass";
    case "advance_phase":
      return "Advance Phase";
    case "pass_turn":
      return "Pass";
    case "assign_dragon_trick":
      return `Gift Dragon to ${formatSeatShort(action.recipient)}`;
    case "play_cards":
      if ("combination" in action) {
        const combinationAction = action as Extract<
          LegalAction,
          { type: "play_cards" }
        >;
        return `${formatCombinationKind(combinationAction.combination.kind)} (${action.cardIds.length})`;
      }
      return `Play ${action.cardIds.join(", ")}`;
    default:
      return "Unknown action";
  }
}

function buildPlayVariantKey(action: PlayLegalAction): string {
  return [
    getCanonicalCardIdsKey(action.cardIds),
    String(action.phoenixAsRank ?? "none"),
    action.combination.kind,
    String(action.combination.primaryRank)
  ].join("|");
}

function getCardClassName(card: Card): string {
  if (card.kind === "special") {
    return `playing-card--special playing-card--${card.special}`;
  }

  return `playing-card--${card.suit}`;
}

function handCardFromId(cardId: string): Card {
  if (
    cardId === "mahjong" ||
    cardId === "dog" ||
    cardId === "phoenix" ||
    cardId === "dragon"
  ) {
    return {
      id: cardId,
      kind: "special",
      special: cardId
    };
  }

  const [suit, rank] = cardId.split("-");

  return {
    id: cardId,
    kind: "standard",
    suit: suit as Extract<Card, { kind: "standard" }>["suit"],
    rank: Number(rank) as StandardRank
  };
}

function resolveCard(
  cardId: string,
  cardLookup: ReadonlyMap<string, Card>
): Card {
  return cardLookup.get(cardId) ?? handCardFromId(cardId);
}

function formatPassTarget(target: PassTarget): string {
  switch (target) {
    case "left":
      return "Left";
    case "partner":
      return "Partner";
    case "right":
      return "Right";
  }
}

function formatPolicyTag(tag: string): string {
  return tag
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

type NormalStageLaneAnchor = {
  targetPosition: SeatVisualPosition;
  laneStyle: CSSProperties;
  slotStyle: CSSProperties;
  orientation: "upright" | "east" | "west";
};

type NormalStageRegionAnchor = {
  regionStyle: CSSProperties;
  lanes: NormalStageLaneAnchor[];
};

export const NORMAL_STAGE_ANCHORS: Record<
  SeatVisualPosition,
  NormalStageRegionAnchor
> = {
  top: {
    regionStyle: {
      width: "260px",
      height: "112px"
    },
    lanes: [
      {
        targetPosition: "right",
        laneStyle: { left: "0px", top: "22px", width: "60px", height: "84px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      },
      {
        targetPosition: "bottom",
        laneStyle: { left: "100px", top: "0px", width: "60px", height: "84px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      },
      {
        targetPosition: "left",
        laneStyle: {
          left: "200px",
          top: "22px",
          width: "60px",
          height: "84px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      }
    ]
  },
  right: {
    regionStyle: {
      width: "96px",
      height: "260px"
    },
    lanes: [
      {
        targetPosition: "top",
        laneStyle: {
          left: "6px",
          bottom: "136px",
          width: "84px",
          height: "124px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "east"
      },
      {
        targetPosition: "left",
        laneStyle: {
          left: "6px",
          bottom: "136px",
          width: "84px",
          height: "62px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "east"
      },
      {
        targetPosition: "bottom",
        laneStyle: {
          left: "6px",
          bottom: "0px",
          width: "84px",
          height: "62px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "east"
      }
    ]
  },
  bottom: {
    regionStyle: {
      width: "260px",
      height: "112px"
    },
    lanes: [
      {
        targetPosition: "left",
        laneStyle: { left: "0px", top: "28px", width: "60px", height: "84px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      },
      {
        targetPosition: "top",
        laneStyle: { left: "100px", top: "0px", width: "60px", height: "84px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      },
      {
        targetPosition: "right",
        laneStyle: {
          left: "200px",
          top: "28px",
          width: "60px",
          height: "84px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "upright"
      }
    ]
  },
  left: {
    regionStyle: {
      width: "96px",
      height: "260px"
    },
    lanes: [
      {
        targetPosition: "top",
        laneStyle: {
          left: "6px",
          bottom: "136px",
          width: "84px",
          height: "124px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      },
      {
        targetPosition: "right",
        laneStyle: {
          left: "6px",
          bottom: "136px",
          width: "84px",
          height: "62px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      },
      {
        targetPosition: "bottom",
        laneStyle: {
          left: "6px",
          bottom: "0px",
          width: "84px",
          height: "62px"
        },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      }
    ]
  }
};

function SuitGlyph({
  suit,
  className = ""
}: {
  suit: StandardSuit;
  className?: string;
}) {
  const classes = ["playing-card__glyph", className].filter(Boolean).join(" ");

  switch (suit) {
    case "jade":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path d="M26 8h12l3 7H23z" fill="currentColor" opacity="0.86" />
          <circle
            cx="32"
            cy="33"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
          <circle
            cx="32"
            cy="33"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.8"
          />
          <path
            d="M32 51v7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "sword":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path d="M31 10h2l5 7-1 2-6 24-4 0-1-2 5-24z" fill="currentColor" />
          <path
            d="M21 26h22"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M28 31h8v8h-8z" fill="currentColor" opacity="0.9" />
          <path d="M30 39h4v12h-4z" fill="currentColor" />
          <path
            d="M27 52h10"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "pagoda":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path d="M32 9l4 5h-8z" fill="currentColor" />
          <path d="M18 20h28l-4-6H22z" fill="currentColor" opacity="0.9" />
          <path d="M22 30h20l-3-5H25z" fill="currentColor" opacity="0.82" />
          <path d="M25 39h14l-2.5-4H27.5z" fill="currentColor" opacity="0.74" />
          <path d="M29 19h6v24h-6z" fill="currentColor" opacity="0.88" />
          <path d="M24 45h16v4H24z" fill="currentColor" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path
            d="M32 8l5 13 13-5-5 13 11 3-11 3 5 13-13-5-5 13-5-13-13 5 5-13-11-3 11-3-5-13 13 5z"
            fill="currentColor"
          />
          <circle cx="32" cy="32" r="7" fill="rgba(255,255,255,0.32)" />
        </svg>
      );
  }
}

function SpecialGlyph({
  special,
  className = ""
}: {
  special: SpecialCardName;
  className?: string;
}) {
  const classes = ["playing-card__glyph", className].filter(Boolean).join(" ");

  switch (special) {
    case "dragon":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path
            d="M45 14c-6 0-11 3-14 8-2 4-1 8 2 10 3 2 8 1 11-3-2 7-7 11-14 11-6 0-10-3-12-8 0 8 6 14 15 14 12 0 22-11 22-24 0-4-4-8-10-8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M42 14l7 2-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M21 42l-5 8 10-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="35" cy="24" r="2.5" fill="currentColor" />
        </svg>
      );
    case "phoenix":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path
            d="M18 40c8-2 14-9 16-20 3 8 9 14 16 16-8 1-14 5-18 12-2-5-7-8-14-8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M28 20l4-8 4 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M31 35l-7 13M35 35l9 11M31 35l-2 15"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "dog":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <path
            d="M24 20l-7 8v16c0 6 6 10 15 10s15-4 15-10V28l-7-8-8 4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M25 36h0M39 36h0"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M28 45c2 2 6 2 8 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "mahjong":
      return (
        <svg viewBox="0 0 64 64" className={classes} aria-hidden="true">
          <rect
            x="15"
            y="10"
            width="34"
            height="44"
            rx="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            cx="32"
            cy="24"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          />
          <path
            d="M24 41c4-1 8-5 9-11 1 4 4 7 8 9-4 1-7 3-10 7-1-2-3-4-7-5z"
            fill="currentColor"
            opacity="0.88"
          />
          <path
            d="M23 16l4 3M41 16l-4 3"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function CardCorner({
  label,
  symbol,
  mirrored = false,
  special = false
}: {
  label: string;
  symbol: ReactNode;
  mirrored?: boolean;
  special?: boolean;
}) {
  return (
    <div
      className={[
        "playing-card__corner",
        mirrored ? "playing-card__corner--bottom" : "playing-card__corner--top",
        special ? "playing-card__corner--special" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={
          special
            ? "playing-card__rank playing-card__rank--special"
            : "playing-card__rank"
        }
      >
        {label}
      </span>
      <span className="playing-card__corner-symbol">{symbol}</span>
    </div>
  );
}

function StandardCardArt({
  card
}: {
  card: Extract<Card, { kind: "standard" }>;
}) {
  const rank = formatRank(card.rank);

  return (
    <div className="playing-card__face">
      <CardCorner label={rank} symbol={<SuitGlyph suit={card.suit} />} />

      <div className="playing-card__center">
        <div className="playing-card__seal">
          <SuitGlyph suit={card.suit} className="playing-card__center-glyph" />
        </div>
        <span className="playing-card__title">{formatSuitName(card)}</span>
      </div>

      <CardCorner
        label={rank}
        symbol={<SuitGlyph suit={card.suit} />}
        mirrored
      />
    </div>
  );
}

function SpecialCardArt({
  card
}: {
  card: Extract<Card, { kind: "special" }>;
}) {
  const label = SPECIAL_CARD_CORNER_LABELS[card.special];

  return (
    <div className="playing-card__face playing-card__face--special">
      <CardCorner
        label={label}
        symbol={<SpecialGlyph special={card.special} />}
        special
      />

      <div className="playing-card__center playing-card__center--special">
        <div className="playing-card__seal playing-card__seal--special">
          <SpecialGlyph
            special={card.special}
            className="playing-card__center-glyph playing-card__center-glyph--special"
          />
        </div>
        <span className="playing-card__title">
          {SPECIAL_CARD_NAMES[card.special]}
        </span>
        <span className="playing-card__subtitle">
          {SPECIAL_CARD_SUBTITLES[card.special]}
        </span>
      </div>

      <CardCorner
        label={label}
        symbol={<SpecialGlyph special={card.special} />}
        mirrored
        special
      />
    </div>
  );
}

function cardContent(card: Card) {
  return card.kind === "standard" ? (
    <StandardCardArt card={card} />
  ) : (
    <SpecialCardArt card={card} />
  );
}

function surfaceMessage(
  props: Pick<GameTableViewProps, "controlHint" | "state" | "derived">
) {
  if (props.state.pendingDragonGift) {
    return {
      title: "Dragon gift",
      body: `${formatSeatShort(props.state.pendingDragonGift.winner)} chooses an opponent.`
    };
  }

  if (props.state.phase === "finished" && props.state.roundSummary) {
    return {
      title: props.state.matchComplete ? "Match complete" : "Round complete",
      body: props.state.matchComplete
        ? props.state.matchWinner
          ? `${formatTeamShort(props.state.matchWinner)} won the match ${props.state.matchScore[props.state.matchWinner]} to ${
              props.state.matchWinner === "team-0"
                ? props.state.matchScore["team-1"]
                : props.state.matchScore["team-0"]
            }.`
          : `The match reached the 1000-point threshold with a ${props.state.matchScore["team-0"]}:${props.state.matchScore["team-1"]} tie.`
        : `Finish: ${props.state.roundSummary.finishOrder.map((seat) => formatSeatShort(seat)).join(" -> ")}`
    };
  }

  if (isExchangePhase(props.state.phase)) {
    const flow = getExchangeFlowState(props.state);
    return {
      title:
        flow === "exchange_selecting"
          ? "Exchange cards"
          : flow === "exchange_waiting_for_ai"
            ? "Waiting for exchanges"
            : flow === "exchange_resolving"
              ? "Resolving exchange"
              : flow === "exchange_complete"
                ? "Exchange complete"
                : "Exchange cards",
      body: props.controlHint
    };
  }

  return {
    title: props.derived.phase.replaceAll("_", " "),
    body: props.controlHint
  };
}

function getSeatVisualPosition(seat: SeatId): SeatVisualPosition {
  switch (seat) {
    case "seat-0":
      return "bottom";
    case "seat-1":
      return "right";
    case "seat-2":
      return "top";
    case "seat-3":
      return "left";
  }
}

function getPassLaneDescriptor(
  elementId: NormalLayoutElementId
):
  | {
      sourcePosition: SeatVisualPosition;
      targetPosition: SeatVisualPosition;
      direction: PassLaneDirection;
    }
  | null {
  for (const sourcePosition of ["top", "right", "bottom", "left"] as const) {
    for (const laneSpec of NORMAL_PASS_STAGE_MAP[sourcePosition]) {
      if (
        NORMAL_PASS_LANE_LAYOUT_IDS[sourcePosition][laneSpec.targetPosition] ===
        elementId
      ) {
        return {
          sourcePosition,
          targetPosition: laneSpec.targetPosition,
          direction: laneSpec.direction
        };
      }
    }
  }

  return null;
}

function anchorPointFromBoardAnchorStyle(style: CSSProperties): AnchorPoint {
  return {
    x: parseFloat(String(style.left ?? 0)),
    y: parseFloat(String(style.top ?? 0))
  };
}

function clampInlineNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveSideStatusBadgeStyle(config: {
  badgeIndex: number;
  badgeCount: number;
  handCardCount: number;
  layoutMetrics: NormalViewportLayoutMetrics;
  normalTableLayout: NormalTableLayout;
  position: SeatVisualPosition;
  fallbackStyle: CSSProperties;
}): CSSProperties {
  const seatAnchor = resolveNormalSeatAnchorGeometry({
    position: config.position,
    normalTableLayout: config.normalTableLayout,
    layoutMetrics: config.layoutMetrics,
    handCardCount: config.handCardCount
  });
  const { labelToBadgeGap } = getNormalTableSpacing(config.layoutMetrics);
  const badgeStep = clampInlineNumber(
    Math.round(config.layoutMetrics.cardWidth * 0.58),
    38,
    52
  );
  const xOffset =
    config.badgeCount <= 1
      ? 0
      : config.badgeIndex === 0
        ? -badgeStep / 2
        : badgeStep / 2;

  return {
    ...config.fallbackStyle,
    left: `${seatAnchor.hand.x + xOffset}px`,
    top: `${seatAnchor.handBounds.top - labelToBadgeGap}px`,
    transform: "translate(-50%, -100%)"
  };
}

function resolveBoundTrickZoneStyle(
  trickZone: CSSProperties,
  position: SeatVisualPosition,
  layoutMetrics: NormalViewportLayoutMetrics
): CSSProperties {
  const relaxOffset = Math.max(3, Math.round(layoutMetrics.cardWidth * 0.05));
  const relaxedShift =
    position === "top"
      ? ` translateY(${relaxOffset}px)`
      : position === "bottom"
        ? ` translateY(-${relaxOffset}px)`
        : position === "left"
          ? ` translateX(${relaxOffset}px)`
          : ` translateX(-${relaxOffset}px)`;

  return {
    ...trickZone,
    transform: `${String(trickZone.transform ?? "").trim()}${relaxedShift}`.trim()
  };
}

type NormalEditorElementVisual = {
  center: AnchorPoint;
  style: CSSProperties;
};

function resolveNormalEditorElementVisual(config: {
  elementId: NormalLayoutElementId;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  seatViews: SeatView[];
  sortedLocalHand: Card[];
}): NormalEditorElementVisual {
  const spec = NORMAL_LAYOUT_ELEMENT_SPECS[config.elementId];
  const seatViewByPosition = Object.fromEntries(
    config.seatViews.map((seatView) => [seatView.position, seatView])
  ) as Record<SeatVisualPosition, SeatView>;

  if (config.elementId === "scoreBadge") {
    const center = resolveNormalBoardAnchorPoint(
      config.normalTableLayout.scoreBadge,
      config.layoutMetrics
    );

    return {
      center,
      style: {
        ...resolveNormalBoardAnchorStyle(
          config.normalTableLayout.scoreBadge,
          config.layoutMetrics
        ),
        width: `${spec.width}px`,
        height: `${spec.height}px`
      }
    };
  }

  if (config.elementId === "playSurface") {
    const center = resolveNormalBoardAnchorPoint(
      config.normalTableLayout.playSurface,
      config.layoutMetrics
    );

    return {
      center,
      style: resolveNormalPlaySurfaceRegionStyle({
        normalTableLayout: config.normalTableLayout,
        layoutMetrics: config.layoutMetrics
      })
    };
  }

  if (config.elementId === "actionRow") {
    const center = resolveNormalBoardAnchorPoint(
      config.normalTableLayout.actionRow,
      config.layoutMetrics
    );

    return {
      center,
      style: resolveNormalActionRowRegionStyle({
        normalTableLayout: config.normalTableLayout,
        layoutMetrics: config.layoutMetrics
      })
    };
  }

  const handPosition =
    Object.entries(NORMAL_HAND_LAYOUT_IDS).find(
      ([, layoutElementId]) => layoutElementId === config.elementId
    )?.[0] as SeatVisualPosition | undefined;
  if (handPosition) {
    const center = resolveNormalBoardAnchorPoint(
      config.normalTableLayout[config.elementId],
      config.layoutMetrics
    );

    return {
      center,
      style: resolveNormalSeatRegionStyle({
        position: handPosition,
        normalTableLayout: config.normalTableLayout,
        layoutMetrics: config.layoutMetrics
      })
    };
  }

  const labelPosition =
    config.elementId === "northLabel"
      ? "top"
      : config.elementId === "eastLabel"
        ? "right"
        : config.elementId === "southLabel"
          ? "bottom"
          : config.elementId === "westLabel"
            ? "left"
            : null;
  if (labelPosition) {
    const handCardCount =
      labelPosition === "bottom"
        ? config.sortedLocalHand.length
        : seatViewByPosition[labelPosition].cards.length;
    const seatLayout = getNormalSeatLayout({
      position: labelPosition,
      normalTableLayout: config.normalTableLayout,
      layoutMetrics: config.layoutMetrics,
      handCardCount
    });
    const center = anchorPointFromBoardAnchorStyle(seatLayout.nameLabel);

    return {
      center,
      style: {
        ...seatLayout.nameLabel,
        width: `${spec.width}px`,
        height: `${spec.height}px`
      }
    };
  }

  const stagePosition =
    config.elementId === "northStage"
      ? "top"
      : config.elementId === "eastStage"
        ? "right"
        : config.elementId === "southStage"
          ? "bottom"
          : config.elementId === "westStage"
            ? "left"
            : null;
  if (stagePosition) {
    const seatLayout = getNormalSeatLayout({
      position: stagePosition,
      normalTableLayout: config.normalTableLayout,
      layoutMetrics: config.layoutMetrics,
      handCardCount: 0
    });
    const center = anchorPointFromBoardAnchorStyle(seatLayout.trickZone);

    return {
      center,
      style: {
        ...seatLayout.trickZone,
        width: `${spec.width}px`,
        height: `${spec.height}px`
      }
    };
  }

  const passLaneDescriptor = getPassLaneDescriptor(config.elementId);
  if (passLaneDescriptor) {
    const geometry = resolveNormalPassLaneGeometry({
      normalTableLayout: config.normalTableLayout,
      layoutMetrics: config.layoutMetrics,
      sourcePosition: passLaneDescriptor.sourcePosition,
      targetPosition: passLaneDescriptor.targetPosition,
      direction: passLaneDescriptor.direction
    });
    if (geometry) {
      const center = anchorPointFromBoardAnchorStyle(geometry.style);

      return {
        center,
        style: geometry.style
      };
    }
  }

  const center = resolveNormalBoardAnchorPoint(
    config.normalTableLayout[config.elementId],
    config.layoutMetrics
  );

  return {
    center,
    style: {
      ...resolveNormalBoardAnchorStyle(
        config.normalTableLayout[config.elementId],
        config.layoutMetrics
      ),
      width: `${spec.width}px`,
      height: `${spec.height}px`
    }
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getNormalTrickCardWidth(layoutMetrics: NormalViewportLayoutMetrics) {
  return Math.min(84, Math.max(44, Math.round(layoutMetrics.cardWidth * 0.82)));
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1366 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight
  }));

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return { ref, size };
}

function useNormalViewportLock() {
  useEffect(() => {
    document.documentElement.classList.add("normal-layout-locked");
    document.body.classList.add("normal-layout-locked");

    return () => {
      document.documentElement.classList.remove("normal-layout-locked");
      document.body.classList.remove("normal-layout-locked");
    };
  }, []);
}

function updateLayoutElement(
  layout: NormalTableLayout,
  elementId: NormalLayoutElementId,
  nextValue: Partial<NormalLayoutElement>
): NormalTableLayout {
  return {
    ...layout,
    [elementId]: {
      ...layout[elementId],
      ...nextValue
    }
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampStageCardScale(value: number): number {
  return Math.min(1, Math.max(0.7, value));
}

function normalizeLoadedLayoutTokens(
  payload: unknown
): NormalTableLayoutTokens {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS;
  }

  const payloadRecord = payload as Record<string, unknown>;

  return {
    topHandOverlap: isFiniteNumber(payloadRecord.topHandOverlap)
      ? Math.max(0, payloadRecord.topHandOverlap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.topHandOverlap,
    bottomHandOverlap: isFiniteNumber(payloadRecord.bottomHandOverlap)
      ? Math.max(0, payloadRecord.bottomHandOverlap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.bottomHandOverlap,
    sideHandOverlap: isFiniteNumber(payloadRecord.sideHandOverlap)
      ? Math.max(0, payloadRecord.sideHandOverlap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.sideHandOverlap,
    trickLaneGap: isFiniteNumber(payloadRecord.trickLaneGap)
      ? Math.max(0, payloadRecord.trickLaneGap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.trickLaneGap,
    playCardOverlap: isFiniteNumber(payloadRecord.playCardOverlap)
      ? Math.max(0, payloadRecord.playCardOverlap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.playCardOverlap,
    passCardOverlap: isFiniteNumber(payloadRecord.passCardOverlap)
      ? Math.max(0, payloadRecord.passCardOverlap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.passCardOverlap,
    sideLaneInsetFromHand: isFiniteNumber(payloadRecord.sideLaneInsetFromHand)
      ? Math.max(0, payloadRecord.sideLaneInsetFromHand)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.sideLaneInsetFromHand,
    sideLaneVerticalSpacing: isFiniteNumber(payloadRecord.sideLaneVerticalSpacing)
      ? Math.max(0, payloadRecord.sideLaneVerticalSpacing)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.sideLaneVerticalSpacing,
    actionAreaGap: isFiniteNumber(payloadRecord.actionAreaGap)
      ? Math.max(0, payloadRecord.actionAreaGap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.actionAreaGap,
    actionButtonGap: isFiniteNumber(payloadRecord.actionButtonGap)
      ? Math.max(0, payloadRecord.actionButtonGap)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.actionButtonGap,
    stageCardScale: isFiniteNumber(payloadRecord.stageCardScale)
      ? clampStageCardScale(payloadRecord.stageCardScale)
      : DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS.stageCardScale
  };
}

export function normalizeLoadedLayout(
  payload: unknown
): NormalTableLayout | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const source =
    "elements" in payloadRecord &&
    payloadRecord.elements &&
    typeof payloadRecord.elements === "object" &&
    !Array.isArray(payloadRecord.elements)
      ? payloadRecord.elements
      : payload;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  let hasElement = false;
  const nextLayout = { ...DEFAULT_NORMAL_TABLE_LAYOUT };
  const sourceRecord = source as Record<string, unknown>;

  for (const elementId of NORMAL_LAYOUT_EDITOR_ORDER) {
    const candidate = sourceRecord[elementId];
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }

    const candidateRecord = candidate as Record<string, unknown>;
    const x = candidateRecord.x;
    const y = candidateRecord.y;
    const rotation = candidateRecord.rotation;

    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      continue;
    }

    hasElement = true;
    nextLayout[elementId] = {
      x: clamp01(x),
      y: clamp01(y),
      rotation: isFiniteNumber(rotation)
        ? rotation
        : DEFAULT_NORMAL_TABLE_LAYOUT[elementId].rotation
    };
  }

  return hasElement ? nextLayout : null;
}

export function normalizeLoadedLayoutConfig(
  payload: unknown
): NormalTableLayoutConfig | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const elements = normalizeLoadedLayout(payloadRecord);

  if (!elements) {
    return null;
  }

  return {
    version: isFiniteNumber(payloadRecord.version)
      ? payloadRecord.version
      : DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG.version,
    surface: DEFAULT_NORMAL_TABLE_SURFACE,
    elements,
    tokens: normalizeLoadedLayoutTokens(payloadRecord.tokens)
  };
}

export function normalTableLayoutTokenStyle(
  tokens: NormalTableLayoutTokens
): CSSProperties {
  return {
    "--normal-top-hand-overlap": `-${tokens.topHandOverlap}px`,
    "--normal-bottom-hand-overlap": `-${tokens.bottomHandOverlap}px`,
    "--normal-side-hand-overlap": `-${tokens.sideHandOverlap}px`,
    "--normal-trick-lane-gap": `${tokens.trickLaneGap}px`,
    "--normal-play-card-overlap": `-${tokens.playCardOverlap}px`,
    "--normal-pass-card-overlap": `-${tokens.passCardOverlap}px`,
    "--normal-side-lane-inset-from-hand": `${tokens.sideLaneInsetFromHand}px`,
    "--normal-side-lane-vertical-spacing": `${tokens.sideLaneVerticalSpacing}px`,
    "--normal-action-area-gap": `${tokens.actionAreaGap}px`,
    "--normal-action-button-gap": `${tokens.actionButtonGap}px`,
    "--normal-stage-card-scale": String(tokens.stageCardScale)
  } as CSSProperties;
}

export function parseNormalTableLayoutConfigText(
  text: string
): NormalTableLayoutConfig | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  // Keep XML import compatibility for older exported editor files, but the
  // shipped canonical artifact now lives in layout.json.
  if (trimmed.startsWith("<")) {
    const elements: Record<string, { x: number; y: number; rotation: number }> =
      {};

    for (const match of trimmed.matchAll(/<element\b([^>]*)\/?>/g)) {
      const attributeSource = match[1] ?? "";
      const attributes = Object.fromEntries(
        Array.from(attributeSource.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [
          key,
          value
        ])
      );
      const id = attributes.id;
      const x = Number(attributes.x);
      const y = Number(attributes.y);
      const rotation = Number(attributes.rotation ?? "0");

      if (
        !id ||
        !isFiniteNumber(x) ||
        !isFiniteNumber(y) ||
        !isFiniteNumber(rotation)
      ) {
        continue;
      }

      elements[id] = { x, y, rotation };
    }

    return Object.keys(elements).length > 0
      ? normalizeLoadedLayoutConfig({ elements })
      : null;
  }

  try {
    return normalizeLoadedLayoutConfig(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function parseNormalTableLayoutText(
  text: string
): NormalTableLayout | null {
  return parseNormalTableLayoutConfigText(text)?.elements ?? null;
}

export function serializeNormalTableLayoutConfig(
  config: NormalTableLayoutConfig
): string {
  const orderedElements = Object.fromEntries(
    NORMAL_LAYOUT_EDITOR_ORDER.map((elementId) => [elementId, config.elements[elementId]])
  );

  return JSON.stringify(
    {
      version: config.version,
      surface: {
        widthMode: config.surface.widthMode,
        heightMode: config.surface.heightMode,
        gridSize: config.surface.gridSize
      },
      elements: orderedElements,
      tokens: {
        topHandOverlap: config.tokens.topHandOverlap,
        bottomHandOverlap: config.tokens.bottomHandOverlap,
        sideHandOverlap: config.tokens.sideHandOverlap,
        trickLaneGap: config.tokens.trickLaneGap,
        playCardOverlap: config.tokens.playCardOverlap,
        passCardOverlap: config.tokens.passCardOverlap,
        sideLaneInsetFromHand: config.tokens.sideLaneInsetFromHand,
        sideLaneVerticalSpacing: config.tokens.sideLaneVerticalSpacing,
        actionAreaGap: config.tokens.actionAreaGap,
        actionButtonGap: config.tokens.actionButtonGap,
        stageCardScale: config.tokens.stageCardScale
      }
    },
    null,
    2
  );
}

function CardFace({
  card,
  interactive = false,
  tone = "normal",
  selected = false,
  className = "",
  draggable = false,
  onClick,
  onDragStart,
  onDragEnd
}: {
  card: Card;
  interactive?: boolean;
  tone?: "normal" | "legal" | "muted";
  selected?: boolean;
  className?: string;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const classes = [
    "playing-card",
    getCardClassName(card),
    tone === "legal" ? "playing-card--legal" : "",
    tone === "muted" ? "playing-card--muted" : "",
    selected ? "playing-card--selected" : "",
    isDragging ? "playing-card--dragging" : "",
    interactive ? "" : "playing-card--static",
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    const buttonProps: {
      onClick?: () => void;
      onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
      onDragEnd?: () => void;
    } = {};

    if (onClick) {
      buttonProps.onClick = onClick;
    }

    buttonProps.onDragStart = (event) => {
      setIsDragging(true);
      onDragStart?.(event);
    };
    buttonProps.onDragEnd = () => {
      setIsDragging(false);
      onDragEnd?.();
    };

    return (
      <button
        type="button"
        className={classes}
        draggable={draggable}
        {...buttonProps}
      >
        {cardContent(card)}
      </button>
    );
  }

  return <div className={classes}>{cardContent(card)}</div>;
}

function SeatCountPreview({ count }: { count: number }) {
  return (
    <div className="seat-count-preview" aria-hidden="true">
      {Array.from({ length: Math.min(count, 8) }).map((_, index) => (
        <span key={index} className="seat-count-preview__card" />
      ))}
    </div>
  );
}

function PassRouteToken({
  route,
  laneDirection,
  cardLookup,
  interactive = false,
  onCardClick,
  onCardDragStart,
  onCardDragEnd
}: {
  route: PassRouteView;
  laneDirection: PassLaneDirection;
  cardLookup: ReadonlyMap<string, Card>;
  interactive?: boolean;
  onCardClick?: () => void;
  onCardDragStart?: (cardId: string) => void;
  onCardDragEnd?: (cardId: string) => void;
}) {
  if (route.visibleCardId) {
    const pickupCardClassName =
      route.displayMode === "pickup"
        ? route.sourcePosition === "top" || route.sourcePosition === "bottom"
          ? route.target === "left"
            ? "normal-card--route-pickup normal-card--route-pickup-left"
            : route.target === "right"
              ? "normal-card--route-pickup normal-card--route-pickup-right"
              : "normal-card--route-pickup normal-card--route-pickup-upright"
          : laneDirection === "up"
            ? "normal-card--route-pickup normal-card--route-pickup-up"
            : laneDirection === "down"
              ? "normal-card--route-pickup normal-card--route-pickup-down"
              : laneDirection === "left"
                ? "normal-card--route-pickup normal-card--route-pickup-left"
                : "normal-card--route-pickup normal-card--route-pickup-right"
        : "";
    const interactiveProps = interactive
      ? {
          interactive: true as const,
          draggable: true,
          onClick: onCardClick ?? (() => undefined),
          onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-tichu-pass-card",
              route.visibleCardId!
            );
            onCardDragStart?.(route.visibleCardId!);
          },
          onDragEnd: () => onCardDragEnd?.(route.visibleCardId!)
        }
      : {};

    return (
      <CardFace
        card={resolveCard(route.visibleCardId, cardLookup)}
        className={[
          "normal-card",
          "normal-card--route",
          pickupCardClassName
        ]
          .filter(Boolean)
          .join(" ")}
        {...interactiveProps}
      />
    );
  }

  return (
    <div
      className={
        route.occupied
          ? "normal-pass-token normal-pass-token--back"
          : "normal-pass-token normal-pass-token--empty"
      }
    />
  );
}

function SeatFlagChips({
  callState,
  finishIndex,
  passReady,
  isPrimarySeat,
  isThinkingSeat,
  compact = false,
  showCallMarkers = true
}: Pick<
  SeatView,
  "callState" | "finishIndex" | "passReady" | "isPrimarySeat" | "isThinkingSeat"
> & {
  compact?: boolean;
  showCallMarkers?: boolean;
}) {
  const className = compact ? "normal-seat__call" : "seat-chip";
  const tichuMarkerLabel = getTichuMarkerLabel(callState);

  return (
    <>
      {showCallMarkers && tichuMarkerLabel === "GT" && (
        <span
          className={`${className} ${compact ? "normal-seat__call--grand" : "seat-chip--alert"}`}
          title="Grand Tichu"
        >
          GT
        </span>
      )}
      {showCallMarkers && tichuMarkerLabel === "T" && (
        <span
          className={`${className} ${compact ? "normal-seat__call--small" : "seat-chip--accent"}`}
          title="Tichu"
        >
          T
        </span>
      )}
      {isPrimarySeat && (
        <span
          className={`${className} ${compact ? "normal-seat__call--turn" : "seat-chip--turn"}`}
        >
          Turn
        </span>
      )}
      {isThinkingSeat && !compact && (
        <span className="seat-chip seat-chip--soft">Thinking</span>
      )}
      {passReady && !compact && (
        <span className="seat-chip seat-chip--soft">Pass Ready</span>
      )}
      {finishIndex >= 0 && (
        <span
          className={`${className} ${compact ? "normal-seat__call--finish" : "seat-chip--success"}`}
        >
          {formatPlacement(finishIndex)}
        </span>
      )}
    </>
  );
}

export function getDisplayedTrickPoints(seatRelativePlays: readonly SeatPlayView[]): number {
  return getCardsPoints(
    cardsFromIds(
      seatRelativePlays.flatMap(({ plays }) =>
        plays.flatMap((entry) => entry.combination.cardIds)
      )
    )
  );
}

export function getNormalCenterZoneClassName(layoutEditorActive: boolean): string {
  return ["normal-center-zone", layoutEditorActive ? "normal-center-zone--editor" : ""]
    .filter(Boolean)
    .join(" ");
}

export function shouldRenderNormalCenterZoneFelt(layoutEditorActive: boolean): boolean {
  return layoutEditorActive;
}

export function TableSurface(
  props: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "state"
  | "derived"
  | "controlHint"
  | "displayedTrick"
  | "trickIsResolving"
  | "seatRelativePlays"
  | "tablePassGroups"
  | "cardLookup"
> & {
  variant: "normal" | "debug";
}
) {
  const {
    variant,
    state,
    derived,
    controlHint,
    displayedTrick,
    trickIsResolving,
    seatRelativePlays,
    tablePassGroups,
    cardLookup
  } = props;
  const status = surfaceMessage({ controlHint, state, derived });
  const exchangePhaseActive = isExchangePhase(state.phase);
  const trickPoints = displayedTrick
    ? getDisplayedTrickPoints(seatRelativePlays)
    : 0;
  const renderSharedTrickLanes = variant === "debug";

  return (
    <section
      className={[
        variant === "normal" ? "normal-play-surface" : "table-trick",
        trickIsResolving
          ? variant === "normal"
            ? "normal-play-surface--resolving"
            : "table-trick--resolving"
          : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!exchangePhaseActive && displayedTrick ? (
        <>
          <div
            className={
              variant === "normal"
                ? "normal-play-surface__core"
                : "table-trick__core"
            }
          >
            <span
              className={
                variant === "normal"
                  ? "normal-play-surface__badge"
                  : "table-trick__lead"
              }
            >
              {formatCombinationKind(displayedTrick.currentCombination.kind)}
            </span>
            <span
              className={
                variant === "normal"
                  ? "normal-play-surface__badge"
                  : "table-trick__lead"
              }
            >
              {formatSeatShort(displayedTrick.currentWinner)} ahead
            </span>
            <span
              className={
                variant === "normal"
                  ? "normal-play-surface__badge normal-play-surface__badge--points"
                  : "table-trick__lead"
              }
            >
              Trick: {trickPoints} pts
            </span>
            {derived.currentWish !== null && (
              <span
                className={
                  variant === "normal"
                    ? "normal-play-surface__badge"
                    : "wish-chip wish-chip--table"
                }
              >
                Wish {formatRank(derived.currentWish)}
              </span>
            )}
          </div>

          {renderSharedTrickLanes &&
            seatRelativePlays.map(({ seat, position, plays }) => {
              if (plays.length === 0) {
                return null;
              }

              return (
                <div
                  key={seat}
                  className={`table-trick__lane table-trick__lane--${position}`}
                >
                  <div className="table-trick__sequence">
                    {plays.map((entry, index) => {
                      const isWinningPlay =
                        entry.seat === displayedTrick.currentWinner &&
                        entry.combination.key ===
                          displayedTrick.currentCombination.key;

                      return (
                        <div
                          key={`${seat}-${entry.combination.key}-${index}`}
                          className={`table-trick__play${isWinningPlay ? " table-trick__play--winning" : ""}`}
                        >
                          {entry.combination.kind === "single" && (
                            <span className="table-trick__play-kind">
                              {formatCombinationKind(entry.combination.kind)}
                            </span>
                          )}
                          <div className="table-trick__combo">
                            {entry.combination.cardIds.map((cardId) => (
                              <CardFace
                                key={cardId}
                                card={resolveCard(cardId, cardLookup)}
                                className="table-trick__card"
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </>
      ) : variant === "debug" && exchangePhaseActive && tablePassGroups.length > 0 ? (
        <>
          <div className="table-trick__core">
            <span className="table-trick__lead">
              {state.phase === "pass_select" ? "Pass lanes" : "Exchange ready"}
            </span>
          </div>

          {tablePassGroups.map((group) => (
            <div
              key={group.seat}
              className={`table-trick__lane table-trick__lane--${group.position}`}
            >
              <span className="table-trick__seat-label">{group.label}</span>
              <div className="table-trick__combo">
                {group.cardIds.map((cardId) => (
                  <CardFace
                    key={`${group.seat}-${cardId}`}
                    card={resolveCard(cardId, cardLookup)}
                    className="table-trick__card"
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div
          className={
            variant === "normal"
              ? "normal-play-surface__empty"
              : "table-trick__empty"
          }
        >
          <strong>{status.title}</strong>
          <p>{status.body}</p>
          {state.phase === "finished" && state.roundSummary && (
            <p>
              NS {state.roundSummary.teamScores["team-0"]} | EW{" "}
              {state.roundSummary.teamScores["team-1"]}
            </p>
          )}
          {state.phase === "finished" && state.roundSummary?.doubleVictory && (
            <p>
              {formatTeamShort(state.roundSummary.doubleVictory)} scored a double
              victory.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function NormalSeatOverlayLayer({
  seatViews,
  sortedLocalHand,
  layoutMetrics,
  normalTableLayout
}: Pick<GameTableViewProps, "seatViews" | "sortedLocalHand" | "normalTableLayout"> & {
  layoutMetrics: NormalViewportLayoutMetrics;
}) {
  return (
    <div className="normal-seat-overlays" aria-hidden="true">
      {seatViews.map((seatView) => {
        const handCardCount = seatView.isLocalSeat
          ? sortedLocalHand.length
          : seatView.cards.length;
        const seatLayout = getNormalSeatLayout({
          position: seatView.position,
          normalTableLayout,
          layoutMetrics,
          handCardCount
        });
        const tichuMarkerLabel = getTichuMarkerLabel(seatView.callState);
        const renderInlineSideLabel = false;
        const sideIdentityBadgeOrder = renderInlineSideLabel
          ? ([
              tichuMarkerLabel ? "call" : null,
              seatView.finishIndex >= 0 ? "out" : null
            ].filter(Boolean) as Array<"call" | "out">)
          : [];
        const callBadgeStyle =
          renderInlineSideLabel && tichuMarkerLabel
            ? resolveSideStatusBadgeStyle({
                badgeIndex: sideIdentityBadgeOrder.indexOf("call"),
                badgeCount: sideIdentityBadgeOrder.length,
                handCardCount,
                layoutMetrics,
                normalTableLayout,
                position: seatView.position,
                fallbackStyle: seatLayout.callBadge
              })
            : seatLayout.callBadge;
        const outBadgeStyle =
          renderInlineSideLabel && seatView.finishIndex >= 0
            ? resolveSideStatusBadgeStyle({
                badgeIndex: sideIdentityBadgeOrder.indexOf("out"),
                badgeCount: sideIdentityBadgeOrder.length,
                handCardCount,
                layoutMetrics,
                normalTableLayout,
                position: seatView.position,
                fallbackStyle: seatLayout.outBadge
              })
            : seatLayout.outBadge;

        return (
          <div key={`overlay-${seatView.seat}`}>
            {!renderInlineSideLabel && (
              <div
                className={[
                  "normal-seat-overlay__label",
                  `normal-seat-overlay__label--${seatView.position}`,
                  seatView.isPrimarySeat ? "normal-seat-overlay__label--active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={seatLayout.nameLabel}
              >
                <span>{seatView.title}</span>
              </div>
            )}

            {tichuMarkerLabel && (
              <span
                className={[
                  "normal-seat-overlay__call",
                  `normal-seat-overlay__call--${seatView.position}`,
                  tichuMarkerLabel === "GT"
                    ? "normal-seat-overlay__call--grand"
                    : "normal-seat-overlay__call--small"
                ].join(" ")}
                style={callBadgeStyle}
                title={tichuMarkerLabel === "GT" ? "Grand Tichu" : "Tichu"}
              >
                {tichuMarkerLabel}
              </span>
            )}

            {seatView.isPrimarySeat && (
              <span
                className={[
                  "normal-seat-overlay__turn",
                  `normal-seat-overlay__turn--${seatView.position}`
                ].join(" ")}
                style={seatLayout.turnBadge}
              >
                TURN
              </span>
            )}

            {seatView.finishIndex >= 0 && (
              <span
                className={[
                  "normal-seat-overlay__out",
                  `normal-seat-overlay__out--${seatView.position}`
                ].join(" ")}
                style={outBadgeStyle}
              >
                {formatPlacement(seatView.finishIndex)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NormalDogLeadTransfer({
  normalTableLayout,
  layoutMetrics,
  animation
}: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  animation: DogLeadAnimationView;
}) {
  const [active, setActive] = useState(false);
  const sourcePosition = getSeatVisualPosition(animation.sourceSeat);
  const targetPosition = getSeatVisualPosition(animation.targetSeat);
  const sourceAnchor = resolveNormalBoardAnchorPoint(
    normalTableLayout[NORMAL_STAGE_LAYOUT_IDS[sourcePosition]],
    layoutMetrics
  );
  const targetAnchor = resolveNormalBoardAnchorPoint(
    normalTableLayout[NORMAL_HAND_LAYOUT_IDS[targetPosition]],
    layoutMetrics
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setActive(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [animation.sourceSeat, animation.targetSeat]);

  return (
    <div
      className={active ? "normal-dog-transfer is-active" : "normal-dog-transfer"}
      data-dog-transfer={`${animation.sourceSeat}->${animation.targetSeat}`}
      style={{
        left: `${active ? targetAnchor.x : sourceAnchor.x}px`,
        top: `${active ? targetAnchor.y : sourceAnchor.y}px`
      }}
    >
      <CardFace
        card={handCardFromId("dog")}
        className="normal-card normal-card--trick normal-card--dog-transfer"
      />
    </div>
  );
}

export function NormalTrickStagingRegions({
  normalTableLayout,
  layoutMetrics,
  displayedTrick,
  seatRelativePlays,
  pickupStageViews,
  dogLeadAnimation,
  cardLookup
}: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "displayedTrick"
  | "seatRelativePlays"
  | "pickupStageViews"
  | "dogLeadAnimation"
  | "cardLookup"
> & {
  layoutMetrics: NormalViewportLayoutMetrics;
}) {
  const trickCardWidth = getNormalTrickCardWidth(layoutMetrics);
  const trickCardHeight = Math.round(trickCardWidth / CARD_ASPECT);
  const getStraightStageCardTransform = (
    fanMetrics: NormalTrickFanMetrics,
    cardIndex: number,
    cardCount: number
  ) => {
    const centeredIndex = cardIndex - (cardCount - 1) / 2;

    return `translate(${
      centeredIndex * fanMetrics.cardDx - trickCardWidth / 2
    }px, ${centeredIndex * fanMetrics.cardDy - trickCardHeight / 2}px)`;
  };

  if (!displayedTrick && pickupStageViews.length === 0 && !dogLeadAnimation) {
    return null;
  }

  return (
    <div
      className="normal-trick-staging"
      aria-hidden="true"
      data-layout-container="trick-staging"
    >
      {displayedTrick &&
        seatRelativePlays.map(({ seat, position, plays }) => {
          if (plays.length === 0) {
            return null;
          }

          const fanMetrics = getNormalTrickFanMetrics(position, trickCardWidth);
          const seatLayout = getNormalSeatLayout({
            position,
            normalTableLayout,
            layoutMetrics,
            handCardCount: 0
          });

          return (
            <div
              key={seat}
              className={`normal-trick-stage normal-trick-stage--${position}`}
              data-trick-stage={position}
              style={resolveBoundTrickZoneStyle(
                seatLayout.trickZone,
                position,
                layoutMetrics
              )}
            >
              {plays.map((entry, playIndex) => {
                const reverseIndex = plays.length - 1 - playIndex;
                const isWinningPlay =
                  entry.seat === displayedTrick.currentWinner &&
                  entry.combination.key === displayedTrick.currentCombination.key;

                return (
                  <div
                    key={`${seat}-${entry.combination.key}-${playIndex}`}
                    className={[
                      "normal-trick-stage__play",
                      isWinningPlay ? "normal-trick-stage__play--winning" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      transform: `translate(${
                        reverseIndex * -fanMetrics.groupDx
                      }px, ${reverseIndex * -fanMetrics.groupDy}px)`,
                      zIndex: playIndex + 1
                    }}
                  >
                    {entry.combination.cardIds.map((cardId, cardIndex) => (
                      <div
                        key={cardId}
                        className="normal-trick-stage__card"
                        style={{
                          transform: getStraightStageCardTransform(
                            fanMetrics,
                            cardIndex,
                            entry.combination.cardIds.length
                          ),
                          zIndex: cardIndex + 1
                        }}
                      >
                        <CardFace
                          card={resolveCard(cardId, cardLookup)}
                          className={`normal-card normal-card--trick normal-card--trick-${position}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}

      {pickupStageViews.map((group) => {
        const fanMetrics = getNormalTrickFanMetrics(group.position, trickCardWidth);
        const seatLayout = getNormalSeatLayout({
          position: group.position,
          normalTableLayout,
          layoutMetrics,
          handCardCount: 0
        });

        return (
          <div
            key={`pickup-${group.seat}`}
            className={`normal-pickup-stage normal-pickup-stage--${group.position}`}
            data-pickup-stage={group.seat}
            style={seatLayout.pickupZone}
          >
            <span className="normal-pickup-stage__label">{group.label}</span>
            <div className="normal-pickup-stage__cards">
              {group.cardIds.map((cardId, cardIndex) => (
                <div
                  key={cardId}
                  className="normal-pickup-stage__card"
                  style={{
                    transform: getStraightStageCardTransform(
                      fanMetrics,
                      cardIndex,
                      group.cardIds.length
                    ),
                    zIndex: cardIndex + 1
                  }}
                >
                  <CardFace
                    card={resolveCard(cardId, cardLookup)}
                    className={`normal-card normal-card--pass normal-card--pass-${group.position}`}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {dogLeadAnimation && (
        <NormalDogLeadTransfer
          normalTableLayout={normalTableLayout}
          layoutMetrics={layoutMetrics}
          animation={dogLeadAnimation}
        />
      )}
    </div>
  );
}

export function NormalPassStagingRegions({
  normalTableLayout,
  layoutMetrics,
  seatViews = [],
  sortedLocalHand = [],
  passRouteViews,
  selectedPassTarget,
  cardLookup,
  onPassTargetSelect,
  onPassLaneDrop,
  onPassLaneCardClick,
  onPassLaneCardDragStart,
  onPassLaneCardDragEnd
}: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "seatViews"
  | "sortedLocalHand"
  | "passRouteViews"
  | "selectedPassTarget"
  | "cardLookup"
  | "onPassTargetSelect"
  | "onPassLaneDrop"
  | "onPassLaneCardClick"
  | "onPassLaneCardDragStart"
  | "onPassLaneCardDragEnd"
> & {
  layoutMetrics: NormalViewportLayoutMetrics;
}) {
  if (passRouteViews.length === 0) {
    return null;
  }

  return (
    <div
      className="normal-pass-staging"
      aria-label="Pass staging regions"
      data-layout-container="pass-staging"
    >
      {(["top", "right", "bottom", "left"] as const).map((sourcePosition) => {
        const sourceRoutes = passRouteViews.filter(
          (route) => route.sourcePosition === sourcePosition
        );
        if (sourceRoutes.length === 0) {
          return null;
        }
        const sourceSeatView = seatViews.find(
          (seatView) => seatView.position === sourcePosition
        );
        const sourceHandCardCount = sourceSeatView?.isLocalSeat
          ? sortedLocalHand.length
          : (sourceSeatView?.cards.length ?? 1);

        return NORMAL_PASS_STAGE_MAP[sourcePosition].map((laneSpec) => {
          const route =
            sourceRoutes.find(
              (candidateRoute) =>
                getSeatVisualPosition(candidateRoute.targetSeat) ===
                laneSpec.targetPosition
            ) ?? null;
          if (!route) {
            return null;
          }

          const laneGeometry = resolveNormalPassLaneGeometry({
            normalTableLayout,
            layoutMetrics,
            sourcePosition,
            targetPosition: laneSpec.targetPosition,
            direction: laneSpec.direction,
            sourceHandCardCount,
            displayMode: route.displayMode,
            stackAlignment:
              route.displayMode === "pickup" &&
              (sourcePosition === "left" || sourcePosition === "right")
                ? "centerline"
                : "shared-edge"
          });
          if (!laneGeometry) {
            return null;
          }

          const isInteractive = route.interactive;
          const tokenInteractive = isInteractive && Boolean(route.visibleCardId);
          const slotContents = (
            <PassRouteToken
              route={route}
              laneDirection={laneSpec.direction}
              cardLookup={cardLookup}
              interactive={tokenInteractive}
              onCardClick={() => onPassLaneCardClick(route.target)}
              onCardDragStart={(cardId) =>
                onPassLaneCardDragStart(route.target, cardId)
              }
              onCardDragEnd={(cardId) =>
                onPassLaneCardDragEnd(route.target, cardId)
              }
            />
          );
          const laneClassName = [
            "normal-pass-lane",
            `normal-pass-lane--${laneSpec.direction}`,
            `normal-pass-lane--${route.displayMode}`,
            route.occupied ? "normal-pass-lane--occupied" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const slotClassName = [
            "normal-pass-lane__slot",
            `normal-pass-lane__slot--${laneSpec.direction}`,
            route.displayMode === "pickup" && Boolean(route.visibleCardId)
              ? "normal-pass-lane__slot--pickup-filled"
              : "",
            route.faceDown ? "normal-pass-lane__slot--back" : "",
            route.occupied ? "normal-pass-lane__slot--occupied" : "",
            route.target === selectedPassTarget && isInteractive
              ? "normal-pass-lane__slot--selected"
              : "",
            isInteractive ? "normal-pass-lane__slot--interactive" : ""
          ]
            .filter(Boolean)
            .join(" ");

          if (!isInteractive) {
            return (
              <div
                key={route.key}
                className={laneClassName}
                style={laneGeometry.style}
                data-pass-lane={route.key}
                data-pass-layout-id={laneGeometry.elementId}
                data-pass-direction={laneSpec.direction}
                data-pass-target={laneSpec.targetPosition}
                aria-label={`${formatSeatShort(route.sourceSeat)} pass ${formatPassDirectionLabel(laneSpec.direction)} to ${formatSeatShort(route.targetSeat)}`}
              >
                <div className="normal-pass-lane__frame" aria-hidden="true" />
                <div
                  className={slotClassName}
                  aria-label={`${formatSeatShort(route.sourceSeat)} ${formatPassTarget(route.target)} staged card`}
                >
                  {slotContents}
                </div>
              </div>
            );
          }

          return (
            <div
              key={route.key}
              className={laneClassName}
              style={laneGeometry.style}
              data-pass-lane={route.key}
              data-pass-layout-id={laneGeometry.elementId}
              data-pass-direction={laneSpec.direction}
              data-pass-target={laneSpec.targetPosition}
            >
              <div className="normal-pass-lane__frame" aria-hidden="true" />
              {tokenInteractive ? (
                <div
                  className={slotClassName}
                  aria-label={`${formatPassDirectionLabel(laneSpec.direction)} pass to ${formatSeatShort(route.targetSeat)}`}
                  onClick={() => onPassTargetSelect(route.target)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const cardId = event.dataTransfer.getData(
                      "application/x-tichu-pass-card"
                    );
                    if (cardId) {
                      onPassLaneDrop(route.target, cardId);
                    }
                  }}
                >
                  {slotContents}
                </div>
              ) : (
                <button
                  type="button"
                  className={slotClassName}
                  aria-label={`${formatPassDirectionLabel(laneSpec.direction)} pass to ${formatSeatShort(route.targetSeat)}`}
                  onClick={() => onPassTargetSelect(route.target)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const cardId = event.dataTransfer.getData(
                      "application/x-tichu-pass-card"
                    );
                    if (cardId) {
                      onPassLaneDrop(route.target, cardId);
                    }
                  }}
                >
                  {slotContents}
                </button>
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

function NormalSeat({
  regionStyle,
  layoutMetrics,
  seatView,
  sortedLocalHand,
  localCanInteract,
  localPassInteractionEnabled,
  localLegalCardIds,
  selectedCardIds,
  onLocalCardClick
}: Pick<
  GameTableViewProps,
  | "sortedLocalHand"
  | "localCanInteract"
  | "localPassInteractionEnabled"
  | "localLegalCardIds"
  | "selectedCardIds"
  | "onLocalCardClick"
> & {
  regionStyle: CSSProperties;
  layoutMetrics: NormalViewportLayoutMetrics;
  seatView: SeatView;
}) {
  const isSideSeat =
    seatView.position === "left" || seatView.position === "right";
  const handStep =
    seatView.position === "bottom"
      ? layoutMetrics.bottomCardStep
      : isSideSeat
        ? layoutMetrics.sideCardStep
        : layoutMetrics.topCardStep;
  const handCardCount = seatView.isLocalSeat
    ? sortedLocalHand.length
    : seatView.cards.length;
  const handMarkerStyle = {
    "--normal-hand-span": `${requiredFanSpan(
      handCardCount,
      isSideSeat ? layoutMetrics.cardHeight : layoutMetrics.cardWidth,
      handStep
    )}px`,
    "--normal-tichu-offset": `${Math.max(
      10,
      Math.round(layoutMetrics.cardWidth * 0.18)
    )}px`
  } as CSSProperties;
  const handStyle = {
    "--normal-hand-step": `${handStep}px`
  } as CSSProperties;
  const remoteSeatCards =
    isSideSeat && seatView.position === "right"
      ? [...seatView.cards].reverse()
      : seatView.cards;
  const metaBlock = (
    <div
      className={
        isSideSeat ? "normal-seat__meta normal-seat__meta--side" : "normal-seat__meta"
      }
      aria-hidden="true"
    />
  );
  const renderSeatCard = (card: Card, cardIndex: number) =>
    isSideSeat ? (
      <div
        key={card.id}
        className={`normal-side-card-shell normal-side-card-shell--${seatView.position}`}
        data-seat-region-card={`${seatView.position}-${card.id}-${cardIndex}`}
      >
        <CardFace
          card={card}
          className={`normal-card normal-card--seat normal-card--seat-${seatView.position}`}
        />
      </div>
    ) : (
      <div
        key={card.id}
        className="normal-seat__card-slot"
        data-seat-region-card={`${seatView.position}-${card.id}-${cardIndex}`}
      >
        <CardFace
          card={card}
          className={`normal-card normal-card--seat normal-card--seat-${seatView.position}`}
        />
      </div>
    );
  const localHand = (
    <div className="normal-seat__body normal-seat__body--local">
      <div className="normal-seat__hand-shell" style={handMarkerStyle}>
        <div
          className="normal-seat__hand normal-seat__hand--bottom"
          style={handStyle}
        >
          {sortedLocalHand.map((card, cardIndex) => (
            <div
              key={card.id}
              className="normal-seat__card-slot"
              data-seat-region-card={`bottom-${card.id}-${cardIndex}`}
            >
              <CardFace
                card={card}
                interactive={localCanInteract}
                tone={localLegalCardIds.has(card.id) ? "legal" : "muted"}
                selected={selectedCardIds.includes(card.id)}
                className="normal-card normal-card--local normal-card--local-bottom"
                onClick={() => onLocalCardClick(card.id)}
                draggable={localPassInteractionEnabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-tichu-pass-card",
                    card.id
                  );
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  const remoteHand = (
    <div className="normal-seat__body">
      <div className="normal-seat__hand-shell" style={handMarkerStyle}>
        <div
          className={`normal-seat__hand normal-seat__hand--${seatView.position}`}
          style={handStyle}
        >
          {remoteSeatCards.map(renderSeatCard)}
        </div>
      </div>
    </div>
  );

  return (
    <section
      className={[
        "normal-seat",
        `normal-seat--${seatView.position}`,
        isSideSeat ? "normal-seat--side" : "",
        seatView.isLocalSeat ? "normal-seat--local" : "",
        seatView.isPrimarySeat ? "normal-seat--active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={regionStyle}
      data-seat-region={seatView.position}
      data-layout-container={`${seatView.position}-seat`}
    >
      <div className="normal-seat__content">
        {seatView.position === "bottom" ? (
          <>
            {seatView.isLocalSeat ? localHand : remoteHand}
            {metaBlock}
          </>
        ) : (
          <>
            {metaBlock}
            {seatView.isLocalSeat ? localHand : remoteHand}
          </>
        )}
      </div>
    </section>
  );
}

function DebugSeat({
  seatView,
  sortedLocalHand,
  localCanInteract,
  localLegalCardIds,
  selectedCardIds,
  onLocalCardClick,
  sortMode,
  localSummaryText,
  onSortModeChange
}: Pick<
  GameTableViewProps,
  | "sortedLocalHand"
  | "localCanInteract"
  | "localLegalCardIds"
  | "selectedCardIds"
  | "onLocalCardClick"
  | "sortMode"
  | "localSummaryText"
  | "onSortModeChange"
> & {
  seatView: SeatView;
}) {
  const panelClassName = [
    "seat",
    `seat--${seatView.position}`,
    seatView.isLocalSeat ? "seat--local" : "",
    seatView.isPrimarySeat ? "seat--active" : "",
    seatView.isThinkingSeat ? "seat--thinking" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={panelClassName}>
      <div className="seat__header">
        <div>
          <p className="seat__title">{seatView.title}</p>
          <strong className="seat__relation">{seatView.relation}</strong>
        </div>
        <span className="seat__count">{seatView.handCount} cards</span>
      </div>

      <div className="seat__flags">
        <SeatFlagChips
          callState={seatView.callState}
          finishIndex={seatView.finishIndex}
          passReady={seatView.passReady}
          isPrimarySeat={seatView.isPrimarySeat}
          isThinkingSeat={seatView.isThinkingSeat}
        />
      </div>

      {seatView.isLocalSeat ? (
        <div className="local-hand">
          <div className="local-hand__toolbar">
            <div className="segment-control" aria-label="Sort local hand">
              {(["rank", "suit", "combo"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    mode === sortMode
                      ? "segment-control__button is-active"
                      : "segment-control__button"
                  }
                  onClick={() => onSortModeChange(mode)}
                >
                  {mode === "combo"
                    ? "Combo"
                    : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <small>{localSummaryText}</small>
          </div>

          <div className="local-hand__cards">
            {sortedLocalHand.map((card) => (
              <CardFace
                key={card.id}
                card={card}
                interactive={localCanInteract}
                tone={localLegalCardIds.has(card.id) ? "legal" : "muted"}
                selected={selectedCardIds.includes(card.id)}
                onClick={() => onLocalCardClick(card.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="seat__body">
          <SeatCountPreview count={seatView.cards.length} />
        </div>
      )}
    </article>
  );
}

function NormalActionStrip({
  normalActionRail,
  localDragonRecipients,
  onDragonRecipientSelect,
  onNormalAction
}: Pick<
  GameTableViewProps,
  | "normalActionRail"
  | "localDragonRecipients"
  | "onDragonRecipientSelect"
  | "onNormalAction"
>) {
  return (
    <section className="normal-action-area">
      {localDragonRecipients.length > 0 ? (
        <div className="normal-action-strip">
          {localDragonRecipients.map((recipient) => (
            <button
              key={recipient}
              type="button"
              className="normal-action-button normal-action-button--primary"
              onClick={() => onDragonRecipientSelect(recipient)}
            >
              Gift to {formatSeatShort(recipient)}
            </button>
          ))}
        </div>
      ) : (
        <div className="normal-action-strip">
          {normalActionRail.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={[
                "normal-action-button",
                slot.tone === "primary"
                  ? "normal-action-button--primary"
                  : slot.tone === "secondary"
                    ? "normal-action-button--secondary"
                    : "normal-action-button--muted"
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onNormalAction(slot.id)}
              disabled={!slot.enabled}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function MatchScoreboard({
  state,
  derived,
  className = "",
  onOpenHistory
}: {
  state: GameTableViewProps["state"];
  derived: GameTableViewProps["derived"];
  className?: string;
  onOpenHistory: () => void;
}) {
  const latestHand = state.matchHistory.at(-1) ?? null;
  const team0Markers = getTeamScoreMarkers(latestHand, "team-0");
  const team1Markers = getTeamScoreMarkers(latestHand, "team-1");

  return (
    <button
      type="button"
      className={["normal-scoreboard", "normal-scoreboard--button", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Open score history"
      onClick={onOpenHistory}
    >
      <span className="normal-scoreboard__team normal-scoreboard__team--team-0">
        {team0Markers.map((marker) => (
          <span
            key={marker.key}
            className={`score-marker score-marker--${marker.tone}`}
            title={marker.detail}
          >
            {marker.label}
          </span>
        ))}
        <strong>NS {derived.matchScore["team-0"]}</strong>
      </span>
      <span className="normal-scoreboard__divider">:</span>
      <span className="normal-scoreboard__team normal-scoreboard__team--team-1">
        <strong>{derived.matchScore["team-1"]} EW</strong>
        {team1Markers.map((marker) => (
          <span
            key={marker.key}
            className={`score-marker score-marker--${marker.tone}`}
            title={marker.detail}
          >
            {marker.label}
          </span>
        ))}
      </span>
    </button>
  );
}

function DebugActionStrip({
  normalActionRail,
  localDragonRecipients,
  canContinueAi,
  onContinueAi,
  onDragonRecipientSelect,
  onNormalAction
}: Pick<
  GameTableViewProps,
  | "normalActionRail"
  | "localDragonRecipients"
  | "canContinueAi"
  | "onContinueAi"
  | "onDragonRecipientSelect"
  | "onNormalAction"
>) {
  return (
    <div className="action-buttons">
      {localDragonRecipients.length > 0
        ? localDragonRecipients.map((recipient) => (
            <button
              key={recipient}
              type="button"
              className="action-button action-button--primary"
              onClick={() => onDragonRecipientSelect(recipient)}
            >
              Gift Dragon to {formatSeatShort(recipient)}
            </button>
          ))
        : normalActionRail.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={[
                "action-button",
                slot.tone === "primary"
                  ? "action-button--primary"
                  : "action-button--secondary"
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onNormalAction(slot.id)}
              disabled={!slot.enabled}
            >
              {slot.label}
            </button>
          ))}

      {canContinueAi && (
        <button
          type="button"
          className="action-button action-button--secondary"
          onClick={onContinueAi}
        >
          Continue AI
        </button>
      )}
    </div>
  );
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const HOW_TO_PLAY_SECTIONS: ReadonlyArray<{
  title: string;
  bullets: readonly string[];
}> = [
  {
    title: "Goal",
    bullets: [
      "Tichu is a four-player partnership game. North and South play together against East and West.",
      "Win tricks, go out before the other team, and collect scoring cards to build your team total."
    ]
  },
  {
    title: "Card Ranking",
    bullets: [
      "Standard ranks run from 2 up to Ace.",
      "Mahjong is the lowest single, Phoenix is flexible, Dragon is the highest single, and Dog passes the lead to your partner."
    ]
  },
  {
    title: "Special Cards",
    bullets: [
      "Mahjong starts the lowest trick and can make a wish for a rank that players must follow if they legally can.",
      "Dog cannot win a trick. It immediately hands the lead to your partner.",
      "Phoenix can act as a wild card in many combinations or as a half-step single, but it is worth negative points at scoring.",
      "Dragon is the strongest single and scores points, but the winner must give that trick to an opponent."
    ]
  },
  {
    title: "Trick Taking",
    bullets: [
      "Players must beat the current combination with the same play type: single, pair, triple, full house, straight, or bomb.",
      "Bombs can interrupt other trick types and beat any non-bomb play. Higher bombs beat lower bombs."
    ]
  },
  {
    title: "Passing Phase",
    bullets: [
      "At the start of a round, each player passes one card left, one to partner, and one right.",
      "Use the pass lanes to assign those three cards before revealing the exchange."
    ]
  },
  {
    title: "Tichu Calls And Wishes",
    bullets: [
      "Grand Tichu is a big early call before you receive passed cards. Tichu is a later call before your first play.",
      "If you call successfully you score a bonus; if you fail, your team loses that bonus instead.",
      "Mahjong wishes force the next legal player who can satisfy the wished rank to include it in a valid play."
    ]
  },
  {
    title: "Scoring",
    bullets: [
      "5s are worth 5 points. 10s and Kings are worth 10. Dragon is worth 25. Phoenix is worth -25.",
      "Going out first matters, and a one-two finish by partners creates a large swing for the team."
    ]
  }
];

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => element.offsetParent !== null);
}

function moveFocusByStep(
  elements: HTMLElement[],
  current: HTMLElement | null,
  direction: 1 | -1
) {
  if (elements.length === 0) {
    return;
  }

  const currentIndex = current ? elements.indexOf(current) : -1;
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + elements.length) % elements.length;
  elements[nextIndex]?.focus();
}

export function GameChromeMenu({
  variant,
  isOpen,
  uiMode,
  layoutEditorActive,
  onMainMenuOpenChange,
  onUiCommand
}: {
  variant: "normal" | "debug";
  isOpen: boolean;
  uiMode: UiMode;
  layoutEditorActive: boolean;
  onMainMenuOpenChange: (open: boolean) => void;
  onUiCommand: (commandId: UiCommandId) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFirst = window.requestAnimationFrame(() => {
      itemRefs.current[0]?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      onMainMenuOpenChange(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onMainMenuOpenChange]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      onMainMenuOpenChange(true);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const elements = itemRefs.current.filter(
      (element): element is HTMLButtonElement => Boolean(element)
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocusByStep(elements, document.activeElement as HTMLElement | null, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocusByStep(elements, document.activeElement as HTMLElement | null, -1);
        break;
      case "Home":
        event.preventDefault();
        elements[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        elements[elements.length - 1]?.focus();
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      className={[
        "game-menu",
        `game-menu--${variant}`,
        isOpen ? "is-open" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="game-menu__trigger"
        aria-label={isOpen ? "Close game menu" : "Open game menu"}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => onMainMenuOpenChange(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="game-menu__trigger-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {isOpen && (
        <div
          className="game-menu__panel"
          role="menu"
          aria-label="Game menu"
          onKeyDown={handleMenuKeyDown}
        >
          {GAME_MENU_ITEMS.map((item, index) => {
            const isActive =
              (item.commandId === "toggle_debug_mode" && uiMode === "debug") ||
              (item.commandId === "toggle_table_editor" && layoutEditorActive);

            return (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                className={[
                  "game-menu__item",
                  isActive ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={isActive ? `${item.label} on` : item.label}
                onClick={() => {
                  onMainMenuOpenChange(false);
                  onUiCommand(item.commandId);
                }}
              >
                <span className="game-menu__item-copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {isActive && (
                  <span className="game-menu__item-state" aria-hidden="true">
                    ON
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModalDialog({
  title,
  onClose,
  children,
  className,
  showCloseButton = true,
  dismissOnBackdrop = true
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements(panelRef.current);
      (focusables[0] ?? panelRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const closeHotkey = findMatchingHotkey(event, ["dialogs"]);
      if (closeHotkey?.commandId) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="game-dialog-backdrop"
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={["game-dialog", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="game-dialog__header">
          <h2>{title}</h2>
          {showCloseButton ? (
            <button
              type="button"
              className="game-dialog__close"
              aria-label={`Close ${title}`}
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <div
              aria-hidden="true"
              className="game-dialog__close-placeholder"
            />
          )}
        </div>
        <div className="game-dialog__body">{children}</div>
      </div>
    </div>
  );
}

export function MahjongWishDialog({
  resolvedWishRank,
  wishSelectionOptions,
  wishConfirmDisabled,
  wishSubmissionPending,
  onWishRankSelect,
  onWishConfirm,
  onWishCancel
}: Pick<
  GameTableViewProps,
  | "resolvedWishRank"
  | "wishSelectionOptions"
  | "wishConfirmDisabled"
  | "wishSubmissionPending"
  | "onWishRankSelect"
  | "onWishConfirm"
  | "onWishCancel"
>) {
  const helperId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef(new Map<WishSelectionValue, HTMLButtonElement>());
  const selectedIndex = wishSelectionOptions.indexOf(resolvedWishRank);

  const focusList = useCallback(() => {
    listRef.current?.focus();
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (wishSelectionOptions.length === 0) {
        return;
      }

      const fallbackIndex = delta >= 0 ? 0 : wishSelectionOptions.length - 1;
      const nextIndex =
        selectedIndex === -1
          ? fallbackIndex
          : Math.min(
              Math.max(selectedIndex + delta, 0),
              wishSelectionOptions.length - 1
            );
      const nextRank = wishSelectionOptions[nextIndex];
      if (nextRank !== undefined) {
        onWishRankSelect(nextRank);
      }
    },
    [onWishRankSelect, selectedIndex, wishSelectionOptions]
  );

  useEffect(() => {
    if (resolvedWishRank === null) {
      return;
    }

    optionRefs.current.get(resolvedWishRank)?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }, [resolvedWishRank]);

  return (
    <ModalDialog
      title="Make a Wish"
      className="game-dialog--wish"
      showCloseButton={false}
      dismissOnBackdrop={false}
      onClose={onWishCancel}
    >
      <div className="mahjong-wish-dialog">
        <p id={helperId} className="mahjong-wish-dialog__helper">
          Choose the rank you wish for, or select No Wish.
        </p>

        <div className="mahjong-wish-dialog__selector-frame">
          <div
            ref={listRef}
            className="mahjong-wish-selector"
            role="listbox"
            aria-label="Wish rank"
            aria-describedby={helperId}
            aria-activedescendant={
              `mahjong-wish-option-${resolvedWishRank === null ? "none" : resolvedWishRank}`
            }
            tabIndex={0}
            onKeyDown={(event) => {
              switch (event.key) {
                case "ArrowDown":
                  event.preventDefault();
                  moveSelection(1);
                  break;
                case "ArrowUp":
                  event.preventDefault();
                  moveSelection(-1);
                  break;
                case "Enter":
                  if (!wishConfirmDisabled && !wishSubmissionPending) {
                    event.preventDefault();
                    onWishConfirm();
                  }
                  break;
                case "Escape":
                  event.preventDefault();
                  onWishCancel();
                  break;
              }
            }}
            onWheel={(event) => {
              if (event.deltaY === 0) {
                return;
              }

              event.preventDefault();
              moveSelection(event.deltaY > 0 ? 1 : -1);
            }}
          >
            {wishSelectionOptions.map((rank) => {
              const selected = rank === resolvedWishRank;
              return (
                <button
                  key={rank}
                  id={`mahjong-wish-option-${rank === null ? "none" : rank}`}
                  ref={(element) => {
                    if (element) {
                      optionRefs.current.set(rank, element);
                    } else {
                      optionRefs.current.delete(rank);
                    }
                  }}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  className={
                    [
                      rank === null
                        ? "mahjong-wish-option mahjong-wish-option--none"
                        : "mahjong-wish-option",
                      selected ? "is-selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onClick={() => {
                    onWishRankSelect(rank);
                    focusList();
                  }}
                >
                  <span className="mahjong-wish-option__label">
                    {rank === null ? "No Wish" : formatRank(rank)}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="mahjong-wish-dialog__selection-ring"
          />
        </div>

        <div className="mahjong-wish-dialog__actions">
          <button
            type="button"
            className="utility-button"
            onClick={onWishCancel}
            disabled={wishSubmissionPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="utility-button utility-button--primary mahjong-wish-dialog__confirm"
            disabled={wishConfirmDisabled || wishSubmissionPending}
            onClick={onWishConfirm}
          >
            Confirm Wish
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

function HotKeysDialogContent({
  hotkeyDefinitions
}: Pick<GameTableViewProps, "hotkeyDefinitions">) {
  return (
    <div className="hotkey-groups">
      {HOTKEY_CONTEXT_ORDER.map((context) => {
        const hotkeys = getHotkeysForContext(context, hotkeyDefinitions);
        if (hotkeys.length === 0) {
          return null;
        }

        return (
          <section key={context} className="hotkey-group">
            <h3>{HOTKEY_CONTEXT_LABELS[context]}</h3>
            <div className="hotkey-group__list">
              {hotkeys.map((hotkey) => (
                <article key={hotkey.id} className="hotkey-entry">
                  <kbd>{hotkey.comboLabel}</kbd>
                  <div className="hotkey-entry__copy">
                    <strong>{hotkey.actionLabel}</strong>
                    <p>{hotkey.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function stableDisplayJson(value: SeedJsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value, null, 2);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableDisplayJson(entry)).join(", ")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{\n${entries
    .map(
      ([key, entry]) => `  ${JSON.stringify(key)}: ${stableDisplayJson(entry)}`
    )
    .join(",\n")}\n}`;
}

function formatDuration(durationMs: number) {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(2)}s`
    : `${Math.round(durationMs)}ms`;
}

function formatEntropyTimestamp(unixTimeMs: number) {
  return new Date(unixTimeMs).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CopyableEntropyField({
  label,
  value,
  copied,
  onCopy
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="entropy-field">
      <div className="entropy-field__header">
        <strong>{label}</strong>
        <button
          type="button"
          className={copied ? "entropy-copy-button is-copied" : "entropy-copy-button"}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        className="entropy-field__input"
        value={value}
        readOnly
        rows={1}
        wrap="off"
        spellCheck={false}
      />
    </div>
  );
}

export function RandomSourcesDialogContent({
  latestEntropyDebug
}: Pick<GameTableViewProps, "latestEntropyDebug">) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedField) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedField(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [copiedField]);

  if (!latestEntropyDebug) {
    return (
      <div className="entropy-empty-state">
        <p>No random source data available yet. Start a game first.</p>
      </div>
    );
  }

  const primarySource =
    latestEntropyDebug.sources.find(
      (source) =>
        source.sourceId === latestEntropyDebug.provenance.primaryProvider
    ) ?? null;
  const generationSucceeded = latestEntropyDebug.sourceSummary.metMinimum;
  const statusTitle = generationSucceeded
    ? "Seed generation succeeded"
    : "Seed generation failed";
  const statusBody = !generationSucceeded
    ? "No valid entropy source completed the minimum path for this run."
    : latestEntropyDebug.provenance.localFallbackUsed
      ? "Remote sources timed out or were unavailable. Local cryptographic randomness completed the entropy set, and the stored final seed remains deterministic for replay."
      : latestEntropyDebug.sourceSummary.failed > 0
        ? `${primarySource?.displayName ?? "The primary source"} completed successfully, and the final seed was derived from the successful sources while unavailable providers were skipped cleanly.`
        : "All attempted sources for this run completed successfully and were combined into the final deterministic seed.";

  const copyValue = async (fieldId: string, value: string) => {
    await copyToClipboard(value);
    setCopiedField(fieldId);
  };

  return (
    <div className="entropy-dialog">
      <div className="entropy-dialog__intro">
        <p className="entropy-dialog__subtitle">Most recent seed generation</p>
      </div>

      <section className="entropy-section">
        <div
          className={[
            "entropy-status-card",
            generationSucceeded
              ? "entropy-status-card--success"
              : "entropy-status-card--failed"
          ].join(" ")}
        >
          <div className="entropy-status-card__header">
            <strong>{statusTitle}</strong>
            <span className="entropy-status-card__badge">
              {latestEntropyDebug.provenance.localFallbackUsed
                ? "Local fallback used"
                : primarySource?.displayName ?? "Primary source"}
            </span>
          </div>
          <p>{statusBody}</p>
        </div>
      </section>

      <section className="entropy-section">
        <h3>Final Values</h3>
        <div className="entropy-field-grid">
          <CopyableEntropyField
            label="Final Seed (hex)"
            value={latestEntropyDebug.finalSeedHex}
            copied={copiedField === "final-seed-hex"}
            onCopy={() =>
              void copyValue("final-seed-hex", latestEntropyDebug.finalSeedHex)
            }
          />
          <CopyableEntropyField
            label="Final Seed (base64)"
            value={latestEntropyDebug.finalSeedBase64}
            copied={copiedField === "final-seed-base64"}
            onCopy={() =>
              void copyValue(
                "final-seed-base64",
                latestEntropyDebug.finalSeedBase64
              )
            }
          />
          <CopyableEntropyField
            label="Shuffle Seed (hex)"
            value={latestEntropyDebug.shuffleSeedHex}
            copied={copiedField === "shuffle-seed-hex"}
            onCopy={() =>
              void copyValue(
                "shuffle-seed-hex",
                latestEntropyDebug.shuffleSeedHex
              )
            }
          />
          <CopyableEntropyField
            label="Audit Hash"
            value={latestEntropyDebug.auditHashHex}
            copied={copiedField === "audit-hash"}
            onCopy={() =>
              void copyValue("audit-hash", latestEntropyDebug.auditHashHex)
            }
          />
        </div>
        <div className="entropy-kv-grid">
          <div className="entropy-kv-card">
            <span>Game ID</span>
            <strong>{latestEntropyDebug.gameId}</strong>
          </div>
          <div className="entropy-kv-card">
            <span>Timestamp</span>
            <strong>
              {formatEntropyTimestamp(latestEntropyDebug.unixTimeMs)}
            </strong>
          </div>
        </div>
      </section>

      <section className="entropy-section">
        <h3>Source Summary</h3>
        <div className="entropy-summary-grid">
          <article className="entropy-summary-card">
            <span>Attempted</span>
            <strong>{latestEntropyDebug.sourceSummary.attempted}</strong>
          </article>
          <article className="entropy-summary-card">
            <span>Succeeded</span>
            <strong>{latestEntropyDebug.sourceSummary.succeeded}</strong>
          </article>
          <article className="entropy-summary-card">
            <span>Failed</span>
            <strong>{latestEntropyDebug.sourceSummary.failed}</strong>
          </article>
        </div>
      </section>

      <section className="entropy-section">
        <h3>Sources</h3>
        <div className="entropy-source-list">
          {latestEntropyDebug.sources.map((source) => (
            <article
              key={source.sourceId}
              className={source.ok ? "entropy-source" : "entropy-source is-failed"}
            >
              <div className="entropy-source__header">
                <div className="entropy-source__titles">
                  <strong>{source.displayName}</strong>
                  <span>{source.sourceId}</span>
                </div>
                <span
                  className={
                    source.ok
                      ? "entropy-source__status is-success"
                      : "entropy-source__status is-failed"
                  }
                >
                  {source.ok ? "Success" : "Failed"}
                </span>
              </div>

              <div className="entropy-source__metrics">
                <span>Weight {source.qualityWeight}</span>
                <span>{formatDuration(source.durationMs)}</span>
                <span>{source.bytesLength} bytes</span>
              </div>

              {source.previewValue ? (
                <p className="entropy-source__preview">{source.previewValue}</p>
              ) : null}

              {source.normalizedHashHex ? (
                <textarea
                  className="entropy-source__hash"
                  value={source.normalizedHashHex}
                  readOnly
                  rows={1}
                  wrap="off"
                  spellCheck={false}
                />
              ) : null}

              {source.error ? (
                <p className="entropy-source__error">{source.error}</p>
              ) : null}

              <details className="entropy-source__meta">
                <summary>Metadata</summary>
                <pre>{stableDisplayJson(source.meta)}</pre>
              </details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ScoreHistoryDialogContent({
  state
}: Pick<GameTableViewProps, "state">) {
  if (state.matchHistory.length === 0) {
    return (
      <div className="entropy-empty-state">
        <p>No completed hands yet. Finish a hand to populate score history.</p>
      </div>
    );
  }

  return (
    <div className="score-history">
      <div className="score-history__summary">
        <article className="score-history__summary-card">
          <span>Match Score</span>
          <strong>
            NS {state.matchScore["team-0"]} : {state.matchScore["team-1"]} EW
          </strong>
        </article>
        {state.matchComplete && (
          <article className="score-history__summary-card">
            <span>Status</span>
            <strong>
              {state.matchWinner
                ? `${formatTeamShort(state.matchWinner)} won the match`
                : "Match complete"}
            </strong>
          </article>
        )}
      </div>

      <div className="score-history__list">
        {state.matchHistory.map((entry) => {
          const team0Markers = getTeamScoreMarkers(entry, "team-0");
          const team1Markers = getTeamScoreMarkers(entry, "team-1");

          return (
            <article
              key={`${entry.handNumber}-${entry.roundSeed}`}
              className="score-history__entry"
            >
              <div className="score-history__entry-header">
                <strong>Hand {entry.handNumber}</strong>
                <span>
                  Finish {entry.finishOrder.map((seat) => formatSeatShort(seat)).join(" -> ")}
                </span>
              </div>

              <div className="score-history__teams">
                <div className="score-history__team score-history__team--team-0">
                  <div className="score-history__team-line">
                    <span className="score-history__team-name">NS</span>
                    <span className="score-history__team-markers">
                      {team0Markers.map((marker) => (
                        <span
                          key={marker.key}
                          className={`score-marker score-marker--${marker.tone}`}
                          title={marker.detail}
                        >
                          {marker.label}
                        </span>
                      ))}
                    </span>
                    <strong>{entry.teamScores["team-0"]}</strong>
                  </div>
                  <small>Cumulative {entry.cumulativeScores["team-0"]}</small>
                </div>

                <div className="score-history__team score-history__team--team-1">
                  <div className="score-history__team-line">
                    <span className="score-history__team-name">EW</span>
                    <strong>{entry.teamScores["team-1"]}</strong>
                    <span className="score-history__team-markers">
                      {team1Markers.map((marker) => (
                        <span
                          key={marker.key}
                          className={`score-marker score-marker--${marker.tone}`}
                          title={marker.detail}
                        >
                          {marker.label}
                        </span>
                      ))}
                    </span>
                  </div>
                  <small>Cumulative {entry.cumulativeScores["team-1"]}</small>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function HowToPlayDialogContent() {
  return (
    <div className="how-to-play">
      {HOW_TO_PLAY_SECTIONS.map((section) => (
        <section key={section.title} className="how-to-play__section">
          <h3>{section.title}</h3>
          <ul>
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatBackendStatusLabel(status: BackendReachability): string {
  switch (status.state) {
    case "checking":
      return "Checking";
    case "reachable":
      return "Reachable";
    case "unreachable":
      return "Unavailable";
    default:
      return "Not checked";
  }
}

function BackendSettingsDialogContent({
  backendSettings,
  backendStatus,
  onBackendSettingsChange,
  onTestBackend
}: Pick<
  GameTableViewProps,
  | "backendSettings"
  | "backendStatus"
  | "onBackendSettingsChange"
  | "onTestBackend"
>) {
  return (
    <div className="backend-settings-dialog">
      <p className="backend-settings-dialog__helper">
        Switch between local and server decisions, choose the backend URL, and
        control telemetry and fallback at runtime.
      </p>

      <div className="backend-settings-grid">
        <label className="backend-settings-field">
          <span>Decision Mode</span>
          <select
            value={backendSettings.decisionMode}
            onChange={(event) =>
              onBackendSettingsChange({
                ...backendSettings,
                decisionMode:
                  event.target.value === "server" ? "server" : "local"
              })
            }
          >
            <option value="local">Local heuristic</option>
            <option value="server">Server heuristic</option>
          </select>
        </label>

        <label className="backend-settings-field">
          <span>Backend Base URL</span>
          <input
            type="url"
            value={backendSettings.backendBaseUrl}
            onChange={(event) =>
              onBackendSettingsChange({
                ...backendSettings,
                backendBaseUrl: event.target.value
              })
            }
            spellCheck={false}
            placeholder="http://localhost:4310"
          />
        </label>

        <label className="backend-settings-checkbox">
          <input
            type="checkbox"
            checked={backendSettings.serverFallbackEnabled}
            onChange={(event) =>
              onBackendSettingsChange({
                ...backendSettings,
                serverFallbackEnabled: event.target.checked
              })
            }
          />
          <span>
            <strong>Server Fallback</strong>
            <small>Use the local heuristic automatically if the backend fails.</small>
          </span>
        </label>

        <label className="backend-settings-checkbox">
          <input
            type="checkbox"
            checked={backendSettings.telemetryEnabled}
            onChange={(event) =>
              onBackendSettingsChange({
                ...backendSettings,
                telemetryEnabled: event.target.checked
              })
            }
          />
          <span>
            <strong>Telemetry Enabled</strong>
            <small>Upload decision and event telemetry to the backend.</small>
          </span>
        </label>
      </div>

      <div className="backend-settings-status">
        <div
          className={[
            "backend-settings-status__badge",
            `is-${backendStatus.state}`
          ].join(" ")}
        >
          {formatBackendStatusLabel(backendStatus)}
        </div>
        <div className="backend-settings-status__copy">
          <strong>Backend status</strong>
          <small>
            {backendStatus.detail ??
              "Use Test Backend to confirm health and database reachability."}
          </small>
          {backendStatus.checkedAt ? (
            <small>Last checked {new Date(backendStatus.checkedAt).toLocaleString()}</small>
          ) : null}
        </div>
        <button
          type="button"
          className="backend-settings-status__test"
          onClick={onTestBackend}
          disabled={backendStatus.state === "checking"}
        >
          {backendStatus.state === "checking" ? "Testing..." : "Test Backend"}
        </button>
      </div>
    </div>
  );
}

function GameDialogLayer({
  activeDialog,
  state,
  latestEntropyDebug,
  backendSettings,
  backendStatus,
  hotkeyDefinitions,
  onBackendSettingsChange,
  onTestBackend,
  onUiCommand
}: Pick<
  GameTableViewProps,
  | "activeDialog"
  | "state"
  | "latestEntropyDebug"
  | "backendSettings"
  | "backendStatus"
  | "hotkeyDefinitions"
  | "onBackendSettingsChange"
  | "onTestBackend"
  | "onUiCommand"
>) {
  if (!activeDialog) {
    return null;
  }

  return activeDialog === "hotkeys" ? (
    <ModalDialog
      title="Hot Keys"
      className="game-dialog--hotkeys"
      onClose={() => onUiCommand("close_active_overlay")}
    >
      <HotKeysDialogContent hotkeyDefinitions={hotkeyDefinitions} />
    </ModalDialog>
  ) : activeDialog === "random_sources" ? (
    <ModalDialog
      title="Random Sources"
      className="game-dialog--entropy"
      onClose={() => onUiCommand("close_active_overlay")}
    >
      <RandomSourcesDialogContent latestEntropyDebug={latestEntropyDebug} />
    </ModalDialog>
  ) : activeDialog === "score_history" ? (
    <ModalDialog
      title="Score History"
      className="game-dialog--score-history"
      onClose={() => onUiCommand("close_active_overlay")}
    >
      <ScoreHistoryDialogContent state={state} />
    </ModalDialog>
  ) : activeDialog === "backend_settings" ? (
    <ModalDialog
      title="Backend Settings"
      className="game-dialog--backend-settings"
      onClose={() => onUiCommand("close_active_overlay")}
    >
      <BackendSettingsDialogContent
        backendSettings={backendSettings}
        backendStatus={backendStatus}
        onBackendSettingsChange={onBackendSettingsChange}
        onTestBackend={onTestBackend}
      />
    </ModalDialog>
  ) : (
    <ModalDialog
      title="How To Play Tichu"
      className="game-dialog--rules"
      onClose={() => onUiCommand("close_active_overlay")}
    >
      <HowToPlayDialogContent />
    </ModalDialog>
  );
}

type EditorDragState = {
  elementId: NormalLayoutElementId;
  startPointerX: number;
  startPointerY: number;
  startCenter: AnchorPoint;
  boardRect: ReturnType<typeof getBoardBounds>;
  surfaceRect: DOMRect;
};

export function NormalLayoutEditor({
  normalTableLayout,
  seatViews,
  sortedLocalHand,
  layoutMetrics,
  onNormalTableLayoutChange,
  onNormalTableLayoutImport,
  onExportNormalTableLayout,
  hotkeyDefinitions
}: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "seatViews"
  | "sortedLocalHand"
  | "onNormalTableLayoutChange"
  | "onNormalTableLayoutImport"
  | "onExportNormalTableLayout"
  | "hotkeyDefinitions"
> & {
  layoutMetrics: NormalViewportLayoutMetrics;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<EditorDragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedElementId, setSelectedElementId] =
    useState<NormalLayoutElementId>("southHand");
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const editorHotkeys = getHotkeysForContext("table_editor", hotkeyDefinitions);

  function snapElementPosition(
    elementId: NormalLayoutElementId,
    boardRect: ReturnType<typeof getBoardBounds>,
    centerX: number,
    centerY: number
  ) {
    const spec = NORMAL_LAYOUT_ELEMENT_SPECS[elementId];
    const halfWidth = spec.width / 2;
    const halfHeight = spec.height / 2;
    const clampedX = Math.min(
      boardRect.right - halfWidth,
      Math.max(boardRect.left + halfWidth, centerX)
    );
    const clampedY = Math.min(
      boardRect.bottom - halfHeight,
      Math.max(boardRect.top + halfHeight, centerY)
    );
    const snappedX = Math.round(clampedX / 10) * 10;
    const snappedY = Math.round(clampedY / 10) * 10;

    return {
      x: clamp01((snappedX - boardRect.left) / boardRect.width),
      y: clamp01((snappedY - boardRect.top) / boardRect.height)
    };
  }

  const moveSelectedBy = useCallback(
    (deltaX: number, deltaY: number) => {
      const selectedVisual = resolveNormalEditorElementVisual({
        elementId: selectedElementId,
        normalTableLayout,
        layoutMetrics,
        seatViews,
        sortedLocalHand
      });
      const next = snapElementPosition(
        selectedElementId,
        getBoardBounds(layoutMetrics),
        selectedVisual.center.x + deltaX,
        selectedVisual.center.y + deltaY
      );
      onNormalTableLayoutChange(
        updateLayoutElement(normalTableLayout, selectedElementId, next)
      );
    },
    [
      layoutMetrics,
      normalTableLayout,
      onNormalTableLayoutChange,
      seatViews,
      selectedElementId,
      sortedLocalHand
    ]
  );

  const rotateSelectedBy = useCallback(
    (deltaRotation: number) => {
      const current = normalTableLayout[selectedElementId];
      onNormalTableLayoutChange(
        updateLayoutElement(normalTableLayout, selectedElementId, {
          rotation: current.rotation + deltaRotation
        })
      );
    },
    [normalTableLayout, onNormalTableLayoutChange, selectedElementId]
  );

  const cycleSelectedElement = useCallback(
    (delta: number) => {
      const currentIndex =
        NORMAL_LAYOUT_EDITOR_ORDER.indexOf(selectedElementId);
      const nextIndex =
        (currentIndex + delta + NORMAL_LAYOUT_EDITOR_ORDER.length) %
        NORMAL_LAYOUT_EDITOR_ORDER.length;
      const nextElementId = NORMAL_LAYOUT_EDITOR_ORDER[nextIndex];
      if (nextElementId) {
        setSelectedElementId(nextElementId);
      }
    },
    [selectedElementId]
  );

  const selectedElementVisual = resolveNormalEditorElementVisual({
    elementId: selectedElementId,
    normalTableLayout,
    layoutMetrics,
    seatViews,
    sortedLocalHand
  });
  const opposingElementId =
    NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS[selectedElementId] ?? null;
  const opposingElement = opposingElementId
    ? normalTableLayout[opposingElementId]
    : null;
  const opposingElementVisual = opposingElementId
    ? resolveNormalEditorElementVisual({
        elementId: opposingElementId,
        normalTableLayout,
        layoutMetrics,
        seatViews,
        sortedLocalHand
      })
    : null;
  const surfaceRect = surfaceRef.current?.getBoundingClientRect() ?? null;
  const xAlignmentThreshold = surfaceRect ? 5 : 0.5;
  const yAlignmentThreshold = surfaceRect ? 5 : 0.5;
  const hasVerticalAlignment = Boolean(
    opposingElementVisual &&
    Math.abs(selectedElementVisual.center.x - opposingElementVisual.center.x) <=
      xAlignmentThreshold
  );
  const hasHorizontalAlignment = Boolean(
    opposingElementVisual &&
    Math.abs(selectedElementVisual.center.y - opposingElementVisual.center.y) <=
      yAlignmentThreshold
  );
  const verticalGuideState = hasVerticalAlignment
    ? hasHorizontalAlignment
      ? "both"
      : "vertical"
    : "idle";
  const horizontalGuideState = hasHorizontalAlignment
    ? hasVerticalAlignment
      ? "both"
      : "horizontal"
    : "idle";

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.startPointerX;
      const deltaY = event.clientY - dragState.startPointerY;
      const next = snapElementPosition(
        dragState.elementId,
        dragState.boardRect,
        dragState.startCenter.x + deltaX,
        dragState.startCenter.y + deltaY
      );

      onNormalTableLayoutChange(
        updateLayoutElement(normalTableLayout, dragState.elementId, next)
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [normalTableLayout, onNormalTableLayoutChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchedHotkey = findMatchingHotkey(
        event,
        ["table_editor"],
        hotkeyDefinitions
      );
      if (!matchedHotkey) {
        return;
      }

      event.preventDefault();

      switch (matchedHotkey.id) {
        case "toggle_layout_guides":
          setGuidesVisible((current) => !current);
          break;
        case "toggle_layout_inspector":
          setInspectorVisible((current) => !current);
          break;
        case "export_layout_json":
          onExportNormalTableLayout();
          break;
        case "next_layout_element":
          cycleSelectedElement(1);
          break;
        case "previous_layout_element":
          cycleSelectedElement(-1);
          break;
        case "nudge_layout_element":
        case "nudge_layout_element_fast": {
          const step = matchedHotkey.id === "nudge_layout_element_fast" ? 50 : 10;

          switch (event.key) {
            case "ArrowUp":
              moveSelectedBy(0, -step);
              break;
            case "ArrowDown":
              moveSelectedBy(0, step);
              break;
            case "ArrowLeft":
              moveSelectedBy(-step, 0);
              break;
            case "ArrowRight":
              moveSelectedBy(step, 0);
              break;
          }
          break;
        }
        case "rotate_layout_element_ccw":
          rotateSelectedBy(-15);
          break;
        case "rotate_layout_element_cw":
          rotateSelectedBy(15);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cycleSelectedElement,
    hotkeyDefinitions,
    moveSelectedBy,
    onExportNormalTableLayout,
    rotateSelectedBy
  ]);

  function startDrag(
    elementId: NormalLayoutElementId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    setSelectedElementId(elementId);
    const elementVisual = resolveNormalEditorElementVisual({
      elementId,
      normalTableLayout,
      layoutMetrics,
      seatViews,
      sortedLocalHand
    });
    dragStateRef.current = {
      elementId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startCenter: elementVisual.center,
      boardRect: getBoardBounds(layoutMetrics),
      surfaceRect: surface.getBoundingClientRect()
    };
  }

  async function handleLayoutFileSelection(
    event: ReactChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const nextConfig = parseNormalTableLayoutConfigText(await file.text());
      if (!nextConfig) {
        throw new Error("Invalid layout payload");
      }

      onNormalTableLayoutImport(nextConfig);
    } catch {
      window.alert("Could not load that layout JSON.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div
      ref={surfaceRef}
      className="normal-layout-editor"
      aria-label="Table layout editor"
    >
      {guidesVisible && (
        <>
          <div
            className={[
              "normal-layout-editor__guideline",
              "normal-layout-editor__guideline--vertical",
              `normal-layout-editor__guideline-state--${verticalGuideState}`
            ].join(" ")}
            style={{ left: `${selectedElementVisual.center.x}px` }}
          />
          <div
            className={[
              "normal-layout-editor__guideline",
              "normal-layout-editor__guideline--horizontal",
              `normal-layout-editor__guideline-state--${horizontalGuideState}`
            ].join(" ")}
            style={{ top: `${selectedElementVisual.center.y}px` }}
          />
          {opposingElement && opposingElementId && opposingElementVisual && (
            <>
              <div
                className={[
                  "normal-layout-editor__guideline",
                  "normal-layout-editor__guideline--vertical",
                  `normal-layout-editor__guideline-state--${verticalGuideState}`
                ].join(" ")}
                style={{ left: `${opposingElementVisual.center.x}px` }}
              />
              <div
                className={[
                  "normal-layout-editor__guideline",
                  "normal-layout-editor__guideline--horizontal",
                  `normal-layout-editor__guideline-state--${horizontalGuideState}`
                ].join(" ")}
                style={{ top: `${opposingElementVisual.center.y}px` }}
              />
              <div
                className="normal-layout-editor__opposing"
                style={opposingElementVisual.style}
              >
                <span className="normal-layout-editor__opposing-name">
                  Opposing:{" "}
                  {NORMAL_LAYOUT_ELEMENT_SPECS[opposingElementId].label}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {NORMAL_LAYOUT_EDITOR_ORDER.map((elementId) => {
        const editorElementVisual = resolveNormalEditorElementVisual({
          elementId,
          normalTableLayout,
          layoutMetrics,
          seatViews,
          sortedLocalHand
        });
        const isSelected = elementId === selectedElementId;
        const spec = NORMAL_LAYOUT_ELEMENT_SPECS[elementId];

        return (
          <button
            key={elementId}
            type="button"
            className={
              isSelected
                ? "normal-layout-editor__element is-selected"
                : "normal-layout-editor__element"
            }
            style={editorElementVisual.style}
            onClick={() => setSelectedElementId(elementId)}
            onPointerDown={(event) => startDrag(elementId, event)}
          >
            <span className="normal-layout-editor__element-name">
              {spec.label}
            </span>
            {isSelected && (
              <span className="normal-layout-editor__element-handle" />
            )}
          </button>
        );
      })}

      <input
        ref={fileInputRef}
        className="normal-layout-editor__file-input"
        type="file"
        accept=".json,.xml,application/json,text/xml,application/xml"
        onChange={handleLayoutFileSelection}
      />

      {inspectorVisible && (
        <aside className="normal-layout-editor__inspector">
          <strong>
            {NORMAL_LAYOUT_ELEMENT_SPECS[selectedElementId].label}
          </strong>
          <span>
            x {normalTableLayout[selectedElementId].x.toFixed(3)} | y{" "}
            {normalTableLayout[selectedElementId].y.toFixed(3)}
          </span>
          <span>
            rotation {normalTableLayout[selectedElementId].rotation}deg
          </span>
          <div className="normal-layout-editor__controls">
            <button type="button" onClick={() => cycleSelectedElement(-1)}>
              Prev
            </button>
            <button type="button" onClick={() => cycleSelectedElement(1)}>
              Next
            </button>
            <button type="button" onClick={() => rotateSelectedBy(-15)}>
              Rotate -15
            </button>
            <button type="button" onClick={() => rotateSelectedBy(15)}>
              Rotate +15
            </button>
            <button
              type="button"
              onClick={() => setGuidesVisible((current) => !current)}
            >
              {guidesVisible ? "Hide Guides" : "Show Guides"}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Load Layout
            </button>
            <button
              type="button"
              onClick={() =>
                onNormalTableLayoutChange(
                  updateLayoutElement(
                    normalTableLayout,
                    selectedElementId,
                    DEFAULT_NORMAL_TABLE_LAYOUT[selectedElementId]
                  )
                )
              }
            >
              Reset Selected
            </button>
            <button
              type="button"
              onClick={() =>
                onNormalTableLayoutImport(DEFAULT_NORMAL_TABLE_LAYOUT_CONFIG)
              }
            >
              Reset All
            </button>
          </div>
          <div
            className="normal-layout-editor__legend"
            aria-label="Alignment guide legend"
          >
            <span className="normal-layout-editor__legend-item">
              <span className="normal-layout-editor__legend-swatch normal-layout-editor__legend-swatch--vertical" />
              Red = vertical
            </span>
            <span className="normal-layout-editor__legend-item">
              <span className="normal-layout-editor__legend-swatch normal-layout-editor__legend-swatch--horizontal" />
              Yellow = horizontal
            </span>
            <span className="normal-layout-editor__legend-item">
              <span className="normal-layout-editor__legend-swatch normal-layout-editor__legend-swatch--both" />
              Green = both
            </span>
          </div>
          <div className="normal-layout-editor__hotkeys">
            {editorHotkeys.map((hotkey) => (
              <span
                key={hotkey.id}
                className="normal-layout-editor__hotkey"
              >
                <kbd>{hotkey.comboLabel}</kbd>
                <span>{hotkey.actionLabel}</span>
              </span>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

type NormalLayoutFailure = {
  code: string;
  message: string;
  metrics: Record<string, number | string>;
};

function createNormalLayoutFailureSignature(failures: NormalLayoutFailure[]) {
  return failures
    .map(
      (failure) => `${failure.code}:${JSON.stringify(failure.metrics)}`
    )
    .join("|");
}

function useNormalLayoutDiagnostics(config: {
  rootRef: { current: HTMLElement | null };
  dependencyKey: string;
}) {
  const [failures, setFailures] = useState<NormalLayoutFailure[]>([]);
  const lastSignatureRef = useRef("");

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const root = config.rootRef.current;
    if (!root) {
      return;
    }

    let frameId = 0;

    const runChecks = () => {
      frameId = 0;

      const nextFailures: NormalLayoutFailure[] = [];
      const docElement = document.documentElement;
      const viewportLabel = `${window.innerWidth}x${window.innerHeight}`;

      if (docElement.scrollHeight > window.innerHeight + 1) {
        nextFailures.push({
          code: "document-height",
          message: "Document scroll height exceeds the viewport height.",
          metrics: {
            viewport: viewportLabel,
            scrollHeight: docElement.scrollHeight,
            innerHeight: window.innerHeight
          }
        });
      }

      if (docElement.scrollWidth > window.innerWidth + 1) {
        nextFailures.push({
          code: "document-width",
          message: "Document scroll width exceeds the viewport width.",
          metrics: {
            viewport: viewportLabel,
            scrollWidth: docElement.scrollWidth,
            innerWidth: window.innerWidth
          }
        });
      }

      const containers = [
        root,
        ...root.querySelectorAll<HTMLElement>("[data-layout-container]")
      ];

      for (const container of containers) {
        const containerName =
          container.dataset.layoutContainer ?? "normal-root";
        const allowsAttachedIdentityOverflow =
          containerName === "left-seat" || containerName === "right-seat";

        if (container.scrollHeight > container.clientHeight + 1) {
          nextFailures.push({
            code: `container-height-${containerName}`,
            message: "A game container is vertically scrolling.",
            metrics: {
              viewport: viewportLabel,
              container: containerName,
              scrollHeight: container.scrollHeight,
              clientHeight: container.clientHeight
            }
          });
        }

        if (
          !allowsAttachedIdentityOverflow &&
          container.scrollWidth > container.clientWidth + 1
        ) {
          nextFailures.push({
            code: `container-width-${containerName}`,
            message: "A game container is horizontally scrolling.",
            metrics: {
              viewport: viewportLabel,
              container: containerName,
              scrollWidth: container.scrollWidth,
              clientWidth: container.clientWidth
            }
          });
        }
      }

      root.querySelectorAll<HTMLElement>("[data-seat-region]").forEach((seat) => {
        const seatRect = seat.getBoundingClientRect();
        const seatName = seat.dataset.seatRegion ?? "unknown-seat";

        seat
          .querySelectorAll<HTMLElement>("[data-seat-region-card]")
          .forEach((card) => {
            const cardRect = card.getBoundingClientRect();

            if (
              cardRect.top < seatRect.top - 1 ||
              cardRect.right > seatRect.right + 1 ||
              cardRect.bottom > seatRect.bottom + 1 ||
              cardRect.left < seatRect.left - 1
            ) {
              nextFailures.push({
                code: `seat-card-${seatName}-${card.dataset.seatRegionCard ?? "card"}`,
                message: "A seat card escaped its region bounds.",
                metrics: {
                  viewport: viewportLabel,
                  seat: seatName,
                  cardTop: cardRect.top,
                  cardRight: cardRect.right,
                  cardBottom: cardRect.bottom,
                  cardLeft: cardRect.left,
                  seatTop: seatRect.top,
                  seatRight: seatRect.right,
                  seatBottom: seatRect.bottom,
                  seatLeft: seatRect.left
                }
              });
            }
          });
      });

      const actionRow = root.querySelector<HTMLElement>("[data-action-row]");
      if (actionRow) {
        const actionRect = actionRow.getBoundingClientRect();

        if (actionRect.bottom > window.innerHeight + 1) {
          nextFailures.push({
            code: "action-row-bottom",
            message: "The action row fell below the viewport.",
            metrics: {
              viewport: viewportLabel,
              actionBottom: actionRect.bottom,
              innerHeight: window.innerHeight
            }
          });
        }
      }

      const centerZone = root.querySelector<HTMLElement>(
        "[data-layout-container='center-zone']"
      );
      const passLaneBounds =
        root.querySelector<HTMLElement>("[data-layout-container='board']") ??
        centerZone;
      const referenceCard =
        root.querySelector<HTMLElement>(".normal-card--local") ??
        root.querySelector<HTMLElement>(".normal-seat__hand--bottom .normal-card--seat") ??
        root.querySelector<HTMLElement>(".normal-card--seat");
      if (passLaneBounds) {
        const passLaneBoundsRect = passLaneBounds.getBoundingClientRect();
        const referenceCardRect = referenceCard?.getBoundingClientRect() ?? null;

        root.querySelectorAll<HTMLElement>("[data-pass-lane]").forEach((lane) => {
          const laneRect = lane.getBoundingClientRect();
          const laneName = lane.dataset.passLane ?? "pass-lane";

          if (
            laneRect.top < passLaneBoundsRect.top - 1 ||
            laneRect.right > passLaneBoundsRect.right + 1 ||
            laneRect.bottom > passLaneBoundsRect.bottom + 1 ||
            laneRect.left < passLaneBoundsRect.left - 1
          ) {
            nextFailures.push({
              code: `pass-lane-board-${laneName}`,
              message: "A pass lane escaped the table board.",
              metrics: {
                viewport: viewportLabel,
                lane: laneName,
                laneTop: laneRect.top,
                laneRight: laneRect.right,
                laneBottom: laneRect.bottom,
                laneLeft: laneRect.left,
                boardTop: passLaneBoundsRect.top,
                boardRight: passLaneBoundsRect.right,
                boardBottom: passLaneBoundsRect.bottom,
                boardLeft: passLaneBoundsRect.left
              }
            });
          }

          if (
            referenceCardRect &&
            (laneRect.width > referenceCardRect.width + 1 ||
              laneRect.height > referenceCardRect.height + 1)
          ) {
            nextFailures.push({
              code: `pass-lane-size-${laneName}`,
              message: "A pass lane grew larger than a hand card.",
              metrics: {
                viewport: viewportLabel,
                lane: laneName,
                laneWidth: laneRect.width,
                laneHeight: laneRect.height,
                cardWidth: referenceCardRect.width,
                cardHeight: referenceCardRect.height
              }
            });
          }
        });
      }

      const nextSignature = createNormalLayoutFailureSignature(nextFailures);

      if (
        nextFailures.length > 0 &&
        nextSignature !== lastSignatureRef.current
      ) {
        nextFailures.forEach((failure) => {
          console.error(`[normal-layout] ${failure.message}`, failure.metrics);
        });
      }

      lastSignatureRef.current = nextSignature;
      setFailures(nextFailures);
    };

    const scheduleChecks = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(runChecks);
    };

    scheduleChecks();

    const observer = new ResizeObserver(() => scheduleChecks());
    observer.observe(root);
    window.addEventListener("resize", scheduleChecks);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleChecks);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [config.dependencyKey, config.rootRef]);

  return failures;
}

export function NormalGameTableView(props: GameTableViewProps) {
  useNormalViewportLock();

  const { ref: viewportRef, size: viewportSize } =
    useElementSize<HTMLElement>();
  const seatByPosition = Object.fromEntries(
    props.seatViews.map((seatView) => [seatView.position, seatView])
  ) as Record<SeatVisualPosition, SeatView>;
  const layoutMetrics = computeNormalViewportLayoutMetrics({
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    topCount: seatByPosition.top.cards.length,
    bottomCount: props.sortedLocalHand.length,
    leftCount: seatByPosition.left.cards.length,
    rightCount: seatByPosition.right.cards.length,
    hasVariantPicker: props.matchingPlayActions.length > 1,
    hasWishPicker: Boolean(props.activePlayVariant?.availableWishRanks)
  });
  const seatRegionStyleByPosition = {
    top: resolveNormalSeatRegionStyle({
      position: "top",
      normalTableLayout: props.normalTableLayout,
      layoutMetrics,
      handCardCount: seatByPosition.top.cards.length
    }),
    right: resolveNormalSeatRegionStyle({
      position: "right",
      normalTableLayout: props.normalTableLayout,
      layoutMetrics,
      handCardCount: seatByPosition.right.cards.length
    }),
    bottom: resolveNormalSeatRegionStyle({
      position: "bottom",
      normalTableLayout: props.normalTableLayout,
      layoutMetrics,
      handCardCount: props.sortedLocalHand.length
    }),
    left: resolveNormalSeatRegionStyle({
      position: "left",
      normalTableLayout: props.normalTableLayout,
      layoutMetrics,
      handCardCount: seatByPosition.left.cards.length
    })
  } as const;
  const playSurfaceRegionStyle = resolveNormalPlaySurfaceRegionStyle({
    normalTableLayout: props.normalTableLayout,
    layoutMetrics
  });
  const actionRowRegionStyle = resolveNormalActionRowRegionStyle({
    normalTableLayout: props.normalTableLayout,
    layoutMetrics
  });
  const layoutStyle = {
    ...normalTableLayoutTokenStyle(props.normalTableLayoutTokens),
    "--normal-shell-pad-x": `${layoutMetrics.shellPaddingX}px`,
    "--normal-shell-pad-y": `${layoutMetrics.shellPaddingY}px`,
    "--normal-band-gap": `${layoutMetrics.bandGap}px`,
    "--normal-header-height": `${layoutMetrics.headerHeight}px`,
    "--normal-north-height": `${layoutMetrics.northBandHeight}px`,
    "--normal-south-height": `${layoutMetrics.southBandHeight}px`,
    "--normal-action-height": `${layoutMetrics.actionBandHeight}px`,
    "--normal-side-column-width": `${layoutMetrics.sideColumnWidth}px`,
    "--normal-center-column-width": `${layoutMetrics.centerColumnWidth}px`,
    "--normal-seat-inset-x": `${layoutMetrics.seatInsetX}px`,
    "--normal-center-inset": `${layoutMetrics.centerInset}px`,
    "--normal-card-width": `${layoutMetrics.cardWidth}px`,
    "--normal-card-height": `${layoutMetrics.cardHeight}px`,
    "--normal-route-card-width": `${layoutMetrics.routeCardWidth}px`,
    "--normal-route-card-height": `${layoutMetrics.routeCardHeight}px`,
    "--normal-selected-lift": `${layoutMetrics.selectedLift}px`,
    "--normal-top-card-step": `${layoutMetrics.topCardStep}px`,
    "--normal-bottom-card-step": `${layoutMetrics.bottomCardStep}px`,
    "--normal-side-card-step": `${layoutMetrics.sideCardStep}px`
  } as CSSProperties;
  useNormalLayoutDiagnostics({
    rootRef: viewportRef,
    dependencyKey: [
      viewportSize.width,
      viewportSize.height,
      props.state.phase,
      props.sortedLocalHand.length,
      props.selectedCardIds.length,
      props.matchingPlayActions.length,
      props.activePlayVariant?.availableWishRanks?.length ?? 0,
      props.passRouteViews.length
    ].join(":")
  });

  return (
    <main className="tabletop-app tabletop-app--normal">
      <section
        ref={viewportRef}
        className="normal-viewport"
        style={layoutStyle}
        data-layout-container="normal-viewport"
      >
        <div className="normal-viewport__board" data-layout-container="board">
          <GameChromeMenu
            variant="normal"
            isOpen={props.mainMenuOpen}
            uiMode={props.uiMode}
            layoutEditorActive={props.layoutEditorActive}
            onMainMenuOpenChange={props.onMainMenuOpenChange}
            onUiCommand={props.onUiCommand}
          />
          {props.derived.currentWish !== null && (
            <div className="normal-active-wish" aria-live="polite">
              <span className="normal-active-wish__label">Active wish</span>
              <span className="wish-chip wish-chip--table">
                {formatRank(props.derived.currentWish)}
              </span>
            </div>
          )}
          <div
            className="normal-scoreboard-anchor"
            style={resolveNormalBoardAnchorStyle(
              props.normalTableLayout.scoreBadge,
              layoutMetrics
            )}
          >
            <MatchScoreboard
              state={props.state}
              derived={props.derived}
              onOpenHistory={() =>
                props.onUiCommand("open_score_history_dialog")
              }
            />
          </div>

          <div className="normal-grid" data-layout-container="table-grid">
            <section
              className={getNormalCenterZoneClassName(props.layoutEditorActive)}
              data-layout-container="center-zone"
              style={playSurfaceRegionStyle}
            >
              {shouldRenderNormalCenterZoneFelt(props.layoutEditorActive) && (
                <div className="normal-table__felt" />
              )}
              <TableSurface
                variant="normal"
                normalTableLayout={props.normalTableLayout}
                state={props.state}
                derived={props.derived}
                controlHint={props.controlHint}
                displayedTrick={props.displayedTrick}
                trickIsResolving={props.trickIsResolving}
                seatRelativePlays={props.seatRelativePlays}
                tablePassGroups={props.tablePassGroups}
                cardLookup={props.cardLookup}
              />
            </section>

            <NormalSeat
              regionStyle={seatRegionStyleByPosition.top}
              layoutMetrics={layoutMetrics}
              seatView={seatByPosition.top}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localPassInteractionEnabled={props.localPassInteractionEnabled}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />

            <NormalSeat
              regionStyle={seatRegionStyleByPosition.left}
              layoutMetrics={layoutMetrics}
              seatView={seatByPosition.left}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localPassInteractionEnabled={props.localPassInteractionEnabled}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />

            <NormalSeat
              regionStyle={seatRegionStyleByPosition.right}
              layoutMetrics={layoutMetrics}
              seatView={seatByPosition.right}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localPassInteractionEnabled={props.localPassInteractionEnabled}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />

            <NormalSeat
              regionStyle={seatRegionStyleByPosition.bottom}
              layoutMetrics={layoutMetrics}
              seatView={seatByPosition.bottom}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localPassInteractionEnabled={props.localPassInteractionEnabled}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />

            <section
              className="normal-bottom-controls"
              data-layout-container="action-band"
              data-action-row="true"
              style={actionRowRegionStyle}
            >
              {props.matchingPlayActions.length > 1 && (
                <div className="normal-inline-controls">
                  <div className="variant-row variant-row--normal">
                    {props.matchingPlayActions.map((action) => {
                      const key = buildPlayVariantKey(action);
                      const activeKey = props.activePlayVariant
                        ? buildPlayVariantKey(props.activePlayVariant)
                        : key;

                      return (
                        <button
                          key={key}
                          type="button"
                          className={
                            key === activeKey
                              ? "variant-pill is-active"
                              : "variant-pill"
                          }
                          onClick={() => props.onVariantSelect(key)}
                        >
                          {formatCombinationKind(action.combination.kind)}
                          {action.phoenixAsRank
                            ? ` as ${formatRank(action.phoenixAsRank)}`
                            : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <NormalActionStrip
                normalActionRail={props.normalActionRail}
                localDragonRecipients={props.localDragonRecipients}
                onDragonRecipientSelect={props.onDragonRecipientSelect}
                onNormalAction={props.onNormalAction}
              />
            </section>
          </div>

          <NormalSeatOverlayLayer
            seatViews={props.seatViews}
            sortedLocalHand={props.sortedLocalHand}
            layoutMetrics={layoutMetrics}
            normalTableLayout={props.normalTableLayout}
          />

          <NormalPassStagingRegions
            normalTableLayout={props.normalTableLayout}
            layoutMetrics={layoutMetrics}
            seatViews={props.seatViews}
            sortedLocalHand={props.sortedLocalHand}
            passRouteViews={props.passRouteViews}
            selectedPassTarget={props.selectedPassTarget}
            cardLookup={props.cardLookup}
            onPassTargetSelect={props.onPassTargetSelect}
            onPassLaneDrop={props.onPassLaneDrop}
            onPassLaneCardClick={props.onPassLaneCardClick}
            onPassLaneCardDragStart={props.onPassLaneCardDragStart}
            onPassLaneCardDragEnd={props.onPassLaneCardDragEnd}
          />

          <NormalTrickStagingRegions
            normalTableLayout={props.normalTableLayout}
            layoutMetrics={layoutMetrics}
            displayedTrick={props.displayedTrick}
            seatRelativePlays={props.seatRelativePlays}
            pickupStageViews={props.pickupStageViews}
            dogLeadAnimation={props.dogLeadAnimation}
            cardLookup={props.cardLookup}
          />

          {props.layoutEditorActive && (
            <NormalLayoutEditor
              normalTableLayout={props.normalTableLayout}
              seatViews={props.seatViews}
              sortedLocalHand={props.sortedLocalHand}
              layoutMetrics={layoutMetrics}
              onNormalTableLayoutChange={props.onNormalTableLayoutChange}
              onNormalTableLayoutImport={props.onNormalTableLayoutImport}
              onExportNormalTableLayout={props.onExportNormalTableLayout}
              hotkeyDefinitions={props.hotkeyDefinitions}
            />
          )}

          <GameDialogLayer
            activeDialog={props.activeDialog}
            state={props.state}
            latestEntropyDebug={props.latestEntropyDebug}
            backendSettings={props.backendSettings}
            backendStatus={props.backendStatus}
            hotkeyDefinitions={props.hotkeyDefinitions}
            onBackendSettingsChange={props.onBackendSettingsChange}
            onTestBackend={props.onTestBackend}
            onUiCommand={props.onUiCommand}
          />
          {props.wishDialogOpen ? (
            <MahjongWishDialog
              resolvedWishRank={props.resolvedWishRank}
              wishSelectionOptions={props.wishSelectionOptions}
              wishConfirmDisabled={props.wishConfirmDisabled}
              wishSubmissionPending={props.wishSubmissionPending}
              onWishRankSelect={props.onWishRankSelect}
              onWishConfirm={props.onWishConfirm}
              onWishCancel={props.onWishCancel}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function DebugGameTableView(props: GameTableViewProps) {
  return (
    <main className="tabletop-app">
      <header className="topbar">
        <div className="topbar__intro">
          <GameChromeMenu
            variant="debug"
            isOpen={props.mainMenuOpen}
            uiMode={props.uiMode}
            layoutEditorActive={props.layoutEditorActive}
            onMainMenuOpenChange={props.onMainMenuOpenChange}
            onUiCommand={props.onUiCommand}
          />
          <p className="topbar__eyebrow">Debug / AI Mode</p>
          <h1>Tichu Table</h1>
          <p className="topbar__summary">
            Shared live game state with richer AI rationale, legality, and
            engine metadata. Press Ctrl+D to return to the normal table.
          </p>
        </div>

        <div className="topbar__status-grid">
          <section className="status-card">
            <span className="status-card__label">Seed</span>
            <strong>{props.roundSeed}</strong>
            <small>{props.decisionCount} engine decisions applied</small>
          </section>
          <section className="status-card">
            <span className="status-card__label">Phase</span>
            <strong>{props.derived.phase}</strong>
            <small>{props.controlHint}</small>
          </section>
          <section className="status-card">
            <span className="status-card__label">Scoreboard</span>
            <MatchScoreboard
              state={props.state}
              derived={props.derived}
              className="normal-scoreboard--debug"
              onOpenHistory={() =>
                props.onUiCommand("open_score_history_dialog")
              }
            />
            <small>Shared engine state</small>
          </section>
        </div>

        <div className="topbar__controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.autoplayLocal}
              onChange={(event) => props.onAutoplayChange(event.target.checked)}
            />
            <span>Autoplay local seat</span>
          </label>

          <button
            type="button"
            className="utility-button"
            onClick={() => props.onUiCommand("toggle_debug_mode")}
          >
            Return to Table
          </button>
          <button
            type="button"
            className="utility-button utility-button--primary"
            onClick={() => props.onUiCommand("new_game")}
          >
            New Game
          </button>
        </div>
      </header>

      <div className="workspace workspace--debug">
        <section className="table-stage">
          <div className="table-surface">
            {props.seatViews.map((seatView) => (
              <DebugSeat
                key={seatView.seat}
                seatView={seatView}
                sortedLocalHand={props.sortedLocalHand}
                localCanInteract={props.localCanInteract}
                localLegalCardIds={props.localLegalCardIds}
                selectedCardIds={props.selectedCardIds}
                onLocalCardClick={props.onLocalCardClick}
                sortMode={props.sortMode}
                localSummaryText={props.localSummaryText}
                onSortModeChange={props.onSortModeChange}
              />
            ))}

            <TableSurface
              variant="debug"
              normalTableLayout={props.normalTableLayout}
              state={props.state}
              derived={props.derived}
              controlHint={props.controlHint}
              displayedTrick={props.displayedTrick}
              trickIsResolving={props.trickIsResolving}
              seatRelativePlays={props.seatRelativePlays}
              tablePassGroups={props.tablePassGroups}
              cardLookup={props.cardLookup}
            />
          </div>

          <section className="action-dock">
            <div className="action-dock__header">
              <div>
                <p className="action-dock__eyebrow">Action Rail</p>
                <strong className="action-dock__title">
                  Available Actions
                </strong>
              </div>
              <span className="action-dock__phase">{props.derived.phase}</span>
            </div>

            {props.state.phase === "pass_select" && (
              <div className="pass-lanes">
                {props.passLaneViews.map((lane) => (
                  <button
                    key={lane.target}
                    type="button"
                    className={
                      lane.target === props.selectedPassTarget
                        ? "pass-lane is-selected"
                        : "pass-lane"
                    }
                    onClick={() => props.onPassTargetSelect(lane.target)}
                  >
                    <span className="pass-lane__label">
                      {`${formatPassTarget(lane.target)} -> ${formatSeatShort(lane.targetSeat)}`}
                    </span>
                    <strong>{lane.assignedCardId ?? "Pick a card"}</strong>
                  </button>
                ))}
              </div>
            )}

            {props.matchingPlayActions.length > 1 && (
              <div className="variant-row">
                {props.matchingPlayActions.map((action) => {
                  const key = buildPlayVariantKey(action);
                  const activeKey = props.activePlayVariant
                    ? buildPlayVariantKey(props.activePlayVariant)
                    : key;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={
                        key === activeKey
                          ? "variant-pill is-active"
                          : "variant-pill"
                      }
                      onClick={() => props.onVariantSelect(key)}
                    >
                      {formatCombinationKind(action.combination.kind)}
                      {action.phoenixAsRank
                        ? ` as ${formatRank(action.phoenixAsRank)}`
                        : ""}
                    </button>
                  );
                })}
              </div>
            )}

            <DebugActionStrip
              normalActionRail={props.normalActionRail}
              localDragonRecipients={props.localDragonRecipients}
              canContinueAi={props.canContinueAi}
              onContinueAi={props.onContinueAi}
              onDragonRecipientSelect={props.onDragonRecipientSelect}
              onNormalAction={props.onNormalAction}
            />

            <p className="action-dock__hint">{props.controlHint}</p>
          </section>
        </section>

        <aside className="debug-sidebar">
          <section className="debug-sidebar__section">
            <p className="debug-panel__eyebrow">AI Read</p>
            {props.lastAiDecision ? (
              <>
                <strong className="debug-sidebar__title">
                  {formatActorLabel(props.lastAiDecision.actor)}
                </strong>
                <p className="debug-panel__copy">
                  {props.lastAiDecision.explanation.selectedReasonSummary.join(
                    " "
                  )}
                </p>
                {props.lastAiDecision.explanation.selectedTags.length > 0 && (
                  <div className="debug-tag-list">
                    {props.lastAiDecision.explanation.selectedTags.map(
                      (tag) => (
                        <span key={tag} className="debug-tag">
                          {formatPolicyTag(tag)}
                        </span>
                      )
                    )}
                  </div>
                )}
                {props.lastAiDecision.explanation.selectedTeamplay
                  ?.partnerCalledTichu && (
                  <p className="debug-panel__copy debug-panel__copy--compact">
                    Partner Tichu active • cards{" "}
                    {
                      props.lastAiDecision.explanation.selectedTeamplay
                        .partnerCardCount
                    }{" "}
                    • immediate threat{" "}
                    {props.lastAiDecision.explanation.selectedTeamplay
                      .opponentImmediateWinRisk
                      ? "yes"
                      : "no"}{" "}
                    • salvage{" "}
                    {props.lastAiDecision.explanation.selectedTeamplay
                      .teamSalvageIntervention
                      ? "yes"
                      : "no"}
                  </p>
                )}
                <ol className="candidate-list">
                  {props.lastAiDecision.explanation.candidateScores
                    .slice(0, 5)
                    .map((candidate, index) => (
                      <li key={`${candidate.score}-${index}`}>
                        <strong>{describeAction(candidate.action)}</strong>
                        <span>{candidate.score.toFixed(0)}</span>
                        <small>{candidate.reasons.join(" ")}</small>
                        {candidate.tags.length > 0 && (
                          <div className="debug-tag-list">
                            {candidate.tags.map((tag) => (
                              <span
                                key={`${candidate.score}-${tag}`}
                                className="debug-tag debug-tag--muted"
                              >
                                {formatPolicyTag(tag)}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                </ol>
              </>
            ) : (
              <p className="debug-panel__copy">
                AI rationale will appear here after the first automated
                decision.
              </p>
            )}
          </section>

          <section className="debug-sidebar__section">
            <p className="debug-panel__eyebrow">Local Surface</p>
            <strong className="debug-sidebar__title">
              Current legal actions
            </strong>
            <ul className="debug-list">
              {props.localActionSummary.length > 0 ? (
                props.localActionSummary.map((summary) => (
                  <li key={summary}>{summary}</li>
                ))
              ) : (
                <li>No local legal actions right now.</li>
              )}
            </ul>
          </section>

          <section className="debug-sidebar__section">
            <p className="debug-panel__eyebrow">Recent Flow</p>
            <strong className="debug-sidebar__title">Event feed</strong>
            <ul className="debug-list">
              {props.recentEvents
                .slice(-8)
                .reverse()
                .map((eventText, index) => (
                  <li key={`${eventText}-${index}`}>{eventText}</li>
                ))}
            </ul>
          </section>
        </aside>
      </div>

      <GameDialogLayer
        activeDialog={props.activeDialog}
        state={props.state}
        latestEntropyDebug={props.latestEntropyDebug}
        backendSettings={props.backendSettings}
        backendStatus={props.backendStatus}
        hotkeyDefinitions={props.hotkeyDefinitions}
        onBackendSettingsChange={props.onBackendSettingsChange}
        onTestBackend={props.onTestBackend}
        onUiCommand={props.onUiCommand}
      />
      {props.wishDialogOpen ? (
        <MahjongWishDialog
          resolvedWishRank={props.resolvedWishRank}
          wishSelectionOptions={props.wishSelectionOptions}
          wishConfirmDisabled={props.wishConfirmDisabled}
          wishSubmissionPending={props.wishSubmissionPending}
          onWishRankSelect={props.onWishRankSelect}
          onWishConfirm={props.onWishConfirm}
          onWishCancel={props.onWishCancel}
        />
      ) : null}
    </main>
  );
}
