import type { Card, SeatId } from "@tichuml/engine";
import { formatRank, type GameTableViewProps, type SeatView } from "../game-table-views";
import type { PassTarget } from "../table-model";
import type { SeatVisualPosition } from "../table-layout";
import { getPassLanePosition, SEAT_CARD_ROTATIONS, SEAT_TRAY_POSITIONS } from "./AltTable3DLayout";

export type AltTable3DCardNode = {
  key: string;
  card: Card;
  seat: SeatVisualPosition;
  position: [number, number, number];
  rotation: [number, number, number];
  faceDown: boolean;
  selected: boolean;
  interactive: boolean;
  cardId: string;
};

export type AltTable3DPassLaneNode = {
  key: string;
  sourcePosition: SeatVisualPosition;
  target: PassTarget;
  position: [number, number, number];
  occupied: boolean;
  selected: boolean;
  interactive: boolean;
  visibleCardId: string | null;
};

export type AltTable3DSeatNode = {
  seatId: SeatId;
  position: SeatVisualPosition;
  title: string;
  relation: string;
  handCount: number;
  status: string;
  tichuBadge: string | null;
};

export type AltTable3DSceneModel = {
  phaseLabel: string;
  score: {
    we: number;
    they: number;
  };
  seats: AltTable3DSeatNode[];
  southCards: AltTable3DCardNode[];
  opponentCards: AltTable3DCardNode[];
  trickCards: AltTable3DCardNode[];
  passLaneCards: AltTable3DCardNode[];
  passLanes: AltTable3DPassLaneNode[];
  activeSeatPosition: SeatVisualPosition | null;
};

function getSeatByPosition(
  seatViews: readonly SeatView[],
  position: SeatVisualPosition
) {
  const seat = seatViews.find((entry) => entry.position === position);
  if (!seat) {
    throw new Error(`Missing seat for ${position}.`);
  }
  return seat;
}

function getScoreValue(
  matchScore: GameTableViewProps["derived"]["matchScore"],
  teamId: "team-0" | "team-1"
) {
  const score = (matchScore as Record<string, number | undefined>)[teamId];
  return Number.isFinite(score) ? (score as number) : 0;
}

function formatPhaseLabel(phase: GameTableViewProps["state"]["phase"]) {
  switch (phase) {
    case "grand_tichu_window":
      return "Grand Tichu";
    case "pass_select":
      return "Exchange";
    case "pass_reveal":
      return "Reveal";
    case "exchange_complete":
      return "Pickup";
    case "trick_play":
      return "Trick Play";
    case "finished":
      return "Round End";
    default:
      return phase
        .split("_")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");
  }
}

function getSeatStatusText(
  seat: SeatView,
  phase: GameTableViewProps["state"]["phase"]
) {
  if (seat.isLocalSeat && seat.isPrimarySeat) {
    return "YOUR TURN";
  }
  if (seat.isPrimarySeat) {
    return "ACTIVE";
  }
  if (seat.isThinkingSeat) {
    return "THINKING";
  }
  if (seat.callState.grandTichu) {
    return "GRAND TICHU";
  }
  if (seat.callState.smallTichu) {
    return "TICHU";
  }
  if (phase === "pass_select" && seat.passReady) {
    return "READY";
  }
  return "SEATED";
}

function getTichuBadge(seat: SeatView) {
  if (seat.callState.grandTichu) {
    return "GRAND";
  }
  if (seat.callState.smallTichu) {
    return "TICHU";
  }
  return null;
}

function buildSouthHandCards(props: GameTableViewProps): AltTable3DCardNode[] {
  const seat = getSeatByPosition(props.seatViews, "bottom");
  const centerX = 0;
  const spacing = Math.min(0.46, 4.7 / Math.max(seat.cards.length, 1));
  const rotationBase = SEAT_CARD_ROTATIONS.bottom;

  return props.sortedLocalHand.map((card, index) => {
    const totalWidth = spacing * Math.max(props.sortedLocalHand.length - 1, 0);
    const x = centerX - totalWidth / 2 + index * spacing;
    const zCurve = Math.abs(index - (props.sortedLocalHand.length - 1) / 2) * -0.03;
    return {
      key: `south-${card.id}`,
      card,
      seat: "bottom",
      position: [x, 0.96, 4.08 + zCurve],
      rotation: [rotationBase[0], rotationBase[1], (x / 9.5) * -0.16],
      faceDown: false,
      selected: props.selectedCardIds.includes(card.id),
      interactive: props.localCanInteract,
      cardId: card.id
    };
  });
}

