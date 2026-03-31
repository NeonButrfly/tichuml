/* eslint-disable react-refresh/only-export-components */
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
  cardLookup: ReadonlyMap<string, Card>;
  onToggleMode: () => void;
  onAutoplayChange: (checked: boolean) => void;
  onNewRound: () => void;
  onContinueAi: () => void;
  onSortModeChange: (mode: HandSortMode) => void;
  onLocalCardClick: (cardId: string) => void;
  onPassTargetSelect: (target: PassTarget) => void;
  onVariantSelect: (key: string) => void;
  onWishRankSelect: (rank: StandardRank) => void;
  onDragonRecipientSelect: (recipient: SeatId) => void;
  onNormalAction: (slotId: NormalActionSlotId) => void;
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

function CardFace({
  card,
  interactive = false,
  tone = "normal",
  selected = false,
  className = "",
  onClick
}: {
  card: Card;
  interactive?: boolean;
  tone?: "normal" | "legal" | "muted";
  selected?: boolean;
  className?: string;
  onClick?: () => void;
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
      <button type="button" className={classes} onClick={onClick}>
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
  cardLookup
}: {
  route: PassRouteView;
  cardLookup: ReadonlyMap<string, Card>;
}) {
  if (route.visibleCardId) {
    return <CardFace card={resolveCard(route.visibleCardId, cardLookup)} className="normal-card normal-card--route" />;
  }

  return (
    <div
      className={
        route.occupied ? "normal-pass-token normal-pass-token--back" : "normal-pass-token normal-pass-token--empty"
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
  state,
  derived,
  controlHint,
  displayedTrick,
  trickIsResolving,
  seatRelativePlays,
  tablePassGroups,
  passRouteViews,
  cardLookup
}: Pick<
  GameTableViewProps,
  | "state"
  | "derived"
  | "controlHint"
  | "displayedTrick"
  | "trickIsResolving"
  | "seatRelativePlays"
  | "tablePassGroups"
  | "passRouteViews"
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
      ) : variant === "normal" && passRouteViews.length > 0 ? (
        <>
          <div className="normal-play-surface__core">
            <span className="normal-play-surface__badge">
              {state.phase === "pass_select" ? "Pass lanes" : "Exchange staging"}
            </span>
          </div>

          <div className="normal-pass-network">
            {passRouteViews.map((route) => (
              <div
                key={route.key}
                className={`normal-pass-route normal-pass-route--${route.sourcePosition}-${route.target}`}
              >
                <PassRouteToken route={route} cardLookup={cardLookup} />
              </div>
            ))}
          </div>
        </>
      ) : tablePassGroups.length > 0 ? (
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

function NormalSeat({
  seatView,
  sortedLocalHand,
  localCanInteract,
  localLegalCardIds,
  selectedCardIds,
  onLocalCardClick
}: Pick<
  GameTableViewProps,
  "sortedLocalHand" | "localCanInteract" | "localLegalCardIds" | "selectedCardIds" | "onLocalCardClick"
> & {
  seatView: SeatView;
}) {
  return (
    <section
      className={[
        "normal-seat",
        `normal-seat--${seatView.position}`,
        seatView.isLocalSeat ? "normal-seat--local" : "",
        seatView.isPrimarySeat ? "normal-seat--active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="normal-seat__meta">
        <span className="normal-seat__label">{seatView.title}</span>
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
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={`normal-seat__hand normal-seat__hand--${seatView.position}`}>
          {seatView.cards.map((card) => (
            <CardFace key={card.id} card={card} className="normal-card normal-card--seat" />
          ))}
        </div>
      )}
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

function NormalSouthPassControls({
  passRouteViews,
  selectedPassTarget,
  cardLookup,
  onPassTargetSelect
}: Pick<GameTableViewProps, "passRouteViews" | "selectedPassTarget" | "cardLookup" | "onPassTargetSelect">) {
  const southRoutes = passRouteViews.filter((route) => route.sourceSeat === "seat-0");

  if (southRoutes.length === 0) {
    return null;
  }

  return (
    <div className="normal-south-pass-controls">
      {southRoutes.map((route) => (
        <button
          key={route.key}
          type="button"
          className={
            route.target === selectedPassTarget
              ? "normal-south-pass-control normal-south-pass-control--selected"
              : "normal-south-pass-control"
          }
          onClick={() => onPassTargetSelect(route.target)}
        >
          <span className="normal-south-pass-control__title">
            {formatPassTarget(route.target)} to {formatSeatShort(route.targetSeat)}
          </span>
          <PassRouteToken route={route} cardLookup={cardLookup} />
        </button>
      ))}
    </div>
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

export function NormalGameTableView(props: GameTableViewProps) {
  return (
    <main className="tabletop-app tabletop-app--normal">
      <section className="normal-layout">
        <button type="button" className="mode-toggle mode-toggle--normal" onClick={props.onToggleMode}>
          Ctrl+D Debug
        </button>

        <div className="normal-table">
          <div className="normal-scoreboard">
            <strong>
              NS {props.derived.matchScore["team-0"]} : {props.derived.matchScore["team-1"]} EW
            </strong>
          </div>

          <div className="normal-table__felt" />

          {props.seatViews.map((seatView) => (
            <NormalSeat
              key={seatView.seat}
              seatView={seatView}
              sortedLocalHand={props.sortedLocalHand}
              localCanInteract={props.localCanInteract}
              localLegalCardIds={props.localLegalCardIds}
              selectedCardIds={props.selectedCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />
          ))}

          <TableSurface
            variant="normal"
            state={props.state}
            derived={props.derived}
            controlHint={props.controlHint}
            displayedTrick={props.displayedTrick}
            trickIsResolving={props.trickIsResolving}
            seatRelativePlays={props.seatRelativePlays}
            tablePassGroups={props.tablePassGroups}
            passRouteViews={props.passRouteViews}
            cardLookup={props.cardLookup}
          />
          <section className="normal-south-edge">
            <NormalSouthPassControls
              passRouteViews={props.passRouteViews}
              selectedPassTarget={props.selectedPassTarget}
              cardLookup={props.cardLookup}
              onPassTargetSelect={props.onPassTargetSelect}
            />

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
              state={props.state}
              derived={props.derived}
              controlHint={props.controlHint}
              displayedTrick={props.displayedTrick}
              trickIsResolving={props.trickIsResolving}
              seatRelativePlays={props.seatRelativePlays}
              tablePassGroups={props.tablePassGroups}
              passRouteViews={props.passRouteViews}
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
