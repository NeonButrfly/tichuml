import {
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent
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
import { NORMAL_PASS_STAGE_MAP, type PassLaneDirection, type SeatVisualPosition } from "./table-layout";
import {
  AlternateTableThreeSurface,
  type AlternateCameraPreset
} from "./alternate-table/three-surface";
import {
  createSouthPerspectiveProjector,
  resolvePassRouteWorldPose,
  resolveRemoteHandWorldPose,
  resolveScorePose,
  resolveSeatCountPose,
  resolveSeatLabelPose,
  resolveSouthHandWorldPose,
  resolveStatusPose,
  resolveTrickCardWorldPose,
  type SouthPerspectivePose
} from "./alternate-table/south-perspective-projection";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const CAMERA_YAW_BY_PRESET: Record<AlternateCameraPreset, number> = {
  left: -1,
  center: 0,
  right: 1
};

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

function projectedStyle(
  pose: SouthPerspectivePose,
  options?: { width?: number; extraTransform?: string }
): CSSProperties {
  return {
    left: `${pose.screenX}px`,
    top: `${pose.screenY}px`,
    zIndex: Math.round(pose.depth),
    width: options?.width ? `${options.width}px` : undefined,
    transform: `translate(-50%, -50%) scale(${pose.scale}) rotate(${pose.rotation}deg)${
      options?.extraTransform ? ` ${options.extraTransform}` : ""
    }`,
    filter: `drop-shadow(0 ${pose.shadowOffsetY}px ${pose.shadowBlur}px rgba(0, 0, 0, 0.35))`
  };
}

function renderBackCount(count: number) {
  return Math.max(1, Math.min(count, 6));
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

function SeatLabel({
  seat,
  label,
  style,
  subtle = false
}: {
  seat: SeatView;
  label: string;
  style: CSSProperties;
  subtle?: boolean;
}) {
  return (
    <div
      className={[
        "alternate-seat-label",
        seat.isPrimarySeat ? "is-active" : "",
        subtle ? "is-subtle" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-alt-seat-plaque={seat.position}
    >
      <span className="alternate-seat-label__title">{label}</span>
      <span className="alternate-seat-label__tags">
        {getSeatStatusTags(seat).join(" ")}
      </span>
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
  const dragStateRef = useRef<{ pointerId: number; startX: number; startYaw: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1440, height: 920 });
  const [cameraYaw, setCameraYaw] = useState(0);
  const [isStageRotating, setIsStageRotating] = useState(false);

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

  const handleCameraPresetSelect = useCallback((preset: AlternateCameraPreset) => {
    setCameraYaw(CAMERA_YAW_BY_PRESET[preset]);
  }, []);

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, .playing-card, [data-alt-pass-route], .alternate-choice-panel, [data-menu-surface]"
        )
      ) {
        return;
      }
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startYaw: cameraYaw
      };
      setIsStageRotating(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cameraYaw]
  );

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const delta = event.clientX - dragState.startX;
      const yawDelta = delta / Math.max(280, stageSize.width * 0.3);
      setCameraYaw(clamp(dragState.startYaw + yawDelta, -1, 1));
    },
    [stageSize.width]
  );

  const handleStagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      dragStateRef.current = null;
      setIsStageRotating(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  const projector = useMemo(
    () =>
      createSouthPerspectiveProjector({
        viewportWidth: stageSize.width,
        viewportHeight: stageSize.height,
        yaw: cameraYaw
      }),
    [cameraYaw, stageSize.height, stageSize.width]
  );

  const seatPositionBySeat = useMemo(
    () => new Map(props.seatViews.map((seat) => [seat.seat, seat.position] as const)),
    [props.seatViews]
  );

  const showPassRoutes =
    props.passRouteViews.length > 0 &&
    (props.state.phase === "pass_select" ||
      props.state.phase === "pass_reveal" ||
      props.state.phase === "exchange_complete");

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

  const cameraPreset =
    cameraYaw <= -0.35 ? "left" : cameraYaw >= 0.35 ? "right" : "center";
  const statusText = formatAlternatePhaseLabel(props.state.phase);
  const scorePose = resolveScorePose(projector);
  const statusPose = resolveStatusPose(projector);
  const northLabelPose = resolveSeatLabelPose(projector, "top");
  const westLabelPose = resolveSeatLabelPose(projector, "left");
  const eastLabelPose = resolveSeatLabelPose(projector, "right");
  const southLabelPose = resolveSeatLabelPose(projector, "bottom");
  const northCountPose = resolveSeatCountPose(projector, "top");
  const westCountPose = resolveSeatCountPose(projector, "left");
  const eastCountPose = resolveSeatCountPose(projector, "right");

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

      <section
        className={[
          "alternate-stage",
          isStageRotating ? "is-rotating" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
      >
        <AlternateTableThreeSurface
          geometry={projector.geometry}
          cameraYaw={cameraYaw}
        />

        <div
          className="alternate-overlay"
          style={
            {
              "--alt-camera-yaw": `${cameraYaw}`
            } as CSSProperties
          }
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
                aria-label="Rotate left"
                onClick={() => handleCameraPresetSelect("left")}
              >
                ◀
              </button>
              <button
                type="button"
                className={[
                  "alternate-camera-button",
                  cameraPreset === "center" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label="Center view"
                onClick={() => handleCameraPresetSelect("center")}
              >
                ●
              </button>
              <button
                type="button"
                className={[
                  "alternate-camera-button",
                  cameraPreset === "right" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label="Rotate right"
                onClick={() => handleCameraPresetSelect("right")}
              >
                ▶
              </button>
            </div>

            <div className="alternate-score-plaque" style={projectedStyle(scorePose)}>
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

          <div className="alternate-overlay__table">
            <div className="alternate-status-plaque" style={projectedStyle(statusPose)}>
              <span>{statusText}</span>
              {props.derived.currentWish ? <strong>Wish {formatRank(props.derived.currentWish)}</strong> : null}
            </div>

            <SeatLabel seat={northSeat} label="NORTH" style={projectedStyle(northLabelPose)} />
            <SeatLabel seat={westSeat} label="WEST" style={projectedStyle(westLabelPose)} subtle />
            <SeatLabel seat={eastSeat} label="EAST" style={projectedStyle(eastLabelPose)} subtle />
            <SeatLabel seat={southSeat} label="SOUTH" style={projectedStyle(southLabelPose)} />

            <div className="alternate-remote-hand" data-alt-seat="north">
              {Array.from({ length: renderBackCount(northSeat.handCount) }, (_, index) => {
                const world = resolveRemoteHandWorldPose({
                  position: "top",
                  index,
                  count: renderBackCount(northSeat.handCount)
                });
                const pose = projector.projectPoint(world, { rotation: world.rotation });
                return (
                  <span
                    key={`north-back-${index}`}
                    className="alternate-card-back alternate-card-back--projected"
                    data-alt-card-back="true"
                    style={projectedStyle(pose, { width: 84 })}
                    aria-hidden="true"
                  />
                );
              })}
              <span className="alternate-seat-count" style={projectedStyle(northCountPose)}>
                {northSeat.handCount}
              </span>
            </div>

            <div className="alternate-remote-hand" data-alt-seat="west">
              {Array.from({ length: renderBackCount(westSeat.handCount) }, (_, index) => {
                const world = resolveRemoteHandWorldPose({
                  position: "left",
                  index,
                  count: renderBackCount(westSeat.handCount)
                });
                const pose = projector.projectPoint(world, { rotation: world.rotation });
                return (
                  <span
                    key={`west-back-${index}`}
                    className="alternate-card-back alternate-card-back--projected"
                    data-alt-card-back="true"
                    style={projectedStyle(pose, { width: 82 })}
                    aria-hidden="true"
                  />
                );
              })}
              <span className="alternate-seat-count" style={projectedStyle(westCountPose)}>
                {westSeat.handCount}
              </span>
            </div>

            <div className="alternate-remote-hand" data-alt-seat="east">
              {Array.from({ length: renderBackCount(eastSeat.handCount) }, (_, index) => {
                const world = resolveRemoteHandWorldPose({
                  position: "right",
                  index,
                  count: renderBackCount(eastSeat.handCount)
                });
                const pose = projector.projectPoint(world, { rotation: world.rotation });
                return (
                  <span
                    key={`east-back-${index}`}
                    className="alternate-card-back alternate-card-back--projected"
                    data-alt-card-back="true"
                    style={projectedStyle(pose, { width: 82 })}
                    aria-hidden="true"
                  />
                );
              })}
              <span className="alternate-seat-count" style={projectedStyle(eastCountPose)}>
                {eastSeat.handCount}
              </span>
            </div>

            {showPassRoutes &&
              props.passRouteViews.flatMap((route) => {
                const targetPosition = seatPositionBySeat.get(route.targetSeat);
                if (!targetPosition) {
                  return [];
                }
                const direction =
                  NORMAL_PASS_STAGE_MAP[route.sourcePosition].find(
                    (entry) => entry.targetPosition === targetPosition
                  )?.direction ?? "up";
                const world = resolvePassRouteWorldPose({
                  sourcePosition: route.sourcePosition,
                  targetPosition,
                  direction,
                  displayMode: route.displayMode
                });
                const pose = projector.projectPoint(world, { rotation: world.rotation });
                const assignedCard =
                  route.visibleCardId === null ? null : props.cardLookup.get(route.visibleCardId) ?? null;
                const className = [
                  "alternate-pass-route",
                  route.interactive ? "is-interactive" : "",
                  route.occupied ? "is-occupied" : "",
                  route.displayMode === "pickup" ? "is-pickup" : "",
                  props.selectedPassTarget === route.target && route.interactive ? "is-selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                const style = projectedStyle(pose, { width: 66 });
                const directionAttr: PassLaneDirection = direction;

                if (route.interactive && assignedCard) {
                  return (
                    <div
                      key={route.key}
                      className={className}
                      style={style}
                      data-alt-pass-route={route.key}
                      data-pass-direction={directionAttr}
                      onClick={() => props.onPassTargetSelect(route.target)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const cardId = event.dataTransfer.getData("application/x-tichu-pass-card");
                        if (cardId) {
                          props.onPassLaneDrop(route.target, cardId);
                        }
                      }}
                    >
                      <PassRouteCard
                        card={assignedCard}
                        onClick={() => props.onPassLaneCardClick(route.target)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-tichu-pass-card", assignedCard.id);
                          props.onPassLaneCardDragStart(route.target, assignedCard.id);
                        }}
                        onDragEnd={() => props.onPassLaneCardDragEnd(route.target, assignedCard.id)}
                      />
                    </div>
                  );
                }

                if (route.interactive) {
                  return (
                    <button
                      key={route.key}
                      type="button"
                      className={className}
                      style={style}
                      data-alt-pass-route={route.key}
                      data-pass-direction={directionAttr}
                      onClick={() => props.onPassTargetSelect(route.target)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const cardId = event.dataTransfer.getData("application/x-tichu-pass-card");
                        if (cardId) {
                          props.onPassLaneDrop(route.target, cardId);
                        }
                      }}
                    />
                  );
                }

                return (
                  <div
                    key={route.key}
                    className={className}
                    style={style}
                    data-alt-pass-route={route.key}
                    data-pass-direction={directionAttr}
                  >
                    {assignedCard ? (
                      <CardFace card={assignedCard} className="alternate-pass-route__card" />
                    ) : route.occupied ? (
                      <span className="alternate-pass-route__hidden-card" aria-hidden="true" />
                    ) : null}
                  </div>
                );
              })}

            <div className="alternate-trick-plane">
              {currentTrickEntries.map((entry) =>
                entry.cardIds.map((cardId, index) => {
                  const card = props.cardLookup.get(cardId);
                  if (!card) {
                    return null;
                  }
                  const world = resolveTrickCardWorldPose({
                    position: entry.seatPosition,
                    index,
                    count: entry.cardIds.length,
                    winning: entry.winning
                  });
                  const pose = projector.projectPoint(world, { rotation: world.rotation });
                  return (
                    <div
                      key={`${entry.key}-${cardId}`}
                      className={[
                        "alternate-trick-stack",
                        entry.winning ? "is-winning" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={projectedStyle(pose, { width: 98 })}
                    >
                      <CardFace
                        card={card}
                        className="alternate-trick-card"
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="alternate-south-hand" data-alt-seat="south">
              {props.sortedLocalHand.map((card, index) => {
                const world = resolveSouthHandWorldPose({
                  index,
                  count: props.sortedLocalHand.length,
                  selected: props.selectedCardIds.includes(card.id)
                });
                const pose = projector.projectPoint(world, { rotation: world.rotation });

                return (
                  <div
                    key={card.id}
                    className="alternate-south-hand__card-shell"
                    style={projectedStyle(pose, { width: 106 })}
                  >
                    <CardFace
                      card={card}
                      interactive={props.localCanInteract}
                      tone={props.localLegalCardIds.has(card.id) ? "legal" : "muted"}
                      selected={props.selectedCardIds.includes(card.id)}
                      className="alternate-south-hand__card"
                      style={{ width: "106px" }}
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
