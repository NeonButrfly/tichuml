import type { DragEvent as ReactDragEvent } from "react";
import type { CardAnchor } from "./freshTableMath";
import { designToScreen, type TableFit } from "./tableFit";

export type FreshRenderableCard = {
  id: string;
  seat: CardAnchor["seat"];
  src: string;
  anchor: CardAnchor;
  selected?: boolean;
  interactive?: boolean;
  draggable?: boolean;
  liftPx?: number;
  opacity?: number;
  ariaLabel?: string;
  onClick?: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
};

function renderCardShell(config: {
  card: FreshRenderableCard;
  fit: TableFit;
  showDebug: boolean;
}) {
  const { card, fit, showDebug } = config;
  const point = designToScreen(card.anchor.centerPx.x, card.anchor.centerPx.y, fit);
  const width = card.anchor.wPx * fit.scale;
  const fullHeight = card.anchor.hPx * fit.scale;
  const hiddenBottom = (card.anchor.hiddenBottomPx ?? 0) * fit.scale;
  const visibleHeight =
    card.anchor.renderMode === "north_rack"
      ? fullHeight - hiddenBottom
      : fullHeight;
  const left = point.x;
  const top =
    (card.anchor.renderMode === "north_rack"
      ? point.y - hiddenBottom / 2
      : point.y) - (card.selected ? (card.liftPx ?? 24) * fit.scale : 0);
  const localRotation = card.anchor.localRotationDeg;
  const localRotationTransform = localRotation
    ? ` rotateX(${localRotation.x}deg) rotateY(${localRotation.y}deg) rotateZ(${localRotation.z}deg)`
    : "";

  const shellStyle = {
    position: "absolute",
    left,
    top,
    width,
    height: visibleHeight,
    overflow: "hidden",
    transform: `translate(-50%, -50%) rotate(${card.anchor.rotationDeg}deg)${localRotationTransform} scaleX(${card.anchor.scaleX}) scaleY(${card.anchor.scaleY})`,
    transformOrigin: card.anchor.transformOrigin ?? "center center",
    transformStyle: "preserve-3d",
    zIndex: card.anchor.zIndex + (card.selected ? 30 : 0),
    outline: showDebug ? "1px solid rgba(64, 220, 255, 0.85)" : "none",
    border: "none",
    background: "none",
    padding: 0,
    cursor: card.interactive ? "pointer" : "default",
    boxShadow: card.selected
      ? `0 0 ${18 * fit.scale}px rgba(241, 191, 74, 0.72)`
      : "none"
  } as const;

  const imageNode = (
    <img
      src={card.src}
      alt=""
      draggable={false}
      style={{
        display: "block",
        width: "100%",
        height: fullHeight,
        objectFit: "fill",
        userSelect: "none",
        pointerEvents: "none",
        opacity: card.opacity ?? 1
      }}
    />
  );

  if (card.interactive) {
    return (
      <button
        key={card.id}
        type="button"
        data-card-id={card.id}
        data-seat={card.seat}
        data-render-mode={card.anchor.renderMode}
        style={shellStyle}
        aria-label={card.ariaLabel}
        draggable={card.draggable}
        onClick={card.onClick}
        onDragStart={card.onDragStart}
        onDragEnd={card.onDragEnd}
      >
        {imageNode}
      </button>
    );
  }

  return (
    <div
      key={card.id}
      data-card-id={card.id}
      data-seat={card.seat}
      data-render-mode={card.anchor.renderMode}
      aria-hidden="true"
      style={shellStyle}
    >
      {imageNode}
    </div>
  );
}

export function FreshCardsLayer({
  cards,
  fit,
  showDebug = false
}: {
  cards: FreshRenderableCard[];
  fit: TableFit;
  showDebug?: boolean;
}) {
  return <>{cards.map((card) => renderCardShell({ card, fit, showDebug }))}</>;
}
