import type { DragEvent as ReactDragEvent } from "react";
import type { PassAnchor } from "./freshTableMath";
import { designToScreen, type TableFit } from "./tableFit";

export type FreshPassLaneCard = {
  src: string;
  rotationDeg: number;
  interactive?: boolean;
  draggable?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
};

export type FreshPassLane = {
  anchor: PassAnchor;
  interactive: boolean;
  occupied: boolean;
  selected: boolean;
  ariaLabel: string;
  visible?: boolean;
  locked?: boolean;
  rotationDeg?: number;
  borderOpacity?: number;
  fillOpacity?: number;
  arrowRotationDeg?: number;
  arrowOffsetPx?: { x: number; y: number };
  arrowScale?: number;
  onClick?: () => void;
  onDropCard?: (cardId: string) => void;
  card?: FreshPassLaneCard | null;
};

function arrowGlyph(dir: string) {
  switch (dir) {
    case "north":
      return "↑";
    case "south":
      return "↓";
    case "east":
      return "→";
    case "west":
      return "←";
    case "left":
      return "←";
    case "right":
      return "→";
    default:
      return "•";
  }
}

export function FreshPassingLayer({
  lanes,
  fit,
  showDebug = false
}: {
  lanes: FreshPassLane[];
  fit: TableFit;
  showDebug?: boolean;
}) {
  return (
    <>
      {lanes.map((lane) => {
        if (lane.visible === false) {
          return null;
        }

        const point = designToScreen(
          lane.anchor.centerPx.x,
          lane.anchor.centerPx.y,
          fit
        );
        const width = lane.anchor.wPx * fit.scale;
        const height = lane.anchor.hPx * fit.scale;
        const borderWidth = Math.max(1, 2 * fit.scale);
        const fillOpacity = lane.fillOpacity ?? (lane.occupied ? 0.62 : 0.5);
        const borderOpacity = lane.borderOpacity ?? 0.95;
        const rotationDeg = lane.rotationDeg ?? 0;

        const laneStyle = {
          position: "absolute",
          left: point.x,
          top: point.y,
          width,
          height,
          transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
          border: `${borderWidth}px solid rgba(245, 190, 40, ${borderOpacity})`,
          borderRadius: 8 * fit.scale,
          background: lane.occupied
            ? `rgba(22, 36, 25, ${Math.max(fillOpacity, 0.25)})`
            : `rgba(8, 18, 14, ${fillOpacity})`,
          boxShadow: lane.selected
            ? `0 0 ${12 * fit.scale}px rgba(245, 190, 40, 0.55)`
            : `0 0 ${8 * fit.scale}px rgba(245, 190, 40, 0.35)`,
          zIndex: lane.anchor.zIndex,
          padding: 0,
          cursor: lane.locked ? "not-allowed" : lane.interactive ? "pointer" : "default",
          opacity: lane.locked ? 0.7 : 1
        } as const;

        const chrome = (
          <>
            <div
              style={{
                position: "absolute",
                inset: 8 * fit.scale,
                border: `${Math.max(1, fit.scale)}px dashed rgba(245, 190, 40, 0.75)`,
                borderRadius: 5 * fit.scale
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(245, 190, 40, 0.95)",
                fontSize: 36 * fit.scale,
                fontWeight: 800,
                lineHeight: 1,
                transform: `translate(${(lane.arrowOffsetPx?.x ?? 0) * fit.scale}px, ${(lane.arrowOffsetPx?.y ?? 0) * fit.scale}px) rotate(${(lane.arrowRotationDeg ?? 0)}deg) scale(${lane.arrowScale ?? 1})`
              }}
            >
              {arrowGlyph(lane.anchor.arrowDirection)}
            </div>
            {showDebug ? (
              <div
                style={{
                  position: "absolute",
                  left: 4 * fit.scale,
                  top: 4 * fit.scale,
                  color: "white",
                  fontSize: 10 * fit.scale,
                  background: "rgba(0, 0, 0, 0.6)",
                  padding: `${2 * fit.scale}px ${4 * fit.scale}px`
                }}
              >
                {lane.anchor.id}
              </div>
            ) : null}
          </>
        );

        const cardPadding = 8 * fit.scale;
        const cardWidth = width - cardPadding * 2;
        const cardHeight = height - cardPadding * 2;

        const arrowRotation = (() => {
          if (lane.arrowRotationDeg !== undefined) {
            return lane.arrowRotationDeg;
          }

          switch (lane.anchor.arrowDirection) {
            case "north": return 0;
            case "south": return 180;
            case "east": return 90;
            case "west": return -90;
            case "left": return -90;
            case "right": return 90;
            default: return 0;
          }
        })();

        return (
          <div key={lane.anchor.id}>
            {lane.interactive ? (
              <button
                type="button"
                data-pass-id={lane.anchor.id}
                data-seat={lane.anchor.seat}
                data-arrow-direction={lane.anchor.arrowDirection}
                data-assigned-card-rotation={lane.anchor.assignedCardRotationDeg}
                style={laneStyle}
                aria-label={lane.ariaLabel}
                onClick={lane.onClick}
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
                    lane.onDropCard?.(cardId);
                  }
                }}
              >
                {chrome}
              </button>
            ) : (
              <div
                data-pass-id={lane.anchor.id}
                data-seat={lane.anchor.seat}
                data-arrow-direction={lane.anchor.arrowDirection}
                data-assigned-card-rotation={lane.anchor.assignedCardRotationDeg}
                style={laneStyle}
                aria-hidden="true"
              >
                {chrome}
              </div>
            )}

            {lane.card
              ? lane.card.interactive
                ? (
                    <button
                      type="button"
                      style={{
                        position: "absolute",
                        left: point.x,
                        top: point.y,
                        width: cardWidth,
                        height: cardHeight,
                        transform: `translate(-50%, -50%) rotate(${arrowRotation}deg)`,
                        transformOrigin: "center center",
                        border: "none",
                        background: "none",
                        padding: 0,
                        zIndex: lane.anchor.zIndex + 10,
                        cursor: "pointer"
                      }}
                      aria-label={lane.card.ariaLabel}
                      draggable={lane.card.draggable}
                      onClick={lane.card.onClick}
                      onDragStart={lane.card.onDragStart}
                      onDragEnd={lane.card.onDragEnd}
                    >
                      <img
                        src={lane.card.src}
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
                    </button>
                  )
                : (
                    <div
                      style={{
                        position: "absolute",
                        left: point.x,
                        top: point.y,
                        width: cardWidth,
                        height: cardHeight,
                        transform: `translate(-50%, -50%) rotate(${arrowRotation}deg)`,
                        transformOrigin: "center center",
                        zIndex: lane.anchor.zIndex + 10
                      }}
                    >
                      <img
                        src={lane.card.src}
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
                  )
              : null}
          </div>
        );
      })}
    </>
  );
}
