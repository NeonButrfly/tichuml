import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import {
  CardFace,
  describeAction,
  formatCombinationKind,
  formatRank,
  GameChromeMenu,
  type GameTableViewProps,
  type SeatView,
  type WishSelectionValue
} from "./game-table-views";
import type { Card } from "@tichuml/engine";

function getSeatByPosition(
  seatViews: readonly SeatView[],
  position: SeatView["position"]
): SeatView {
  const seat = seatViews.find((entry) => entry.position === position);
  if (!seat) {
    throw new Error(`Missing ${position} seat view for alternate table.`);
  }
  return seat;
}

function getScoreValue(
  matchScore: GameTableViewProps["derived"]["matchScore"],
  teamId: "team-0" | "team-1"
): number {
  const score = (matchScore as Record<string, number | undefined>)[teamId];
  return Number.isFinite(score) ? (score as number) : 0;
}

function getSeatStatusTags(seat: SeatView): string[] {
  const tags: string[] = [];
  if (seat.isPrimarySeat) {
    tags.push("ACTIVE");
  }
  if (seat.isThinkingSeat) {
    tags.push("THINKING");
  }
  if (seat.callState.grandTichu) {
    tags.push("GT");
  } else if (seat.callState.smallTichu) {
    tags.push("T");
  }
  if (seat.passReady) {
    tags.push("READY");
  }
  return tags;
}

function renderAltCardBacks(count: number) {
  return Array.from({ length: Math.max(1, Math.min(count, 7)) }).map((_, index) => (
    <span
      key={index}
      className="alternate-card-back"
      data-alt-card-back="true"
      style={
        {
          "--alt-card-index": String(index)
        } as CSSProperties
      }
      aria-hidden="true"
    />
  ));
}

function PassLaneCard({
  card,
  onClick,
  onDragStart,
  onDragEnd
}: {
  card: Card;
  onClick: () => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <CardFace
      card={card}
      interactive
      draggable
      className="alternate-pass-card"
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );
}

function WishOptionButton({
  value,
  active,
  onClick
}: {
  value: WishSelectionValue;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "alternate-wish-option",
        active ? "is-active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {value === null ? "No Wish" : formatRank(value)}
    </button>
  );
}

