import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { Card } from "@tichuml/engine";
import {
  GameChromeMenu,
  formatRank,
  type GameTableViewProps,
  type SeatView,
  type WishSelectionValue
} from "./game-table-views";
import { NORMAL_PASS_STAGE_MAP, type PassLaneDirection } from "./table-layout";
import {
  AlternateTablePhaserSurface,
  type AlternateCameraPreset,
  type ImmersiveSceneCard,
  type ImmersiveSceneModel,
  type ImmersiveScenePassRoute,
  type ImmersiveSceneSeat
} from "./alternate-table/phaser-surface";
import {
  createSouthPerspectiveProjector,
  resolvePassRouteWorldPose,
  resolveRemoteHandWorldPose,
  resolveScorePose,
  resolveSeatCountPose,
  resolveSeatLabelPose,
  resolveSouthPerspectiveDebugLayout,
  resolveSouthHandWorldPose,
  resolveStatusPose,
  resolveTrickCardWorldPose,
  type SouthPerspectivePose
} from "./alternate-table/south-perspective-projection";

const CARD_HEIGHT_RATIO = 1.42;
const CAMERA_YAW_BY_PRESET: Record<AlternateCameraPreset, number> = {
  left: -1,
  center: 0,
  right: 1
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getSeatByPosition(
  seatViews: readonly SeatView[],
  position: SeatView["position"]
) {
  const seat = seatViews.find((entry) => entry.position === position);
  if (!seat) {
    throw new Error(`Missing ${position} seat view for immersive table.`);
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
  if (phase === "trick_play") {
    return "WAITING";
  }
  return "SEATED";
}

function renderBackCount(count: number) {
  return Math.max(1, Math.min(count, 5));
}

function formatAlternatePhaseLabel(
  phase: GameTableViewProps["state"]["phase"]
) {
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

function boxStyle(
  pose: SouthPerspectivePose,
  width: number,
  height: number,
  extraZ = 0
): CSSProperties {
  return {
    left: `${pose.screenX}px`,
    top: `${pose.screenY}px`,
    width: `${width}px`,
    height: `${height}px`,
    zIndex: String(Math.round(pose.depth + extraZ)),
    transform: `translate(-50%, -50%) rotate(${pose.rotation}deg)`
  };
}

function toRenderedCard(
  position: SeatView["position"],
  card: Card,
  pose: SouthPerspectivePose,
  baseWidth: number,
  options?: {
    selected?: boolean;
    faceDown?: boolean;
    legal?: boolean;
    winning?: boolean;
  }
): ImmersiveSceneCard {
  const width = baseWidth * pose.scale;
  return {
    key: `${position}-${card.id}-${Math.round(pose.screenX)}-${Math.round(pose.screenY)}`,
    card,
    position,
    pose,
    width,
    height: width * CARD_HEIGHT_RATIO,
    selected: options?.selected,
    faceDown: options?.faceDown,
    legal: options?.legal,
    winning: options?.winning
  };
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

function getSeatTitleBySeatId(
  seatViews: readonly SeatView[],
  seatId: string | null
) {
  if (!seatId) {
    return "None";
  }
  return seatViews.find((seat) => seat.seat === seatId)?.title ?? seatId;
}

function useImmersiveLayoutDebugFlag() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("layoutDebug") === "1";
  }, []);
}

export function AlternateGameTableView(props: GameTableViewProps) {
  const northSeat = getSeatByPosition(props.seatViews, "top");
  const westSeat = getSeatByPosition(props.seatViews, "left");
  const eastSeat = getSeatByPosition(props.seatViews, "right");
  const southSeat = getSeatByPosition(props.seatViews, "bottom");
  const weScore = getScoreValue(props.derived.matchScore, "team-0");
  const theyScore = getScoreValue(props.derived.matchScore, "team-1");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startYaw: number;
  } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1500, height: 980 });
  const [cameraYaw, setCameraYaw] = useState(0);
  const [isStageRotating, setIsStageRotating] = useState(false);
  const layoutDebugEnabled = useImmersiveLayoutDebugFlag();

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }
    const element = stageRef.current;
    const update = () => {
      const nextWidth = Math.max(320, Math.round(element.clientWidth));
      const nextHeight = Math.max(320, Math.round(element.clientHeight));
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
      if (!layoutDebugEnabled) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, .alternate-choice-panel, .alternate-controls, .alternate-hud, [data-menu-surface]"
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
    [cameraYaw, layoutDebugEnabled]
  );

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!layoutDebugEnabled || !dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const delta = event.clientX - dragState.startX;
      const yawDelta = delta / Math.max(280, stageSize.width * 0.28);
      setCameraYaw(clamp(dragState.startYaw + yawDelta, -1, 1));
    },
    [layoutDebugEnabled, stageSize.width]
  );

  const handleStagePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!layoutDebugEnabled || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setIsStageRotating(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [layoutDebugEnabled]);

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

  const cameraPreset =
    cameraYaw <= -0.35 ? "left" : cameraYaw >= 0.35 ? "right" : "center";
  const statusText = formatAlternatePhaseLabel(props.state.phase);
  const currentWishLabel =
    props.derived.currentWish === null ? "None" : formatRank(props.derived.currentWish);
  const trickSummary = props.displayedTrick
    ? `${props.displayedTrick.entries.length} cards`
    : "Empty";
  const dogSummary = props.dogLeadAnimation
    ? `To ${getSeatTitleBySeatId(props.seatViews, props.dogLeadAnimation.targetSeat)}`
    : "None";
  const nextSeatLabel = getSeatTitleBySeatId(props.seatViews, props.derived.activeSeat);
  const layoutDebug = useMemo(
    () => resolveSouthPerspectiveDebugLayout(projector),
    [projector]
  );
  const grandTichuLabel = props.seatViews.some((seat) => seat.callState.grandTichu)
    ? "Called"
    : "Off";

  const sceneModel = useMemo<ImmersiveSceneModel>(() => {
    const seats: ImmersiveSceneSeat[] = [
      {
        key: "north",
        position: "top",
        title: `${northSeat.title}${northSeat.isLocalSeat ? " (YOU)" : " (AI)"}`,
        relation: northSeat.relation,
        status: getSeatStatusText(northSeat, props.state.phase),
        handCount: northSeat.handCount,
        isActive: northSeat.isPrimarySeat,
        pose: resolveSeatLabelPose(projector, "top"),
        countPose: resolveSeatCountPose(projector, "top")
      },
      {
        key: "west",
        position: "left",
        title: `${westSeat.title}${westSeat.isLocalSeat ? " (YOU)" : " (AI)"}`,
        relation: westSeat.relation,
        status: getSeatStatusText(westSeat, props.state.phase),
        handCount: westSeat.handCount,
        isActive: westSeat.isPrimarySeat,
        pose: resolveSeatLabelPose(projector, "left"),
        countPose: resolveSeatCountPose(projector, "left")
      },
      {
        key: "east",
        position: "right",
        title: `${eastSeat.title}${eastSeat.isLocalSeat ? " (YOU)" : " (AI)"}`,
        relation: eastSeat.relation,
        status: getSeatStatusText(eastSeat, props.state.phase),
        handCount: eastSeat.handCount,
        isActive: eastSeat.isPrimarySeat,
        pose: resolveSeatLabelPose(projector, "right"),
        countPose: resolveSeatCountPose(projector, "right")
      },
      {
        key: "south",
        position: "bottom",
        title: `${southSeat.title}${southSeat.isLocalSeat ? " (YOU)" : " (AI)"}`,
        relation: southSeat.relation,
        status: getSeatStatusText(southSeat, props.state.phase),
        handCount: southSeat.handCount,
        isActive: southSeat.isPrimarySeat,
        pose: resolveSeatLabelPose(projector, "bottom"),
        countPose: null
      }
    ];

    const remoteCards: ImmersiveSceneCard[] = [];
    for (const [position, seat] of [
      ["top", northSeat],
      ["left", westSeat],
      ["right", eastSeat]
    ] as const) {
      for (
        let index = 0;
        index < renderBackCount(seat.handCount);
        index += 1
      ) {
        const world = resolveRemoteHandWorldPose({
          position,
          index,
          count: renderBackCount(seat.handCount)
        });
        const pose = projector.projectPoint(world, { rotation: world.rotation });
        remoteCards.push(
          toRenderedCard(position, { id: `back-${position}-${index}`, kind: "special", special: "dragon" }, pose, position === "top" ? 92 : 84, {
            faceDown: true
          })
        );
      }
    }

    const southCards = props.sortedLocalHand.map((card, index) => {
      const world = resolveSouthHandWorldPose({
        index,
        count: props.sortedLocalHand.length,
        selected: props.selectedCardIds.includes(card.id)
      });
      const pose = projector.projectPoint(world, { rotation: world.rotation });
      return toRenderedCard("bottom", card, pose, 112, {
        selected: props.selectedCardIds.includes(card.id),
        legal: props.localLegalCardIds.has(card.id)
      });
    });

    const trickCards = props.seatRelativePlays.flatMap(({ plays, position }) =>
      plays.flatMap((play, playIndex) =>
        play.combination.cardIds.flatMap((cardId, index) => {
          const card = props.cardLookup.get(cardId);
          if (!card) {
            return [];
          }
          const world = resolveTrickCardWorldPose({
            position,
            index: index + playIndex * 0.15,
            count: play.combination.cardIds.length,
            winning:
              props.displayedTrick?.currentWinner === play.seat &&
              props.displayedTrick?.currentCombination.key === play.combination.key
          });
          const pose = projector.projectPoint(world, { rotation: world.rotation });
          return [
            toRenderedCard(position, card, pose, 100, {
              winning:
                props.displayedTrick?.currentWinner === play.seat &&
                props.displayedTrick?.currentCombination.key === play.combination.key
            })
          ];
        })
      )
    );

    const passRoutes: ImmersiveScenePassRoute[] = showPassRoutes
      ? props.passRouteViews.flatMap((route) => {
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
          return [
            {
              key: route.key,
              pose,
              width: 74 * pose.scale,
              height: 102 * pose.scale,
              sourcePosition: route.sourcePosition,
              targetPosition,
              direction,
              displayMode: route.displayMode,
              occupied: route.occupied,
              interactive: route.interactive,
              selected: props.selectedPassTarget === route.target && route.interactive,
              faceDown: route.faceDown,
              assignedCard
            }
          ];
        })
      : [];

    return {
      geometry: projector.geometry,
      cameraYaw,
      phaseLabel: statusText,
      currentWishLabel,
      hintLabel: props.localSummaryText || props.controlHint,
      score: {
        we: weScore,
        they: theyScore,
        pose: resolveScorePose(projector)
      },
      statusPose: resolveStatusPose(projector),
      seats,
      remoteCards,
      southCards,
      trickCards,
      passRoutes
    };
  }, [
    cameraYaw,
    currentWishLabel,
    eastSeat,
    nextSeatLabel,
    northSeat,
    projector,
    props.cardLookup,
    props.controlHint,
    props.displayedTrick,
    props.localLegalCardIds,
    props.localSummaryText,
    props.passRouteViews,
    props.derived.activeSeat,
    props.derived.currentWish,
    props.seatRelativePlays,
    props.seatViews,
    props.selectedCardIds,
    props.selectedPassTarget,
    props.sortedLocalHand,
    props.state.phase,
    seatPositionBySeat,
    showPassRoutes,
    southSeat,
    statusText,
    theyScore,
    weScore,
    westSeat
  ]);

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
        <AlternateTablePhaserSurface model={sceneModel} />

        <div
          className="alternate-overlay"
          style={
            {
              "--alt-camera-yaw": `${cameraYaw}`
            } as CSSProperties
          }
        >
          <div className="alternate-hud">
            <section className="alternate-side-panel alternate-side-panel--status">
              <div className="alternate-branding">
                <span className="alternate-branding__mark" aria-hidden="true">
                  TICHU
                </span>
              </div>
              <div className="alternate-side-panel__rows">
                <div>
                  <span>Round Seed</span>
                  <strong>{props.roundSeed.slice(0, 8)}</strong>
                </div>
                <div>
                  <span>Decision Count</span>
                  <strong>{props.decisionCount}</strong>
                </div>
                <div>
                  <span>Phase</span>
                  <strong>{statusText}</strong>
                </div>
                <div>
                  <span>Grand Tichu</span>
                  <strong>{grandTichuLabel}</strong>
                </div>
                <div>
                  <span>Your Wish</span>
                  <strong>{currentWishLabel}</strong>
                </div>
              </div>
            </section>

            <div className="alternate-top-actions" role="group" aria-label="Table tools">
              <button
                type="button"
                className="alternate-top-button"
                onClick={() => props.onUiCommand("open_how_to_play_dialog")}
              >
                Rules
              </button>
              <button
                type="button"
                className="alternate-top-button"
                onClick={() => props.onUiCommand("open_backend_settings_dialog")}
              >
                Settings
              </button>
              {layoutDebugEnabled && (
                <div className="alternate-camera-controls" role="group" aria-label="Perspective">
                  <button
                    type="button"
                    className={[
                      "alternate-camera-button",
                      cameraPreset === "left" ? "is-active" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleCameraPresetSelect("left")}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className={[
                      "alternate-camera-button",
                      cameraPreset === "center" ? "is-active" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleCameraPresetSelect("center")}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className={[
                      "alternate-camera-button",
                      cameraPreset === "right" ? "is-active" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleCameraPresetSelect("right")}
                  >
                    Right
                  </button>
                </div>
              )}
            </div>

            <section className="alternate-side-panel alternate-side-panel--state">
              <h2>Game State</h2>
              <div className="alternate-side-panel__rows">
                <div>
                  <span>Phase</span>
                  <strong>{statusText}</strong>
                </div>
                <div>
                  <span>Trick</span>
                  <strong>{trickSummary}</strong>
                </div>
                <div>
                  <span>Dog</span>
                  <strong>{dogSummary}</strong>
                </div>
                <div>
                  <span>Next</span>
                  <strong>{nextSeatLabel}</strong>
                </div>
              </div>
              <button
                type="button"
                className="alternate-side-panel__footer-button"
                onClick={() => props.onUiCommand("open_score_history_dialog")}
              >
                Game Log
              </button>
            </section>

            <div className="alternate-hit-layer">
              <div aria-hidden="true">
                {sceneModel.remoteCards.map((card) => (
                  <span key={card.key} data-alt-card-back="true" />
                ))}
              </div>
              <div data-alt-seat="south">
                {sceneModel.southCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className="playing-card alternate-hitbox-card"
                    style={boxStyle(card.pose, card.width, card.height, 20)}
                    aria-label={`Select ${card.card.id}`}
                    disabled={!props.localCanInteract}
                    draggable={props.localPassInteractionEnabled}
                    onClick={() => props.onLocalCardClick(card.card.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-tichu-pass-card", card.card.id);
                    }}
                  />
                ))}
              </div>

              {sceneModel.passRoutes.map((route) => (
                <button
                  key={route.key}
                  type="button"
                  className="alternate-hitbox-route"
                  style={boxStyle(route.pose, route.width, route.height, 12)}
                  data-alt-pass-route={route.key}
                  data-pass-direction={route.direction}
                  aria-label={`Pass route ${route.key}`}
                  disabled={!route.interactive}
                  onClick={() => {
                    const target = props.passRouteViews.find((entry) => entry.key === route.key)?.target;
                    if (target) {
                      props.onPassTargetSelect(target);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const target = props.passRouteViews.find((entry) => entry.key === route.key)?.target;
                    const cardId = event.dataTransfer.getData("application/x-tichu-pass-card");
                    if (target && cardId) {
                      props.onPassLaneDrop(target, cardId);
                    }
                  }}
                />
              ))}
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

            <div className="alternate-semantic-mirror" aria-live="polite">
              <span>WE</span>
              <span>THEY</span>
              <span>Game State</span>
              <span>Phase</span>
              <span>{statusText}</span>
              <span>{trickSummary}</span>
              <span>{dogSummary}</span>
              <span>{nextSeatLabel}</span>
            </div>
          </div>
        </div>

        {layoutDebugEnabled && (
          <div className="alternate-layout-debug" aria-hidden="true">
            <div
              className="alternate-layout-debug__rect alternate-layout-debug__rect--table"
              style={{
                left: `${layoutDebug.tableRect.left}px`,
                top: `${layoutDebug.tableRect.top}px`,
                width: `${layoutDebug.tableRect.width}px`,
                height: `${layoutDebug.tableRect.height}px`
              }}
            />
            {[layoutDebug.safeTopLeft, layoutDebug.safeBottomLeft, layoutDebug.safeBottomRight].map(
              (zone, index) => (
                <div
                  key={`safe-${index}`}
                  className="alternate-layout-debug__rect alternate-layout-debug__rect--safe"
                  style={{
                    left: `${zone.left}px`,
                    top: `${zone.top}px`,
                    width: `${zone.width}px`,
                    height: `${zone.height}px`
                  }}
                />
              )
            )}
            {layoutDebug.anchors.map((anchor) => (
              <div
                key={anchor.key}
                className="alternate-layout-debug__anchor"
                style={{
                  left: `${anchor.x}px`,
                  top: `${anchor.y}px`
                }}
              >
                <span>{anchor.key}</span>
              </div>
            ))}
          </div>
        )}

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
      </section>
    </main>
  );
}
