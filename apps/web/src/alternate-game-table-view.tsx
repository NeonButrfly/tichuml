import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent
} from "react";
import type { Card } from "@tichuml/engine";
import {
  CardFace,
  GameChromeMenu,
  formatRank,
  type GameTableViewProps,
  type SeatView,
  type WishSelectionValue
} from "./game-table-views";
import { resolveAlternateTableLayout, type AlternatePassRoutePlacement, type Rect } from "./alternate-table/layout";
import { resolveAlternateSouthHandLayout } from "./alternate-table/hand-layout";
import {
  AlternateTableThreeSurface,
  type AlternateCameraPreset
} from "./alternate-table/three-surface";

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
    tags.push("TURN");
  }
  if (seat.isThinkingSeat) {
    tags.push("THINK");
  }
  if (seat.callState.grandTichu) {
    tags.push("GT");
  } else if (seat.callState.smallTichu) {
    tags.push("T");
  }
  if (seat.passReady) {
    tags.push("READY");
  }
  return tags.slice(0, 3);
}

function rectStyle(rect: Rect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

function renderAltCardBacks(count: number, axis: "horizontal" | "vertical") {
  const visibleCount = Math.max(1, Math.min(count, 7));
  return Array.from({ length: visibleCount }).map((_, index) => (
    <span
      key={`${axis}-${index}`}
      className={[
        "alternate-card-back",
        axis === "vertical" ? "alternate-card-back--vertical" : ""
      ]
        .filter(Boolean)
        .join(" ")}
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

function formatAlternatePhaseLabel(
  phase: GameTableViewProps["state"]["phase"]
): string {
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

function PassRouteCard({
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
      className="alternate-pass-route__card"
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

function AlternateSeatPlaque({
  seat,
  label,
  style,
  vertical = false,
  prominent = false
}: {
  seat: SeatView;
  label: string;
  style: CSSProperties;
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
      style={style}
      data-alt-seat-plaque={seat.position}
    >
      <span className="alternate-seat-plaque__title">{label}</span>
      <div className="alternate-seat-plaque__tags">
        {tags.map((tag) => (
          <span key={tag} className="alternate-seat-tag">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function AlternatePassRouteSlot({
  route,
  cardLookup,
  selectedPassTarget,
  onPassTargetSelect,
  onPassLaneDrop,
  onPassLaneCardClick,
  onPassLaneCardDragStart,
  onPassLaneCardDragEnd
}: {
  route: AlternatePassRoutePlacement;
  cardLookup: ReadonlyMap<string, Card>;
  selectedPassTarget: GameTableViewProps["selectedPassTarget"];
  onPassTargetSelect: GameTableViewProps["onPassTargetSelect"];
  onPassLaneDrop: GameTableViewProps["onPassLaneDrop"];
  onPassLaneCardClick: GameTableViewProps["onPassLaneCardClick"];
  onPassLaneCardDragStart: GameTableViewProps["onPassLaneCardDragStart"];
  onPassLaneCardDragEnd: GameTableViewProps["onPassLaneCardDragEnd"];
}) {
  const assignedCard =
    route.visibleCardId === null ? null : cardLookup.get(route.visibleCardId) ?? null;
  const className = [
    "alternate-pass-route",
    route.interactive ? "is-interactive" : "",
    route.occupied ? "is-occupied" : "",
    route.displayMode === "pickup" ? "is-pickup" : "",
    selectedPassTarget === route.target && route.interactive ? "is-selected" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    ...rectStyle(route.rect),
    transform: `rotate(${route.rotation}deg)`
  } satisfies CSSProperties;

  if (route.interactive && assignedCard) {
    return (
      <div
        className={className}
        style={style}
        data-alt-pass-route={route.key}
        data-pass-direction={route.direction}
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
        <PassRouteCard
          card={assignedCard}
          onClick={() => onPassLaneCardClick(route.target)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-tichu-pass-card", assignedCard.id);
            onPassLaneCardDragStart(route.target, assignedCard.id);
          }}
          onDragEnd={() => onPassLaneCardDragEnd(route.target, assignedCard.id)}
        />
      </div>
    );
  }

  if (route.interactive) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        data-alt-pass-route={route.key}
        data-pass-direction={route.direction}
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
      </button>
    );
  }

  return (
    <div
      className={className}
      style={style}
      data-alt-pass-route={route.key}
      data-pass-direction={route.direction}
    >
      {assignedCard ? (
        <CardFace card={assignedCard} className="alternate-pass-route__card" />
      ) : route.occupied ? (
        <span className="alternate-pass-route__hidden-card" aria-hidden="true" />
      ) : null}
    </div>
  );
}

export function AlternateGameTableView(props: GameTableViewProps) {
  const northSeat = getSeatByPosition(props.seatViews, "top");
  const westSeat = getSeatByPosition(props.seatViews, "left");
  const eastSeat = getSeatByPosition(props.seatViews, "right");
  const southSeat = getSeatByPosition(props.seatViews, "bottom");
  const weScore = getScoreValue(props.derived.matchScore, "team-0");
  const theyScore = getScoreValue(props.derived.matchScore, "team-1");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1440, height: 920 });
  const [cameraPreset, setCameraPreset] =
    useState<AlternateCameraPreset>("center");

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }
    const element = stageRef.current;
    const update = () => {
      const nextWidth = Math.max(960, Math.round(element.clientWidth));
      const nextHeight = Math.max(640, Math.round(element.clientHeight));
      setStageSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showPassRoutes =
    props.passRouteViews.length > 0 &&
    (props.state.phase === "pass_select" ||
      props.state.phase === "pass_reveal" ||
      props.state.phase === "exchange_complete");

  const layout = useMemo(
    () =>
      resolveAlternateTableLayout({
        width: stageSize.width,
        height: stageSize.height,
        seatViews: props.seatViews,
        passRouteViews: showPassRoutes ? props.passRouteViews : [],
        normalTableLayout: props.normalTableLayout,
        hasVariantPicker: props.matchingPlayActions.length > 1,
        hasWishPicker: Boolean(props.activePlayVariant?.availableWishRanks)
      }),
    [
      props.activePlayVariant?.availableWishRanks,
      props.matchingPlayActions.length,
      props.normalTableLayout,
      props.passRouteViews,
      props.seatViews,
      showPassRoutes,
      stageSize.height,
      stageSize.width
    ]
  );
  const southHandLayout = useMemo(
    () =>
      resolveAlternateSouthHandLayout({
        count: props.sortedLocalHand.length,
        rackWidth: layout.seats.bottom.rack.width,
        baseCardWidth: layout.southHandCardWidth
      }),
    [layout.seats.bottom.rack.width, layout.southHandCardWidth, props.sortedLocalHand.length]
  );

  const currentTrickEntries = props.seatRelativePlays.flatMap(({ plays, position }) =>
    plays.map((play, index) => ({
      key: `${position}-${play.combination.key}-${index}`,
      seatPosition: position,
      cardIds: play.combination.cardIds,
      winning:
        props.displayedTrick?.currentWinner === play.seat &&
        props.displayedTrick?.currentCombination.key === play.combination.key
    }))
  );

  const statusText = formatAlternatePhaseLabel(props.state.phase);

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

      <section className="alternate-stage" ref={stageRef}>
        <AlternateTableThreeSurface
          layout={layout}
          cameraPreset={cameraPreset}
        />

        <div
          className={[
            "alternate-overlay",
            `alternate-overlay--camera-${cameraPreset}`
          ].join(" ")}
        >
          <div className="alternate-overlay__hud">
            <div className="alternate-camera-controls" role="group" aria-label="Perspective">
              <button
                type="button"
                className={[
                  "alternate-camera-button",
                  cameraPreset === "left" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCameraPreset("left")}
              >
                Left View
              </button>
              <button
                type="button"
                className={[
                  "alternate-camera-button",
                  cameraPreset === "center" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCameraPreset("center")}
              >
                Center View
              </button>
              <button
                type="button"
                className={[
                  "alternate-camera-button",
                  cameraPreset === "right" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCameraPreset("right")}
              >
                Right View
              </button>
            </div>

            <div className="alternate-score-plaque" style={rectStyle(layout.scoreRect)}>
              <div>
                <span>WE</span>
                <strong>{weScore}</strong>
              </div>
              <em>:</em>
              <div>
                <span>THEY</span>
                <strong>{theyScore}</strong>
              </div>
            </div>
          </div>

          <div
            className={[
              "alternate-overlay__table",
              `alternate-overlay__table--camera-${cameraPreset}`
            ].join(" ")}
          >
            <div className="alternate-status-plaque" style={rectStyle(layout.statusRect)}>
              <span>{statusText}</span>
              {props.derived.currentWish ? <strong>Wish {formatRank(props.derived.currentWish)}</strong> : null}
            </div>

            <AlternateSeatPlaque
              seat={northSeat}
              label="NORTH"
              style={rectStyle(layout.seats.top.plaque)}
            />
            <div
              className="alternate-remote-rack alternate-remote-rack--north"
              style={rectStyle(layout.seats.top.rack)}
              data-alt-seat="north"
            >
              <div className="alternate-remote-rack__cards">{renderAltCardBacks(northSeat.handCount, "horizontal")}</div>
            </div>

            <AlternateSeatPlaque
              seat={westSeat}
              label="WEST"
              style={rectStyle(layout.seats.left.plaque)}
              vertical
            />
            <div
              className="alternate-remote-rack alternate-remote-rack--west"
              style={rectStyle(layout.seats.left.rack)}
              data-alt-seat="west"
            >
              <div className="alternate-remote-rack__cards">{renderAltCardBacks(westSeat.handCount, "vertical")}</div>
              <span className="alternate-remote-rack__count">{westSeat.handCount}</span>
            </div>

            <AlternateSeatPlaque
              seat={eastSeat}
              label="EAST"
              style={rectStyle(layout.seats.right.plaque)}
              vertical
            />
            <div
              className="alternate-remote-rack alternate-remote-rack--east"
              style={rectStyle(layout.seats.right.rack)}
              data-alt-seat="east"
            >
              <div className="alternate-remote-rack__cards">{renderAltCardBacks(eastSeat.handCount, "vertical")}</div>
              <span className="alternate-remote-rack__count">{eastSeat.handCount}</span>
            </div>

            {showPassRoutes &&
              layout.passRoutes.map((route) => (
                <AlternatePassRouteSlot
                  key={route.key}
                  route={route}
                  cardLookup={props.cardLookup}
                  selectedPassTarget={props.selectedPassTarget}
                  onPassTargetSelect={props.onPassTargetSelect}
                  onPassLaneDrop={props.onPassLaneDrop}
                  onPassLaneCardClick={props.onPassLaneCardClick}
                  onPassLaneCardDragStart={props.onPassLaneCardDragStart}
                  onPassLaneCardDragEnd={props.onPassLaneCardDragEnd}
                />
              ))}

            <div className="alternate-trick-area" style={rectStyle(layout.trickRect)}>
              {currentTrickEntries.length > 0 ? (
                currentTrickEntries.map((entry) => {
                  const placement = layout.trickPlacements[entry.seatPosition];
                  return (
                    <div
                      key={entry.key}
                      className={[
                        "alternate-trick-stack",
                        entry.winning ? "is-winning" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        {
                          left: `${placement.x - layout.trickRect.x}px`,
                          top: `${placement.y - layout.trickRect.y}px`,
                          transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`
                        } as CSSProperties
                      }
                    >
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
                  );
                })
              ) : null}
            </div>

            <div
              className="alternate-south-hand"
              style={rectStyle(layout.seats.bottom.rack)}
              data-alt-seat="south"
            >
              {props.sortedLocalHand.map((card, index) => {
                const placement = southHandLayout.placements[index];
                if (!placement) {
                  return null;
                }
                return (
                  <div
                    key={card.id}
                    className="alternate-south-hand__card-shell"
                    style={
                      {
                        transform: `translateX(calc(${placement.offsetPx}px - 50%)) translateY(${placement.liftPx}px) rotate(${placement.rotationDeg}deg)`,
                        zIndex: 100 + index
                      } as CSSProperties
                    }
                  >
                    <CardFace
                      card={card}
                      interactive={props.localCanInteract}
                      tone={props.localLegalCardIds.has(card.id) ? "legal" : "muted"}
                      selected={props.selectedCardIds.includes(card.id)}
                      className="alternate-south-hand__card"
                      style={{ width: `${southHandLayout.cardWidth}px` }}
                      draggable={props.localPassInteractionEnabled}
                      onClick={() => props.onLocalCardClick(card.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-tichu-pass-card", card.id);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <AlternateSeatPlaque
              seat={southSeat}
              label="SOUTH"
              style={rectStyle(layout.seats.bottom.plaque)}
              prominent
            />

            <div className="alternate-controls" style={rectStyle(layout.southControlRect)}>
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
                <button
                  type="button"
                  className="alternate-utility-button"
                  onClick={props.onClearLocalSelection}
                >
                  Clear
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
          </div>

          {props.localDragonRecipients.length > 0 && (
            <section className="alternate-choice-panel alternate-choice-panel--dragon">
              <h2>Dragon Gift</h2>
              <div className="alternate-choice-panel__buttons">
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
            <section className="alternate-choice-panel alternate-choice-panel--wish">
              <h2>Mah Jong Wish</h2>
              <div className="alternate-choice-panel__options">
                {props.wishSelectionOptions.map((value) => (
                  <WishOptionButton
                    key={value === null ? "none" : value}
                    value={value}
                    active={props.resolvedWishRank === value}
                    onClick={() => props.onWishRankSelect(value)}
                  />
                ))}
              </div>
              <div className="alternate-choice-panel__buttons">
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
      </section>
    </main>
  );
}
