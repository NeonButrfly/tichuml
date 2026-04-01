/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { ChosenDecision } from "@tichuml/ai-heuristics";
import {
  SYSTEM_ACTOR,
  type ActorId,
  type Card,
  type EngineAction,
  type EngineEvent,
  type EngineResult,
  type SeatId,
  type StandardRank,
  type TrickEntry
} from "@tichuml/engine";
import type { NormalActionSlot, NormalActionSlotId } from "./game-table-view-model";
import type { HandSortMode, PassTarget, PlayLegalAction } from "./table-model";

export type SeatVisualPosition = "top" | "right" | "bottom" | "left";

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
  resolvedWishRank: StandardRank | null;
  normalActionRail: NormalActionSlot[];
  sortMode: HandSortMode;
  autoplayLocal: boolean;
  lastAiDecision: ChosenDecision | null;
  recentEvents: string[];
  localActionSummary: string[];
  localSummaryText: string;
  canContinueAi: boolean;
  localDragonRecipients: SeatId[];
  normalTableLayout: NormalTableLayout;
  layoutEditorActive: boolean;
  cardLookup: ReadonlyMap<string, Card>;
  onToggleMode: () => void;
  onAutoplayChange: (checked: boolean) => void;
  onNewRound: () => void;
  onContinueAi: () => void;
  onSortModeChange: (mode: HandSortMode) => void;
  onLocalCardClick: (cardId: string) => void;
  onPassTargetSelect: (target: PassTarget) => void;
  onPassLaneDrop: (target: PassTarget, cardId: string) => void;
  onVariantSelect: (key: string) => void;
  onWishRankSelect: (rank: StandardRank) => void;
  onDragonRecipientSelect: (recipient: SeatId) => void;
  onNormalAction: (slotId: NormalActionSlotId) => void;
  onNormalTableLayoutChange: (nextLayout: NormalTableLayout) => void;
};

export type NormalLayoutElementId =
  | "scoreBadge"
  | "northHand"
  | "eastHand"
  | "southHand"
  | "westHand"
  | "northStage"
  | "eastStage"
  | "southStage"
  | "westStage"
  | "northToEastLane"
  | "northToSouthLane"
  | "northToWestLane"
  | "eastToNorthLane"
  | "eastToWestLane"
  | "eastToSouthLane"
  | "southToWestLane"
  | "southToNorthLane"
  | "southToEastLane"
  | "westToNorthLane"
  | "westToEastLane"
  | "westToSouthLane"
  | "playSurface"
  | "actionRow"
  | "northLabel"
  | "eastLabel"
  | "southLabel"
  | "westLabel";

export type NormalLayoutElement = {
  x: number;
  y: number;
  rotation: number;
};

export type NormalTableLayout = Record<NormalLayoutElementId, NormalLayoutElement>;

type NormalLayoutElementSpec = {
  label: string;
  width: number;
  height: number;
};

export const DEFAULT_NORMAL_TABLE_LAYOUT: NormalTableLayout = {
  scoreBadge: { x: 0.5, y: 0.024, rotation: 0 },
  northHand: { x: 0.5, y: 0.135, rotation: 0 },
  eastHand: { x: 0.945, y: 0.5, rotation: 0 },
  southHand: { x: 0.5, y: 0.82, rotation: 0 },
  westHand: { x: 0.055, y: 0.5, rotation: 0 },
  northStage: { x: 0.5, y: 0.285, rotation: 0 },
  eastStage: { x: 0.87, y: 0.5, rotation: 0 },
  southStage: { x: 0.5, y: 0.705, rotation: 0 },
  westStage: { x: 0.13, y: 0.5, rotation: 0 },
  northToEastLane: { x: 0.42, y: 0.315, rotation: 0 },
  northToSouthLane: { x: 0.5, y: 0.285, rotation: 0 },
  northToWestLane: { x: 0.58, y: 0.315, rotation: 0 },
  eastToNorthLane: { x: 0.87, y: 0.405, rotation: 0 },
  eastToWestLane: { x: 0.87, y: 0.447, rotation: 0 },
  eastToSouthLane: { x: 0.87, y: 0.637, rotation: 0 },
  southToWestLane: { x: 0.42, y: 0.733, rotation: 0 },
  southToNorthLane: { x: 0.5, y: 0.705, rotation: 0 },
  southToEastLane: { x: 0.58, y: 0.733, rotation: 0 },
  westToNorthLane: { x: 0.13, y: 0.405, rotation: 0 },
  westToEastLane: { x: 0.13, y: 0.447, rotation: 0 },
  westToSouthLane: { x: 0.13, y: 0.637, rotation: 0 },
  playSurface: { x: 0.5, y: 0.46, rotation: 0 },
  actionRow: { x: 0.5, y: 0.948, rotation: 0 },
  northLabel: { x: 0.5, y: 0.065, rotation: 0 },
  eastLabel: { x: 0.935, y: 0.5, rotation: 0 },
  southLabel: { x: 0.5, y: 0.735, rotation: 0 },
  westLabel: { x: 0.065, y: 0.5, rotation: 0 }
};

