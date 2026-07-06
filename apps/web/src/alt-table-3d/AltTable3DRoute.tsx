import { useMemo } from "react";
import type { Card } from "@tichuml/engine";
import type { GameTableViewProps } from "../game-table-views";
import { FreshAltTable } from "../altTableFresh/FreshAltTable";
import { FRESH_ALT_CARD_BACK_SRC } from "../altTableFresh/freshAltTableChecks";
import { AltTableScene } from "./AltTableScene";
import type { HiddenHandCard, HiddenSeat } from "./AltTableCards3D";
import "./alt-table-3d.css";

export function AltTable3DRoute(props: GameTableViewProps) {
  const hiddenCards = useMemo(() => buildHiddenHandCards(props), [props]);

  return (
    <div className="alt-table-3d-route-live">
      <FreshAltTable {...props} showDebug={props.uiMode === "debug"} />
      <div className="alt-table-3d-route-live__overlay" aria-hidden="true">
        <AltTableScene cards={hiddenCards} backSrc={FRESH_ALT_CARD_BACK_SRC} />
      </div>
    </div>
  );
}

function buildHiddenHandCards(props: GameTableViewProps): HiddenHandCard[] {
  return props.seatViews.flatMap((seatView) => {
    if (seatView.isLocalSeat) {
      return [];
    }

    const seat = getHiddenSeat(seatView.position);
    if (!seat) {
      return [];
    }

    const count = Math.max(0, seatView.handCount);
    return Array.from({ length: count }, (_, index) => {
      const sourceCard = seatView.cards[index] ?? null;
      const cardId = sourceCard?.id ?? `${seatView.seat}-hidden-${index + 1}`;
      return {
        seat,
        slotIndex: index,
        handCount: count,
        zone: `${seat}_hand`,
        card: toDemoHiddenCard(cardId, sourceCard),
        anchor: {
          idx: index,
          id: `${seat}-${index + 1}`,
          zone: `${seat}_hand`,
          kind: "card",
          seat,
          slot: index + 1,
          layout_source: "prototype_layer",
          role: "hand",
          face_policy: "back",
          orientation: "portrait",
          rotation_deg: 0,
          w_px: 120,
          h_px: 180,
          center_px: { x: 768, y: 512 },
          bbox_px: { x: 708, y: 422, w: 120, h: 180 },
          polygon_px: []
        }
      } satisfies HiddenHandCard;
    });
  });
}

function getHiddenSeat(
  position: GameTableViewProps["seatViews"][number]["position"]
): HiddenSeat | null {
  switch (position) {
    case "top":
      return "north";
    case "right":
      return "east";
    case "left":
      return "west";
    default:
      return null;
  }
}

function toDemoHiddenCard(cardId: string, sourceCard: Card | null) {
  if (sourceCard?.kind === "special") {
    return {
      id: cardId,
      kind: "special" as const,
      special: sourceCard.special,
      label: sourceCard.special,
      src: FRESH_ALT_CARD_BACK_SRC
    };
  }

  return {
    id: cardId,
    kind: "standard" as const,
    suit: "jades" as const,
    rank: "9" as const,
    label: cardId,
    src: FRESH_ALT_CARD_BACK_SRC
  };
}
