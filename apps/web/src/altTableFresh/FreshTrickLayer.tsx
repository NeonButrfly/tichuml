import { designToScreen, type TableFit } from "./tableFit";
import type { Seat } from "./freshTableMath";

export type FreshTrickCard = {
  id: string;
  seat: Seat;
  src: string;
  centerPx: { x: number; y: number };
  widthPx: number;
  heightPx: number;
  rotationDeg: number;
  zIndex: number;
};

export function FreshTrickLayer({
  cards,
  fit
}: {
  cards: FreshTrickCard[];
  fit: TableFit;
}) {
  return (
    <>
      {cards.map((card) => {
        const point = designToScreen(card.centerPx.x, card.centerPx.y, fit);
        return (
          <div
            key={card.id}
            style={{
              position: "absolute",
              left: point.x,
              top: point.y,
              width: card.widthPx * fit.scale,
              height: card.heightPx * fit.scale,
              transform: `translate(-50%, -50%) rotate(${card.rotationDeg}deg)`,
              transformOrigin: "center center",
              zIndex: card.zIndex
            }}
          >
            <img
              src={card.src}
              alt=""
              draggable={false}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "fill",
                pointerEvents: "none"
              }}
            />
          </div>
        );
      })}
    </>
  );
}
