import { useState } from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import type { Card } from "@tichuml/engine";

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

function formatRank(rank: number): string {
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

function formatSuitName(card: Extract<Card, { kind: "standard" }>): string {
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

function getCardFaceToneClassName(card: Card): string {
  if (card.kind === "special") {
    return `playing-card--special playing-card--${card.special}`;
  }

  return `playing-card--${card.suit}`;
}

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

export type CardFaceProps = {
  card: Card;
  interactive?: boolean;
  tone?: "normal" | "legal" | "muted";
  selected?: boolean;
  className?: string;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
};

export function CardFace({
  card,
  interactive = false,
  tone = "normal",
  selected = false,
  className = "",
  draggable = false,
  onClick,
  onDragStart,
  onDragEnd
}: CardFaceProps) {
  const [isDragging, setIsDragging] = useState(false);
  const classes = [
    "playing-card",
    getCardFaceToneClassName(card),
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