export const NORMAL_LAYOUT_ELEMENT_SPECS: Record<NormalLayoutElementId, NormalLayoutElementSpec> = {
  scoreBadge: { label: "Score Badge", width: 136, height: 28 },
  northHand: { label: "North Hand", width: 560, height: 120 },
  eastHand: { label: "East Hand", width: 96, height: 512 },
  southHand: { label: "South Hand", width: 920, height: 140 },
  westHand: { label: "West Hand", width: 96, height: 512 },
  northStage: { label: "North Staging", width: 260, height: 112 },
  eastStage: { label: "East Staging", width: 96, height: 260 },
  southStage: { label: "South Staging", width: 260, height: 112 },
  westStage: { label: "West Staging", width: 96, height: 260 },
  northToEastLane: { label: "North -> East", width: 60, height: 84 },
  northToSouthLane: { label: "North -> South", width: 60, height: 84 },
  northToWestLane: { label: "North -> West", width: 60, height: 84 },
  eastToNorthLane: { label: "East -> North", width: 84, height: 62 },
  eastToWestLane: { label: "East -> West", width: 84, height: 62 },
  eastToSouthLane: { label: "East -> South", width: 84, height: 62 },
  southToWestLane: { label: "South -> West", width: 60, height: 84 },
  southToNorthLane: { label: "South -> North", width: 60, height: 84 },
  southToEastLane: { label: "South -> East", width: 60, height: 84 },
  westToNorthLane: { label: "West -> North", width: 84, height: 62 },
  westToEastLane: { label: "West -> East", width: 84, height: 62 },
  westToSouthLane: { label: "West -> South", width: 84, height: 62 },
  playSurface: { label: "Play Surface", width: 920, height: 360 },
  actionRow: { label: "Action Row", width: 700, height: 112 },
  northLabel: { label: "North Label", width: 120, height: 28 },
  eastLabel: { label: "East Label", width: 32, height: 160 },
  southLabel: { label: "South Label", width: 120, height: 28 },
  westLabel: { label: "West Label", width: 32, height: 160 }
};

const NORMAL_LAYOUT_EDITOR_ORDER: NormalLayoutElementId[] = [
  "scoreBadge",
  "playSurface",
  "northHand",
  "eastHand",
  "southHand",
  "westHand",
  "northStage",
  "eastStage",
  "southStage",
  "westStage",
  "northToEastLane",
  "northToSouthLane",
  "northToWestLane",
  "eastToNorthLane",
  "eastToWestLane",
  "eastToSouthLane",
  "southToWestLane",
  "southToNorthLane",
  "southToEastLane",
  "westToNorthLane",
  "westToEastLane",
  "westToSouthLane",
  "northLabel",
  "eastLabel",
  "southLabel",
  "westLabel",
  "actionRow"
];

const NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS: Partial<Record<NormalLayoutElementId, NormalLayoutElementId>> = {
  scoreBadge: "actionRow",
  actionRow: "scoreBadge",
  northHand: "southHand",
  southHand: "northHand",
  eastHand: "westHand",
  westHand: "eastHand",
  northStage: "southStage",
  southStage: "northStage",
  eastStage: "westStage",
  westStage: "eastStage",
  northToEastLane: "southToWestLane",
  southToWestLane: "northToEastLane",
  northToSouthLane: "southToNorthLane",
  southToNorthLane: "northToSouthLane",
  northToWestLane: "southToEastLane",
  southToEastLane: "northToWestLane",
  eastToNorthLane: "westToNorthLane",
  westToNorthLane: "eastToNorthLane",
  eastToWestLane: "westToEastLane",
  westToEastLane: "eastToWestLane",
  eastToSouthLane: "westToSouthLane",
  westToSouthLane: "eastToSouthLane",
  northLabel: "southLabel",
  southLabel: "northLabel",
  eastLabel: "westLabel",
  westLabel: "eastLabel"
};

const NORMAL_HAND_LAYOUT_IDS: Record<SeatVisualPosition, NormalLayoutElementId> = {
  top: "northHand",
  right: "eastHand",
  bottom: "southHand",
  left: "westHand"
};

const NORMAL_LABEL_LAYOUT_IDS: Record<SeatVisualPosition, NormalLayoutElementId> = {
  top: "northLabel",
  right: "eastLabel",
  bottom: "southLabel",
  left: "westLabel"
};

const NORMAL_PASS_LANE_LAYOUT_IDS: Record<
  SeatVisualPosition,
  Partial<Record<SeatVisualPosition, NormalLayoutElementId>>
> = {
  top: {
    right: "northToEastLane",
    bottom: "northToSouthLane",
    left: "northToWestLane"
  },
  right: {
    top: "eastToNorthLane",
    left: "eastToWestLane",
    bottom: "eastToSouthLane"
  },
  bottom: {
    left: "southToWestLane",
    top: "southToNorthLane",
    right: "southToEastLane"
  },
  left: {
    top: "westToNorthLane",
    right: "westToEastLane",
    bottom: "westToSouthLane"
  }
};

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

export function formatSuitName(card: Extract<Card, { kind: "standard" }>): string {
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
    case "cards_played":
      return `${formatSeatShort((event.detail ?? "").split(":")[0] as SeatId)} played a combination.`;
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
    case "phase_changed":
      return `Phase changed to ${event.detail}.`;
    default:
      return event.detail ? `${event.type}: ${event.detail}` : event.type;
  }
}

export function describeAction(action: EngineAction): string {
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
        return `${formatCombinationKind(action.combination.kind)} (${action.cardIds.length})`;
      }
      return `Play ${action.cardIds.join(", ")}`;
  }
}