function buildOpponentCards(props: GameTableViewProps): AltTable3DCardNode[] {
  return props.seatViews
    .filter((seat) => !seat.isLocalSeat)
    .flatMap((seat) => {
      const count = Math.max(1, Math.min(seat.handCount, seat.position === "top" ? 9 : 7));
      const spacing = seat.position === "top" ? 0.42 : 0.34;
      const base = SEAT_TRAY_POSITIONS[seat.position];
      const rotation = SEAT_CARD_ROTATIONS[seat.position];

      return Array.from({ length: count }, (_, index) => {
        const centered = index - (count - 1) / 2;
        const lateral = centered * spacing;
        const position =
          seat.position === "top"
            ? ([lateral, 0.96, base[2] + 0.58] as [number, number, number])
            : seat.position === "left"
              ? ([base[0] + 0.55, 0.96, lateral] as [number, number, number])
              : ([base[0] - 0.55, 0.96, lateral] as [number, number, number]);

        return {
          key: `${seat.position}-back-${index}`,
          card: { id: "dragon", kind: "special", special: "dragon" } as Card,
          seat: seat.position,
          position,
          rotation,
          faceDown: true,
          selected: false,
          interactive: false,
          cardId: `back-${seat.position}-${index}`
        };
      });
    });
}

function buildTrickCards(props: GameTableViewProps): AltTable3DCardNode[] {
  const entries = props.displayedTrick?.entries ?? [];
  const seatPositionBySeat = new Map(props.seatViews.map((seat) => [seat.seat, seat.position] as const));
  return entries.flatMap((entry, index) => {
    if (entry.type !== "play") {
      return [];
    }
    const position = seatPositionBySeat.get(entry.seat) ?? "bottom";
    const cardIds = entry.combination.cardIds ?? [];
    return cardIds.map((cardId, cardIndex) => {
      const card = props.cardLookup.get(cardId);
      if (!card) {
        return null;
      }
      const spread = cardIds.length > 1 ? (cardIndex - (cardIds.length - 1) / 2) * 0.42 : 0;
      const seatOffset =
        position === "bottom"
          ? [spread, 1.02, 1.55]
          : position === "top"
            ? [spread, 1.02, -1.55]
            : position === "left"
              ? [-1.76, 1.02, spread]
              : [1.76, 1.02, spread];
      return {
        key: `trick-${index}-${cardId}`,
        card,
        seat: position,
        position: seatOffset as [number, number, number],
        rotation: SEAT_CARD_ROTATIONS[position],
        faceDown: false,
        selected: false,
        interactive: false,
        cardId
      };
    });
  }).filter((entry): entry is AltTable3DCardNode => Boolean(entry));
}

function buildPassLanes(props: GameTableViewProps): AltTable3DPassLaneNode[] {
  return props.passRouteViews.map((route) => ({
    key: route.key,
    sourcePosition: route.sourcePosition,
    target: route.target,
    position: getPassLanePosition(route.sourcePosition, route.target),
    occupied: route.occupied,
    selected: props.selectedPassTarget === route.target && route.sourcePosition === "bottom",
    interactive: route.interactive,
    visibleCardId: route.visibleCardId
  }));
}

function buildPassLaneCards(props: GameTableViewProps): AltTable3DCardNode[] {
  return props.passRouteViews.flatMap((route) => {
    if (!route.visibleCardId) {
      return [];
    }
    const card = props.cardLookup.get(route.visibleCardId);
    if (!card) {
      return [];
    }
    const [x, y, z] = getPassLanePosition(route.sourcePosition, route.target);
    return [
      {
        key: `pass-${route.key}-${route.visibleCardId}`,
        card,
        seat: route.sourcePosition,
        position: [x, y + 0.04, z],
        rotation: SEAT_CARD_ROTATIONS[route.sourcePosition],
        faceDown: route.faceDown,
        selected: false,
        interactive: false,
        cardId: route.visibleCardId
      }
    ];
  });
}

export function createAltTable3DSceneModel(
  props: GameTableViewProps
): AltTable3DSceneModel {
  const south = getSeatByPosition(props.seatViews, "bottom");
  const activeSeatPosition =
    props.seatViews.find((seat) => seat.seat === props.derived.activeSeat)?.position ?? null;

  return {
    phaseLabel: formatPhaseLabel(props.state.phase),
    score: {
      we: getScoreValue(props.derived.matchScore, "team-0"),
      they: getScoreValue(props.derived.matchScore, "team-1")
    },
    seats: props.seatViews.map((seat) => ({
      seatId: seat.seat,
      position: seat.position,
      title: seat.title,
      relation: seat.relation,
      handCount: seat.position === "bottom" ? south.cards.length : seat.handCount,
      status: getSeatStatusText(seat, props.state.phase),
      tichuBadge: getTichuBadge(seat)
    })),
    southCards: buildSouthHandCards(props),
    opponentCards: buildOpponentCards(props),
    trickCards: buildTrickCards(props),
    passLaneCards: buildPassLaneCards(props),
    passLanes: buildPassLanes(props),
    activeSeatPosition
  };
}

export function formatSouthHandSummary(cards: readonly AltTable3DCardNode[]) {
  return cards.map((entry) => entry.card.kind === "standard"
    ? `${formatRank(entry.card.rank)} ${entry.card.suit}`
    : entry.card.special).join(", ");
}