export function AlternateGameTableView(props: GameTableViewProps) {
  const northSeat = getSeatByPosition(props.seatViews, "top");
  const westSeat = getSeatByPosition(props.seatViews, "left");
  const eastSeat = getSeatByPosition(props.seatViews, "right");
  const southSeat = getSeatByPosition(props.seatViews, "bottom");
  const weScore = getScoreValue(props.derived.matchScore, "team-0");
  const theyScore = getScoreValue(props.derived.matchScore, "team-1");
  const showPassPanel =
    props.state.phase === "pass_select" ||
    props.state.phase === "pass_reveal" ||
    props.state.phase === "exchange_complete";
  const currentTrickEntries = props.seatRelativePlays.flatMap(({ plays, position }) =>
    plays.map((play, index) => ({
      key: `${position}-${play.combination.key}-${index}`,
      seatPosition: position,
      seat: play.seat,
      cardIds: play.combination.cardIds,
      winning:
        props.displayedTrick?.currentWinner === play.seat &&
        props.displayedTrick?.currentCombination.key === play.combination.key
    }))
  );

  return (
    <main className="alternate-tabletop">
      <GameChromeMenu
        variant="alternate"
        isOpen={props.mainMenuOpen}
        uiMode={props.uiMode}
        layoutEditorActive={props.layoutEditorActive}
        playerTableVariant={props.playerTableVariant}
        onMainMenuOpenChange={props.onMainMenuOpenChange}
        onUiCommand={props.onUiCommand}
        onPlayerTableVariantChange={props.onPlayerTableVariantChange}
      />

      <header className="alternate-tabletop__header">
        <div className="alternate-tabletop__title-block">
          <p className="alternate-tabletop__eyebrow">Alternate Gameplay Table</p>
          <h1>Tichu</h1>
          <p>{props.controlHint}</p>
        </div>
        <div className="alternate-score-plaque">
          <div>
            <span>WE</span>
            <strong>{weScore}</strong>
          </div>
          <div>
            <span>THEY</span>
            <strong>{theyScore}</strong>
          </div>
        </div>
      </header>

      <section className="alternate-tabletop__board-shell">
        <div className="alternate-tabletop__rail alternate-tabletop__rail--north">
          <AlternateSeatPlaque seat={northSeat} label="NORTH / PARTNER" />
          <div className="alternate-remote-rack" data-alt-seat="north">
            <div className="alternate-remote-rack__cards">
              {renderAltCardBacks(northSeat.handCount)}
            </div>
            <span className="alternate-remote-rack__count">
              {northSeat.handCount} cards
            </span>
          </div>
        </div>

        <div className="alternate-tabletop__rail alternate-tabletop__rail--west">
          <AlternateSeatPlaque seat={westSeat} label="WEST / OPPONENT" vertical />
          <div className="alternate-side-rack" data-alt-seat="west">
            <div className="alternate-side-rack__cards">
              {renderAltCardBacks(westSeat.handCount)}
            </div>
            <span className="alternate-side-rack__count">{westSeat.handCount}</span>
          </div>
        </div>

        <div className="alternate-tabletop__rail alternate-tabletop__rail--east">
          <AlternateSeatPlaque seat={eastSeat} label="EAST / OPPONENT" vertical />
          <div className="alternate-side-rack" data-alt-seat="east">
            <div className="alternate-side-rack__cards">
              {renderAltCardBacks(eastSeat.handCount)}
            </div>
            <span className="alternate-side-rack__count">{eastSeat.handCount}</span>
          </div>
        </div>

        <section className="alternate-tabletop__felt">
          <div className="alternate-tabletop__felt-logo" aria-hidden="true">
            TICHU
          </div>

          <div className="alternate-tabletop__status-bar">
            <span>{props.state.phase.replaceAll("_", " ")}</span>
            {props.derived.currentWish ? (
              <span>Wish {formatRank(props.derived.currentWish)}</span>
            ) : (
              <span>No active wish</span>
            )}
            <span>{props.backendStatus.state}</span>
          </div>

          <div className="alternate-trick-area">
            <div className="alternate-trick-area__header">
              <span>Current Trick</span>
              {props.displayedTrick ? (
                <strong>
                  {formatCombinationKind(props.displayedTrick.currentCombination.kind)}
                </strong>
              ) : (
                <strong>Waiting</strong>
              )}
            </div>

            <div className="alternate-trick-grid">
              {currentTrickEntries.length > 0 ? (
                currentTrickEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className={[
                      "alternate-trick-stack",
                      `alternate-trick-stack--${entry.seatPosition}`,
                      entry.winning ? "is-winning" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="alternate-trick-stack__label">{entry.seat}</span>
                    <div className="alternate-trick-stack__cards">
                      {entry.cardIds.map((cardId) => {
                        const card = props.cardLookup.get(cardId);
                        return card ? (
                          <CardFace
                            key={`${entry.key}-${cardId}`}
                            card={card}
                            className="alternate-trick-card"
                          />
                        ) : null;
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="alternate-trick-area__empty">No cards in the center yet.</div>
              )}
            </div>
          </div>

          <aside className="alternate-reference-panel">
            <h2>Table Notes</h2>
            <ul>
              <li>Mah Jong sets the first wish.</li>
              <li>Phoenix can flex inside many combinations.</li>
              <li>Dragon is highest and gifts the trick away.</li>
              <li>Dog passes the lead to your partner.</li>
            </ul>
          </aside>

          {showPassPanel && props.passLaneViews.length > 0 && (
            <section className="alternate-pass-panel">
              <h2>Pass Lanes</h2>
              <div className="alternate-pass-panel__lanes">
                {props.passLaneViews.map((lane) => {
                  const assignedCard =
                    lane.assignedCardId && props.cardLookup.get(lane.assignedCardId);
                  return (
                    <div
                      key={lane.target}
                      className={[
                        "alternate-pass-lane",
                        props.selectedPassTarget === lane.target ? "is-selected" : "",
                        lane.assignedCardId ? "is-filled" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
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
                          props.onPassLaneDrop(lane.target, cardId);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="alternate-pass-lane__meta"
                        onClick={() => props.onPassTargetSelect(lane.target)}
                      >
                        <span>{lane.target.toUpperCase()}</span>
                        <strong>{lane.targetSeat}</strong>
                      </button>
                      {assignedCard ? (
                        <PassLaneCard
                          card={assignedCard}
                          onClick={() => props.onPassLaneCardClick(lane.target)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "application/x-tichu-pass-card",
                              assignedCard.id
                            );
                            props.onPassLaneCardDragStart(lane.target, assignedCard.id);
                          }}
                          onDragEnd={() =>
                            props.onPassLaneCardDragEnd(lane.target, assignedCard.id)
                          }
                        />
                      ) : (
                        <em>{props.passSelectionReady ? "Ready" : "Choose a card"}</em>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </section>

        <section className="alternate-south-zone" data-alt-seat="south">
          <div className="alternate-south-rail">
            <div className="alternate-south-rail__hand">
              <div className="alternate-hand">
                {props.sortedLocalHand.map((card) => (
                  <div
                    key={card.id}
                    className="alternate-hand__card-shell"
                    style={
                      {
                        "--alt-card-offset": String(props.sortedLocalHand.indexOf(card))
                      } as CSSProperties
                    }
                  >
                    <CardFace
                      card={card}
                      interactive={props.localCanInteract}
                      tone={props.localLegalCardIds.has(card.id) ? "legal" : "muted"}
                      selected={props.selectedCardIds.includes(card.id)}
                      className="alternate-hand__card"
                      draggable={props.localPassInteractionEnabled}
                      onClick={() => props.onLocalCardClick(card.id)}
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

            <div className="alternate-south-rail__footer">
              <AlternateSeatPlaque seat={southSeat} label="SOUTH / YOU" prominent />

              <div className="alternate-controls">
                <div className="alternate-controls__primary">
                  {props.normalActionRail.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={[
                        "alternate-action-button",
                        `alternate-action-button--${slot.tone}`
                      ].join(" ")}
                      disabled={!slot.enabled}
                      onClick={() => props.onNormalAction(slot.id)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>

                <div className="alternate-controls__secondary">
                  <button
                    type="button"
                    className="alternate-utility-button"
                    onClick={() => props.onSortModeChange("rank")}
                  >
                    Sort Rank
                  </button>
                  <button
                    type="button"
                    className="alternate-utility-button"
                    onClick={() => props.onSortModeChange("suit")}
                  >
                    Sort Suit
                  </button>
                  <button
                    type="button"
                    className="alternate-utility-button"
                    onClick={() => props.onSortModeChange("combo")}
                  >
                    Sort Combo
                  </button>
                  <button
                    type="button"
                    className="alternate-utility-button"
                    onClick={props.onClearLocalSelection}
                  >
                    Clear Selection
                  </button>
                  {props.canContinueAi && (
                    <button
                      type="button"
                      className="alternate-utility-button"
                      onClick={props.onContinueAi}
                    >
                      Continue AI
                    </button>
                  )}
                </div>
              </div>

              <div className="alternate-local-summary">
                <h2>Decision Summary</h2>
                <p>{props.localSummaryText}</p>
                {props.localActionSummary.length > 0 && (
                  <ul>
                    {props.localActionSummary.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {props.activePlayVariant && (
                  <p className="alternate-local-summary__variant">
                    {describeAction(props.activePlayVariant)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {(props.localDragonRecipients.length > 0 || props.wishDialogOpen) && (
            <div className="alternate-south-zone__support">
              {props.localDragonRecipients.length > 0 && (
                <section className="alternate-dragon-panel">
                  <h2>Dragon Gift</h2>
                  <div className="alternate-dragon-panel__buttons">
                    {props.localDragonRecipients.map((recipient) => (
                      <button
                        key={recipient}
                        type="button"
                        className="alternate-utility-button"
                        onClick={() => props.onDragonRecipientSelect(recipient)}
                      >
                        {recipient}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {props.wishDialogOpen && (
                <section className="alternate-wish-panel">
                  <h2>Mah Jong Wish</h2>
                  <div className="alternate-wish-panel__options">
                    {props.wishSelectionOptions.map((value) => (
                      <WishOptionButton
                        key={value === null ? "none" : value}
                        value={value}
                        active={props.resolvedWishRank === value}
                        onClick={() => props.onWishRankSelect(value)}
                      />
                    ))}
                  </div>
                  <div className="alternate-wish-panel__actions">
                    <button
                      type="button"
                      className="alternate-action-button alternate-action-button--primary"
                      disabled={props.wishConfirmDisabled || props.wishSubmissionPending}
                      onClick={props.onWishConfirm}
                    >
                      Confirm Wish
                    </button>
                    <button
                      type="button"
                      className="alternate-utility-button"
                      disabled={props.wishSubmissionPending}
                      onClick={props.onWishCancel}
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      </section>

      <section className="alternate-tabletop__footer">
        <div className="alternate-log-panel alternate-log-panel--compact">
          <h2>Recent Events</h2>
          <ul>
            {props.recentEvents.slice(-6).map((event) => (
              <li key={event}>{event}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function AlternateSeatPlaque({
  seat,
  label,
  vertical = false,
  prominent = false
}: {
  seat: SeatView;
  label: string;
  vertical?: boolean;
  prominent?: boolean;
}) {
  const tags = getSeatStatusTags(seat);

  return (
    <div
      className={[
        "alternate-seat-plaque",
        vertical ? "alternate-seat-plaque--vertical" : "",
        prominent ? "alternate-seat-plaque--prominent" : "",
        seat.isPrimarySeat ? "is-active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="alternate-seat-plaque__title">{label}</span>
      <div className="alternate-seat-plaque__tags">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="alternate-seat-tag">
              {tag}
            </span>
          ))
        ) : (
          <span className="alternate-seat-tag alternate-seat-tag--muted">
            READY
          </span>
        )}
      </div>
    </div>
  );
}