function buildPlayVariantKey(action: PlayLegalAction): string {
  return [
    action.cardIds.join(","),
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
  if (cardId === "mahjong" || cardId === "dog" || cardId === "phoenix" || cardId === "dragon") {
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

function resolveCard(cardId: string, cardLookup: ReadonlyMap<string, Card>): Card {
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

const NORMAL_STAGE_ANCHORS: Record<SeatVisualPosition, NormalStageRegionAnchor> = {
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
        laneStyle: { left: "200px", top: "22px", width: "60px", height: "84px" },
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
        laneStyle: { left: "6px", bottom: "136px", width: "84px", height: "124px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "east"
      },
      {
        targetPosition: "left",
        laneStyle: { left: "6px", bottom: "136px", width: "84px", height: "62px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "east"
      },
      {
        targetPosition: "bottom",
        laneStyle: { left: "6px", bottom: "0px", width: "84px", height: "62px" },
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
        laneStyle: { left: "200px", top: "28px", width: "60px", height: "84px" },
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
        laneStyle: { left: "6px", bottom: "136px", width: "84px", height: "124px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      },
      {
        targetPosition: "right",
        laneStyle: { left: "6px", bottom: "136px", width: "84px", height: "62px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      },
      {
        targetPosition: "bottom",
        laneStyle: { left: "6px", bottom: "0px", width: "84px", height: "62px" },
        slotStyle: { left: "0px", top: "0px" },
        orientation: "west"
      }
    ]
  }
};

function cardContent(card: Card) {
  if (card.kind === "standard") {
    return (
      <>
        <span className="playing-card__rank">{formatRank(card.rank)}</span>
        <span className="playing-card__suit">{formatSuitName(card)}</span>
      </>
    );
  }

  return (
    <>
      <span className="playing-card__rank playing-card__rank--special">{card.special}</span>
      <span className="playing-card__suit">special</span>
    </>
  );
}

function surfaceMessage(props: Pick<GameTableViewProps, "controlHint" | "state" | "derived">) {
  if (props.state.pendingDragonGift) {
    return {
      title: "Dragon gift",
      body: `${formatSeatShort(props.state.pendingDragonGift.winner)} chooses an opponent.`
    };
  }

  if (props.state.phase === "finished" && props.state.roundSummary) {
    return {
      title: "Round complete",
      body: `Finish: ${props.state.roundSummary.finishOrder.map((seat) => formatSeatShort(seat)).join(" -> ")}`
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function anchorStyle(element: NormalLayoutElement): CSSProperties {
  return {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`
  };
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

function normalizeLoadedLayout(payload: unknown): NormalTableLayout | null {
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
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
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
      rotation: isFiniteNumber(rotation) ? rotation : DEFAULT_NORMAL_TABLE_LAYOUT[elementId].rotation
    };
  }

  return hasElement ? nextLayout : null;
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
  const classes = [
    "playing-card",
    getCardClassName(card),
    tone === "legal" ? "playing-card--legal" : "",
    tone === "muted" ? "playing-card--muted" : "",
    selected ? "playing-card--selected" : "",
    interactive ? "" : "playing-card--static",
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
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
  cardLookup,
  cardClassName = "",
  tokenClassName = ""
}: {
  route: PassRouteView;
  cardLookup: ReadonlyMap<string, Card>;
  cardClassName?: string;
  tokenClassName?: string;
}) {
  if (route.visibleCardId) {
    return (
      <CardFace
        card={resolveCard(route.visibleCardId, cardLookup)}
        className={["normal-card", "normal-card--route", cardClassName].filter(Boolean).join(" ")}
      />
    );
  }

  return (
    <div
      className={
        [
          route.occupied ? "normal-pass-token normal-pass-token--back" : "normal-pass-token normal-pass-token--empty",
          tokenClassName
        ]
          .filter(Boolean)
          .join(" ")
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
  compact = false
}: Pick<
  SeatView,
  "callState" | "finishIndex" | "passReady" | "isPrimarySeat" | "isThinkingSeat"
> & {
  compact?: boolean;
}) {
  const className = compact ? "normal-seat__call" : "seat-chip";

  return (
    <>
      {callState.grandTichu && (
        <span className={`${className} ${compact ? "normal-seat__call--grand" : "seat-chip--alert"}`}>
          Grand Tichu
        </span>
      )}
      {callState.smallTichu && (
        <span className={`${className} ${compact ? "normal-seat__call--small" : "seat-chip--accent"}`}>Tichu</span>
      )}
      {isPrimarySeat && (
        <span className={`${className} ${compact ? "normal-seat__call--turn" : "seat-chip--turn"}`}>Turn</span>
      )}
      {isThinkingSeat && !compact && <span className="seat-chip seat-chip--soft">Thinking</span>}
      {passReady && !compact && <span className="seat-chip seat-chip--soft">Pass Ready</span>}
      {finishIndex >= 0 && (
        <span className={`${className} ${compact ? "normal-seat__call--finish" : "seat-chip--success"}`}>
          {formatPlacement(finishIndex)}
        </span>
      )}
    </>
  );
}

function TableSurface({
  variant,
  normalTableLayout,
  state,
  derived,
  controlHint,
  displayedTrick,
  trickIsResolving,
  seatRelativePlays,
  tablePassGroups,
  cardLookup
}: Pick<
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
}) {
  const status = surfaceMessage({ controlHint, state, derived });

  return (
    <section
      className={[
        variant === "normal" ? "normal-play-surface" : "table-trick",
        trickIsResolving ? (variant === "normal" ? "normal-play-surface--resolving" : "table-trick--resolving") : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={variant === "normal" ? anchorStyle(normalTableLayout.playSurface) : undefined}
    >
      {displayedTrick ? (
        <>
          <div className={variant === "normal" ? "normal-play-surface__core" : "table-trick__core"}>
            <span className={variant === "normal" ? "normal-play-surface__badge" : "table-trick__lead"}>
              {formatCombinationKind(displayedTrick.currentCombination.kind)}
            </span>
            <span className={variant === "normal" ? "normal-play-surface__badge" : "table-trick__lead"}>
              {formatSeatShort(displayedTrick.currentWinner)} ahead
            </span>
            {derived.currentWish !== null && (
              <span className={variant === "normal" ? "normal-play-surface__badge" : "wish-chip wish-chip--table"}>
                Wish {formatRank(derived.currentWish)}
              </span>
            )}
          </div>

          {seatRelativePlays.map(({ seat, position, label, plays }) => {
            if (plays.length === 0) {
              return null;
            }

            return (
              <div
                key={seat}
                className={
                  variant === "normal"
                    ? `normal-trick-lane normal-trick-lane--${position}`
                    : `table-trick__lane table-trick__lane--${position}`
                }
              >
                <span className={variant === "normal" ? "normal-trick-lane__label" : "table-trick__seat-label"}>
                  {label}
                </span>
                <div
                  className={
                    variant === "normal" ? "normal-trick-lane__sequence" : "table-trick__sequence"
                  }
                >
                  {plays.map((entry, index) => {
                    const isWinningPlay =
                      entry.seat === displayedTrick.currentWinner &&
                      entry.combination.key === displayedTrick.currentCombination.key;

                    return (
                      <div
                        key={`${seat}-${entry.combination.key}-${index}`}
                        className={
                          variant === "normal"
                            ? `normal-play-group${isWinningPlay ? " normal-play-group--winning" : ""}`
                            : `table-trick__play${isWinningPlay ? " table-trick__play--winning" : ""}`
                        }
                      >
                        <div className={variant === "normal" ? "normal-play-group__cards" : "table-trick__combo"}>
                          {entry.combination.cardIds.map((cardId) => (
                            <CardFace
                              key={cardId}
                              card={resolveCard(cardId, cardLookup)}
                              className={variant === "normal" ? "normal-card normal-card--trick" : "table-trick__card"}
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
      ) : variant === "debug" && tablePassGroups.length > 0 ? (
        <>
          <div className={variant === "normal" ? "normal-play-surface__core" : "table-trick__core"}>
            <span className={variant === "normal" ? "normal-play-surface__badge" : "table-trick__lead"}>
              {state.phase === "pass_select" ? "Pass lanes" : "Exchange ready"}
            </span>
          </div>

          {tablePassGroups.map((group) => (
            <div
              key={group.seat}
              className={
                variant === "normal"
                  ? `normal-pass-cluster normal-pass-cluster--${group.position}`
                  : `table-trick__lane table-trick__lane--${group.position}`
              }
            >
              <span className={variant === "normal" ? "normal-trick-lane__label" : "table-trick__seat-label"}>
                {group.label}
              </span>
              <div className={variant === "normal" ? "normal-pass-cluster__cards" : "table-trick__combo"}>
                {group.cardIds.map((cardId) => (
                  <CardFace
                    key={`${group.seat}-${cardId}`}
                    card={resolveCard(cardId, cardLookup)}
                    className={variant === "normal" ? "normal-card normal-card--pass" : "table-trick__card"}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className={variant === "normal" ? "normal-play-surface__empty" : "table-trick__empty"}>
          <strong>{status.title}</strong>
          <p>{status.body}</p>
          {state.phase === "finished" && state.roundSummary && (
            <p>
              Team 0 {state.roundSummary.teamScores["team-0"]} | Team 1 {state.roundSummary.teamScores["team-1"]}
            </p>
          )}
          {state.phase === "finished" && state.roundSummary?.doubleVictory && (
            <p>{state.roundSummary.doubleVictory} scored a double victory.</p>
          )}
        </div>
      )}
    </section>
  );
}

function NormalPassStagingRegions({
  normalTableLayout,
  passRouteViews,
  selectedPassTarget,
  cardLookup,
  onPassTargetSelect,
  onPassLaneDrop
}: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "passRouteViews"
  | "selectedPassTarget"
  | "cardLookup"
  | "onPassTargetSelect"
  | "onPassLaneDrop"
>) {
  if (passRouteViews.length === 0) {
    return null;
  }

  const seatOrder: Array<{ seat: SeatId; position: SeatVisualPosition }> = [
    { seat: "seat-2", position: "top" },
    { seat: "seat-1", position: "right" },
    { seat: "seat-0", position: "bottom" },
    { seat: "seat-3", position: "left" }
  ];

  return (
    <div className="normal-pass-staging" aria-label="Pass staging regions">
      {seatOrder.map(({ seat, position }) => {
        const routeByTargetPosition = new Map(
          passRouteViews
            .filter((route) => route.sourceSeat === seat)
            .map((route) => [getSeatVisualPosition(route.targetSeat), route])
        );

        if (routeByTargetPosition.size === 0) {
          return null;
        }

        return NORMAL_STAGE_ANCHORS[position].lanes.map((lane) => {
              const route = routeByTargetPosition.get(lane.targetPosition);
              const laneLayoutId = NORMAL_PASS_LANE_LAYOUT_IDS[position][lane.targetPosition];

              if (!route || !laneLayoutId) {
                return null;
              }

              const laneSpec = NORMAL_LAYOUT_ELEMENT_SPECS[laneLayoutId];
              const isInteractive = route.interactive;
              const slotClassName = [
                "normal-pass-stage-slot",
                `normal-pass-stage-slot--${lane.orientation}`,
                route.faceDown ? "normal-pass-stage-slot--back" : "",
                route.occupied ? "normal-pass-stage-slot--occupied" : "",
                route.target === selectedPassTarget && isInteractive ? "normal-pass-stage-slot--selected" : "",
                isInteractive ? "normal-pass-stage-slot--interactive" : ""
              ]
                .filter(Boolean)
                .join(" ");

              const slotContents = (
                <PassRouteToken
                  route={route}
                  cardLookup={cardLookup}
                  cardClassName={
                    lane.orientation === "east"
                      ? "normal-card--route-east"
                      : lane.orientation === "west"
                        ? "normal-card--route-west"
                        : ""
                  }
                  tokenClassName={
                    lane.orientation === "east"
                      ? "normal-pass-token--east"
                      : lane.orientation === "west"
                        ? "normal-pass-token--west"
                        : ""
                  }
                />
              );

              if (!isInteractive) {
                return (
                  <div
                    key={laneLayoutId}
                    className="normal-pass-stage-lane"
                    style={{
                      ...anchorStyle(normalTableLayout[laneLayoutId]),
                      width: `${laneSpec.width}px`,
                      height: `${laneSpec.height}px`
                    }}
                    aria-label={`${formatSeatShort(route.sourceSeat)} ${formatPassTarget(route.target)} lane`}
                  >
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
                  key={laneLayoutId}
                  className="normal-pass-stage-lane"
                  style={{
                    ...anchorStyle(normalTableLayout[laneLayoutId]),
                    width: `${laneSpec.width}px`,
                    height: `${laneSpec.height}px`
                  }}
                >
                  <button
                    type="button"
                    className={slotClassName}
                    aria-label={`${formatPassTarget(route.target)} to ${formatSeatShort(route.targetSeat)}`}
                    onClick={() => onPassTargetSelect(route.target)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const cardId = event.dataTransfer.getData("application/x-tichu-pass-card");
                      if (cardId) {
                        onPassLaneDrop(route.target, cardId);
                      }
                    }}
                  >
                    {slotContents}
                  </button>
                </div>
              );
            });
      })}
    </div>
  );
}

function NormalSeat({
  normalTableLayout,
  seatView,
  sortedLocalHand,
  localCanInteract,
  localPassInteractionEnabled,
  localLegalCardIds,
  selectedCardIds,
  onLocalCardClick
}: Pick<
  GameTableViewProps,
  | "normalTableLayout"
  | "sortedLocalHand"
  | "localCanInteract"
  | "localPassInteractionEnabled"
  | "localLegalCardIds"
  | "selectedCardIds"
  | "onLocalCardClick"
> & {
  seatView: SeatView;
}) {
  const isSideSeat = seatView.position === "left" || seatView.position === "right";
  const handLayoutId = NORMAL_HAND_LAYOUT_IDS[seatView.position];

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
      style={anchorStyle(normalTableLayout[handLayoutId])}
    >
      <div className={isSideSeat ? "normal-seat__meta normal-seat__meta--side" : "normal-seat__meta"}>
        <div className="normal-seat__flags">
          <SeatFlagChips
            callState={seatView.callState}
            finishIndex={seatView.finishIndex}
            passReady={seatView.passReady}
            isPrimarySeat={seatView.isPrimarySeat}
            isThinkingSeat={seatView.isThinkingSeat}
            compact
          />
        </div>
      </div>

      {seatView.isLocalSeat ? (
        <div className="normal-seat__body normal-seat__body--local">
          <div className="normal-seat__hand normal-seat__hand--bottom">
            {sortedLocalHand.map((card) => (
              <CardFace
                key={card.id}
                card={card}
                interactive={localCanInteract}
                tone={localLegalCardIds.has(card.id) ? "legal" : "muted"}
                selected={selectedCardIds.includes(card.id)}
                className="normal-card normal-card--local"
                onClick={() => onLocalCardClick(card.id)}
                draggable={localPassInteractionEnabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-tichu-pass-card", card.id);
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={`normal-seat__hand normal-seat__hand--${seatView.position}`}>
          {seatView.cards.map((card) =>
            isSideSeat ? (
              <div key={card.id} className={`normal-side-card-shell normal-side-card-shell--${seatView.position}`}>
                <CardFace
                  card={card}
                  className={`normal-card normal-card--seat normal-card--seat-${seatView.position}`}
                />
              </div>
            ) : (
              <CardFace key={card.id} card={card} className="normal-card normal-card--seat" />
            )
          )}
        </div>
      )}
    </section>
  );
}

function NormalSeatLabel({
  normalTableLayout,
  seatView
}: Pick<GameTableViewProps, "normalTableLayout"> & {
  seatView: SeatView;
}) {
  const layoutId = NORMAL_LABEL_LAYOUT_IDS[seatView.position];
  const isSideSeat = seatView.position === "left" || seatView.position === "right";

  return (
    <div
      className={isSideSeat ? "normal-seat-label normal-seat-label--side" : "normal-seat-label"}
      style={anchorStyle(normalTableLayout[layoutId])}
      aria-hidden="true"
    >
      {seatView.title}
    </div>
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
                  className={mode === sortMode ? "segment-control__button is-active" : "segment-control__button"}
                  onClick={() => onSortModeChange(mode)}
                >
                  {mode === "combo" ? "Combo" : mode.charAt(0).toUpperCase() + mode.slice(1)}
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
  controlHint,
  localDragonRecipients,
  onDragonRecipientSelect,
  onNormalAction
}: Pick<
  GameTableViewProps,
  "normalActionRail" | "controlHint" | "localDragonRecipients" | "onDragonRecipientSelect" | "onNormalAction"
>) {
  return (
    <section className="normal-action-area">
      <p className="normal-action-area__hint">{controlHint}</p>

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
      {localDragonRecipients.length > 0 ? (
        localDragonRecipients.map((recipient) => (
          <button
            key={recipient}
            type="button"
            className="action-button action-button--primary"
            onClick={() => onDragonRecipientSelect(recipient)}
          >
            Gift Dragon to {formatSeatShort(recipient)}
          </button>
        ))
      ) : (
        normalActionRail.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={[
              "action-button",
              slot.tone === "primary" ? "action-button--primary" : "action-button--secondary"
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onNormalAction(slot.id)}
            disabled={!slot.enabled}
          >
            {slot.label}
          </button>
        ))
      )}

      {canContinueAi && (
        <button type="button" className="action-button action-button--secondary" onClick={onContinueAi}>
          Continue AI
        </button>
      )}
    </div>
  );
}

type EditorDragState = {
  elementId: NormalLayoutElementId;
  startPointerX: number;
  startPointerY: number;
  startElement: NormalLayoutElement;
  surfaceRect: DOMRect;
};

function NormalLayoutEditor({
  normalTableLayout,
  onNormalTableLayoutChange
}: Pick<GameTableViewProps, "normalTableLayout" | "onNormalTableLayoutChange">) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<EditorDragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<NormalLayoutElementId>("southHand");
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(true);

  function snapElementPosition(
    elementId: NormalLayoutElementId,
    surfaceRect: DOMRect,
    centerX: number,
    centerY: number
  ) {
    const spec = NORMAL_LAYOUT_ELEMENT_SPECS[elementId];
    const halfWidth = spec.width / 2;
    const halfHeight = spec.height / 2;
    const clampedX = Math.min(surfaceRect.width - halfWidth, Math.max(halfWidth, centerX));
    const clampedY = Math.min(surfaceRect.height - halfHeight, Math.max(halfHeight, centerY));
    const snappedX = Math.round(clampedX / 10) * 10;
    const snappedY = Math.round(clampedY / 10) * 10;

    return {
      x: clamp01(snappedX / surfaceRect.width),
      y: clamp01(snappedY / surfaceRect.height)
    };
  }

  const moveSelectedBy = useCallback((deltaX: number, deltaY: number) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const current = normalTableLayout[selectedElementId];
    const next = snapElementPosition(selectedElementId, rect, current.x * rect.width + deltaX, current.y * rect.height + deltaY);
    onNormalTableLayoutChange(updateLayoutElement(normalTableLayout, selectedElementId, next));
  }, [normalTableLayout, onNormalTableLayoutChange, selectedElementId]);

  const rotateSelectedBy = useCallback((deltaRotation: number) => {
    const current = normalTableLayout[selectedElementId];
    onNormalTableLayoutChange(
      updateLayoutElement(normalTableLayout, selectedElementId, { rotation: current.rotation + deltaRotation })
    );
  }, [normalTableLayout, onNormalTableLayoutChange, selectedElementId]);

  const cycleSelectedElement = useCallback((delta: number) => {
    const currentIndex = NORMAL_LAYOUT_EDITOR_ORDER.indexOf(selectedElementId);
    const nextIndex =
      (currentIndex + delta + NORMAL_LAYOUT_EDITOR_ORDER.length) % NORMAL_LAYOUT_EDITOR_ORDER.length;
    setSelectedElementId(NORMAL_LAYOUT_EDITOR_ORDER[nextIndex]);
  }, [selectedElementId]);

  const selectedElement = normalTableLayout[selectedElementId];
  const opposingElementId = NORMAL_LAYOUT_OPPOSING_ELEMENT_IDS[selectedElementId] ?? null;
  const opposingElement = opposingElementId ? normalTableLayout[opposingElementId] : null;

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
        dragState.surfaceRect,
        dragState.startElement.x * dragState.surfaceRect.width + deltaX,
        dragState.startElement.y * dragState.surfaceRect.height + deltaY
      );

      onNormalTableLayoutChange(updateLayoutElement(normalTableLayout, dragState.elementId, next));
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
      if ((event.key === "g" || event.key === "G") && event.ctrlKey) {
        event.preventDefault();
        setGuidesVisible((current) => !current);
        return;
      }

      if ((event.key === "d" || event.key === "D") && event.ctrlKey) {
        event.preventDefault();
        setInspectorVisible((current) => !current);
        return;
      }

      const step = event.shiftKey ? 50 : 10;

      switch (event.key) {
        case "Tab":
          event.preventDefault();
          cycleSelectedElement(event.shiftKey ? -1 : 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveSelectedBy(0, -step);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveSelectedBy(0, step);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveSelectedBy(-step, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          moveSelectedBy(step, 0);
          break;
        case "[":
          event.preventDefault();
          rotateSelectedBy(-15);
          break;
        case "]":
          event.preventDefault();
          rotateSelectedBy(15);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleSelectedElement, moveSelectedBy, rotateSelectedBy]);

  function startDrag(elementId: NormalLayoutElementId, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    setSelectedElementId(elementId);
    dragStateRef.current = {
      elementId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startElement: normalTableLayout[elementId],
      surfaceRect: surface.getBoundingClientRect()
    };
  }

  async function handleLayoutFileSelection(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const nextLayout = normalizeLoadedLayout(JSON.parse(await file.text()));
      if (!nextLayout) {
        throw new Error("Invalid layout payload");
      }

      onNormalTableLayoutChange(nextLayout);
    } catch {
      window.alert("Could not load that layout JSON.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div ref={surfaceRef} className="normal-layout-editor" aria-label="Table layout editor">
      {guidesVisible && (
        <>
          <div
            className="normal-layout-editor__guideline normal-layout-editor__guideline--vertical is-selected"
            style={{ left: `${selectedElement.x * 100}%` }}
          />
          <div
            className="normal-layout-editor__guideline normal-layout-editor__guideline--horizontal is-selected"
            style={{ top: `${selectedElement.y * 100}%` }}
          />
          {opposingElement && opposingElementId && (
            <>
              <div
                className="normal-layout-editor__guideline normal-layout-editor__guideline--vertical"
                style={{ left: `${opposingElement.x * 100}%` }}
              />
              <div
                className="normal-layout-editor__guideline normal-layout-editor__guideline--horizontal"
                style={{ top: `${opposingElement.y * 100}%` }}
              />
              <div
                className="normal-layout-editor__opposing"
                style={{
                  ...anchorStyle(opposingElement),
                  width: `${NORMAL_LAYOUT_ELEMENT_SPECS[opposingElementId].width}px`,
                  height: `${NORMAL_LAYOUT_ELEMENT_SPECS[opposingElementId].height}px`
                }}
              >
                <span className="normal-layout-editor__opposing-name">
                  Opposing: {NORMAL_LAYOUT_ELEMENT_SPECS[opposingElementId].label}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {NORMAL_LAYOUT_EDITOR_ORDER.map((elementId) => {
        const spec = NORMAL_LAYOUT_ELEMENT_SPECS[elementId];
        const isSelected = elementId === selectedElementId;

        return (
          <button
            key={elementId}
            type="button"
            className={isSelected ? "normal-layout-editor__element is-selected" : "normal-layout-editor__element"}
            style={{
              ...anchorStyle(normalTableLayout[elementId]),
              width: `${spec.width}px`,
              height: `${spec.height}px`
            }}
            onClick={() => setSelectedElementId(elementId)}
            onPointerDown={(event) => startDrag(elementId, event)}
          >
            <span className="normal-layout-editor__element-name">{spec.label}</span>
            {isSelected && <span className="normal-layout-editor__element-handle" />}
          </button>
        );
      })}

      <input
        ref={fileInputRef}
        className="normal-layout-editor__file-input"
        type="file"
        accept=".json,application/json"
        onChange={handleLayoutFileSelection}
      />

      {inspectorVisible && (
        <aside className="normal-layout-editor__inspector">
          <strong>{NORMAL_LAYOUT_ELEMENT_SPECS[selectedElementId].label}</strong>
          <span>
            x {normalTableLayout[selectedElementId].x.toFixed(3)} | y {normalTableLayout[selectedElementId].y.toFixed(3)}
          </span>
          <span>rotation {normalTableLayout[selectedElementId].rotation}deg</span>
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
            <button type="button" onClick={() => setGuidesVisible((current) => !current)}>
              {guidesVisible ? "Hide Guides" : "Show Guides"}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Load JSON
            </button>
            <button
              type="button"
              onClick={() =>
                onNormalTableLayoutChange(
                  updateLayoutElement(normalTableLayout, selectedElementId, DEFAULT_NORMAL_TABLE_LAYOUT[selectedElementId])
                )
              }
            >
              Reset Selected
            </button>
            <button type="button" onClick={() => onNormalTableLayoutChange(DEFAULT_NORMAL_TABLE_LAYOUT)}>
              Reset All
            </button>
          </div>
          <p>Drag to move. Arrow keys nudge by 10px, Shift+Arrow by 50px, [ and ] rotate. Ctrl+G toggles guides, Ctrl+D hides this box, Ctrl+S exports JSON.</p>
        </aside>
      )}
    </div>
  );
}

export function NormalGameTableView(props: GameTableViewProps) {
  return (
    <main className="tabletop-app tabletop-app--normal">
      <section className="normal-layout">
        <button type="button" className="mode-toggle mode-toggle--normal" onClick={props.onToggleMode}>
          Ctrl+D Debug
        </button>

        <div className={props.layoutEditorActive ? "normal-table normal-table--editing" : "normal-table"}>
          <div className="normal-scoreboard" style={anchorStyle(props.normalTableLayout.scoreBadge)}>
            <strong>
              NS {props.derived.matchScore["team-0"]} : {props.derived.matchScore["team-1"]} EW
            </strong>
          </div>

          <div className="normal-table__felt" />

          {props.seatViews.map((seatView) => (
            <NormalSeatLabel key={`${seatView.seat}-label`} normalTableLayout={props.normalTableLayout} seatView={seatView} />
          ))}

          {props.seatViews.map((seatView) => (
            <NormalSeat
              key={seatView.seat}
              normalTableLayout={props.normalTableLayout}
              seatView={seatView}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localPassInteractionEnabled={props.localPassInteractionEnabled}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />
          ))}

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
          <NormalPassStagingRegions
            normalTableLayout={props.normalTableLayout}
            passRouteViews={props.passRouteViews}
            selectedPassTarget={props.selectedPassTarget}
            cardLookup={props.cardLookup}
            onPassTargetSelect={props.onPassTargetSelect}
            onPassLaneDrop={props.onPassLaneDrop}
          />
          <section className="normal-bottom-controls" style={anchorStyle(props.normalTableLayout.actionRow)}>
            {props.matchingPlayActions.length > 1 && (
              <div className="normal-inline-controls">
                <div className="variant-row variant-row--normal">
                  {props.matchingPlayActions.map((action) => {
                    const key = buildPlayVariantKey(action);
                    const activeKey = props.activePlayVariant ? buildPlayVariantKey(props.activePlayVariant) : key;

                    return (
                      <button
                        key={key}
                        type="button"
                        className={key === activeKey ? "variant-pill is-active" : "variant-pill"}
                        onClick={() => props.onVariantSelect(key)}
                      >
                        {formatCombinationKind(action.combination.kind)}
                        {action.phoenixAsRank ? ` as ${formatRank(action.phoenixAsRank)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {props.activePlayVariant?.availableWishRanks && (
              <div className="normal-inline-controls">
                <div className="wish-picker wish-picker--normal">
                  <p>Wish</p>
                  <div className="wish-picker__options">
                    {props.activePlayVariant.availableWishRanks.map((rank) => (
                      <button
                        key={rank}
                        type="button"
                        className={rank === props.resolvedWishRank ? "wish-chip wish-chip--active" : "wish-chip"}
                        onClick={() => props.onWishRankSelect(rank)}
                      >
                        {formatRank(rank)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <NormalActionStrip
              normalActionRail={props.normalActionRail}
              controlHint={props.controlHint}
              localDragonRecipients={props.localDragonRecipients}
              onDragonRecipientSelect={props.onDragonRecipientSelect}
              onNormalAction={props.onNormalAction}
            />
          </section>

          {props.layoutEditorActive && (
            <NormalLayoutEditor
              normalTableLayout={props.normalTableLayout}
              onNormalTableLayoutChange={props.onNormalTableLayoutChange}
            />
          )}
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
          <p className="topbar__eyebrow">Debug / AI Mode</p>
          <h1>Tichu Table</h1>
          <p className="topbar__summary">
            Shared live game state with richer AI rationale, legality, and engine metadata. Press Ctrl+D to return to
            the normal table.
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
            <strong>
              Team 0 {props.derived.matchScore["team-0"]} : {props.derived.matchScore["team-1"]} Team 1
            </strong>
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

          <button type="button" className="utility-button" onClick={props.onToggleMode}>
            Return to Table
          </button>
          <button type="button" className="utility-button utility-button--primary" onClick={props.onNewRound}>
            New Round
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
                <strong className="action-dock__title">Available Actions</strong>
              </div>
              <span className="action-dock__phase">{props.derived.phase}</span>
            </div>

            {props.state.phase === "pass_select" && (
              <div className="pass-lanes">
                {props.passLaneViews.map((lane) => (
                  <button
                    key={lane.target}
                    type="button"
                    className={lane.target === props.selectedPassTarget ? "pass-lane is-selected" : "pass-lane"}
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
                  const activeKey = props.activePlayVariant ? buildPlayVariantKey(props.activePlayVariant) : key;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={key === activeKey ? "variant-pill is-active" : "variant-pill"}
                      onClick={() => props.onVariantSelect(key)}
                    >
                      {formatCombinationKind(action.combination.kind)}
                      {action.phoenixAsRank ? ` as ${formatRank(action.phoenixAsRank)}` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {props.activePlayVariant?.availableWishRanks && (
              <div className="wish-picker">
                <p>Mahjong wish</p>
                <div className="wish-picker__options">
                  {props.activePlayVariant.availableWishRanks.map((rank) => (
                    <button
                      key={rank}
                      type="button"
                      className={rank === props.resolvedWishRank ? "wish-chip wish-chip--active" : "wish-chip"}
                      onClick={() => props.onWishRankSelect(rank)}
                    >
                      {formatRank(rank)}
                    </button>
                  ))}
                </div>
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
                <strong className="debug-sidebar__title">{formatActorLabel(props.lastAiDecision.actor)}</strong>
                <p className="debug-panel__copy">{props.lastAiDecision.explanation.selectedReasonSummary.join(" ")}</p>
                <ol className="candidate-list">
                  {props.lastAiDecision.explanation.candidateScores.slice(0, 5).map((candidate, index) => (
                    <li key={`${candidate.score}-${index}`}>
                      <strong>{describeAction(candidate.action)}</strong>
                      <span>{candidate.score.toFixed(0)}</span>
                      <small>{candidate.reasons.join(" ")}</small>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="debug-panel__copy">AI rationale will appear here after the first automated decision.</p>
            )}
          </section>

          <section className="debug-sidebar__section">
            <p className="debug-panel__eyebrow">Local Surface</p>
            <strong className="debug-sidebar__title">Current legal actions</strong>
            <ul className="debug-list">
              {props.localActionSummary.length > 0 ? (
                props.localActionSummary.map((summary) => <li key={summary}>{summary}</li>)
              ) : (
                <li>No local legal actions right now.</li>
              )}
            </ul>
          </section>

          <section className="debug-sidebar__section">
            <p className="debug-panel__eyebrow">Recent Flow</p>
            <strong className="debug-sidebar__title">Event feed</strong>
            <ul className="debug-list">
              {props.recentEvents.slice(-8).reverse().map((eventText, index) => (
                <li key={`${eventText}-${index}`}>{eventText}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
