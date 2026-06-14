import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Card, SeatId } from "@tichuml/engine";
import type { GameTableViewProps, WishSelectionValue } from "../game-table-views";
import { formatRank, formatSeatShort, GameChromeMenu } from "../game-table-views";
import {
  getNormalSpriteHiddenPassCount,
  resolveNormalSpriteCardFaceSrc
} from "../normal-table-sprite-assets";
import {
  isExchangePhase
} from "../table-model";
import { FreshCardsLayer, type FreshRenderableCard } from "./FreshCardsLayer";
import { FreshPassingLayer, type FreshPassLane } from "./FreshPassingLayer";
import { FreshTrickLayer, type FreshTrickCard } from "./FreshTrickLayer";
import {
  getSeatFromPosition,
  makeAllHandAnchors,
  makePassingAnchors,
  makeTrickAnchors,
  resolveFreshPassAnchorId,
  selectAnchorsForCount,
  shouldShowPassingOverlay,
  type SeatVisualPosition
} from "./freshTableMath";
import {
  assertFreshAltTableChecks,
  FRESH_ALT_CARD_BACK_SRC,
  FRESH_ALT_TABLE_SRC,
  getFreshAltTableSnapshotModel
} from "./freshAltTableChecks";
import { DESIGN_H, DESIGN_W, getTableFit } from "./tableFit";

type FreshAltTableProps = GameTableViewProps & {
  showDebug?: boolean;
};

type SnapshotWindow = Window & {
  __freshAltTableSnapshot?: () => unknown;
};

function handCardFromId(cardId: string): Card {
  if (
    cardId === "mahjong" ||
    cardId === "dog" ||
    cardId === "phoenix" ||
    cardId === "dragon"
  ) {
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
    rank: Number(rank) as Extract<Card, { kind: "standard" }>["rank"]
  };
}

function resolveCard(cardId: string, cardLookup: ReadonlyMap<string, Card>): Card {
  return cardLookup.get(cardId) ?? handCardFromId(cardId);
}

function getSeatPosition(seat: SeatId): SeatVisualPosition {
  switch (seat) {
    case "seat-0":
      return "bottom";
    case "seat-1":
      return "right";
    case "seat-2":
      return "top";
    case "seat-3":
      return "left";
  }
}

function buildButtonStyle(config: {
  tone: "primary" | "secondary" | "muted";
}): CSSProperties {
  const palette =
    config.tone === "primary"
      ? {
          background: "rgba(161, 100, 31, 0.94)",
          border: "1px solid rgba(240, 195, 117, 0.95)",
          color: "#fff8e3"
        }
      : config.tone === "secondary"
        ? {
            background: "rgba(31, 54, 39, 0.9)",
            border: "1px solid rgba(208, 173, 106, 0.9)",
            color: "#f2ebd7"
          }
        : {
            background: "rgba(20, 24, 22, 0.84)",
            border: "1px solid rgba(155, 129, 85, 0.84)",
            color: "#ddcfb4"
          };

  return {
    ...palette,
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  };
}

function getWishLabel(rank: WishSelectionValue) {
  return rank === null ? "No Wish" : formatRank(rank);
}

export function FreshAltTable(props: FreshAltTableProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: DESIGN_W, h: DESIGN_H });

  useLayoutEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const rect = entry.contentRect;
      setSize({ w: rect.width, h: rect.height });
    });

    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo(() => getTableFit(size.w, size.h), [size]);
  const handAnchors = useMemo(() => makeAllHandAnchors(), []);
  const passingAnchors = useMemo(() => makePassingAnchors(), []);
  const trickAnchors = useMemo(() => makeTrickAnchors(), []);
  const checks = useMemo(() => assertFreshAltTableChecks(), []);

  const exchangePhaseActive = isExchangePhase(props.state.phase);
  const passingVisible = shouldShowPassingOverlay(props.state.phase);

  const cards = useMemo<FreshRenderableCard[]>(() => {
    return props.seatViews.flatMap((seatView) => {
      const seat = getSeatFromPosition(seatView.position);
      const anchorsForSeat = handAnchors.filter((anchor) => anchor.seat === seat);
      const hiddenPassCount =
        !seatView.isLocalSeat && exchangePhaseActive
          ? getNormalSpriteHiddenPassCount({
              seat: seatView.seat,
              passRouteViews: props.passRouteViews
            })
          : 0;

      const remoteCount = seatView.cards.length + hiddenPassCount;
      const renderables = seatView.isLocalSeat
        ? props.sortedLocalHand.map((card) => ({ id: card.id, card }))
        : Array.from({ length: remoteCount }, (_, index) => ({
            id: `${seatView.seat}-back-${index + 1}`,
            card: null
          }));

      const selectedAnchors = selectAnchorsForCount(anchorsForSeat, renderables.length);

      return renderables.map((entry, index) => {
        const anchor = selectedAnchors[index];
        if (!anchor) {
          return null;
        }

        const interactive = seatView.isLocalSeat && props.localCanInteract;
        const selected =
          seatView.isLocalSeat &&
          entry.card !== null &&
          props.selectedCardIds.includes(entry.card.id);

        return {
          id: entry.id,
          seat,
          src:
            seatView.isLocalSeat && entry.card
              ? resolveNormalSpriteCardFaceSrc(entry.card)
              : FRESH_ALT_CARD_BACK_SRC,
          anchor,
          selected,
          interactive,
          draggable: interactive && props.localPassInteractionEnabled,
          liftPx: 28,
          opacity:
            seatView.isLocalSeat && entry.card
              ? props.localLegalCardIds.has(entry.card.id)
                ? 1
                : 0.72
              : 1,
          ariaLabel:
            seatView.isLocalSeat && entry.card
              ? `${seatView.title} ${entry.card.id}`
              : `${seatView.title} facedown card`,
          onClick:
            seatView.isLocalSeat && entry.card
              ? () => props.onLocalCardClick(entry.card!.id)
              : undefined,
          onDragStart:
            seatView.isLocalSeat && entry.card && props.localPassInteractionEnabled
              ? (event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-tichu-pass-card",
                    entry.card!.id
                  );
                }
              : undefined
        } as FreshRenderableCard;
      });
    }).filter((card): card is FreshRenderableCard => card !== null);
  }, [
    exchangePhaseActive,
    handAnchors,
    props
  ]);

  const passLanes = useMemo<FreshPassLane[]>(() => {
    const routeByAnchorId = new Map<string, GameTableViewProps["passRouteViews"][number]>();

    for (const route of props.passRouteViews) {
      const anchorId = resolveFreshPassAnchorId({
        sourcePosition: route.sourcePosition as SeatVisualPosition,
        targetPosition: getSeatPosition(route.targetSeat)
      });
      if (anchorId) {
        routeByAnchorId.set(anchorId, route);
      }
    }

    return passingAnchors.map((anchor) => {
      const route = routeByAnchorId.get(anchor.id);
      const cardSrc = !route
        ? null
        : route.visibleCardId
          ? resolveNormalSpriteCardFaceSrc(
              resolveCard(route.visibleCardId, props.cardLookup)
            )
          : route.occupied
            ? FRESH_ALT_CARD_BACK_SRC
            : null;

      return {
        anchor,
        interactive: route?.interactive ?? false,
        occupied: route?.occupied ?? false,
        selected:
          Boolean(route?.interactive) && route?.target === props.selectedPassTarget,
        ariaLabel: route
          ? `${formatSeatShort(route.sourceSeat)} pass to ${formatSeatShort(route.targetSeat)}`
          : `${anchor.seat} pass lane`,
        onClick: route ? () => props.onPassTargetSelect(route.target) : undefined,
        onDropCard: route
          ? (cardId: string) => props.onPassLaneDrop(route.target, cardId)
          : undefined,
        card:
          route && cardSrc
            ? {
                src: cardSrc,
                rotationDeg: anchor.assignedCardRotationDeg,
                interactive: route.interactive && Boolean(route.visibleCardId),
                draggable: route.interactive && Boolean(route.visibleCardId),
                ariaLabel: `${anchor.id} pass card`,
                onClick:
                  route.interactive && route.visibleCardId
                    ? () => props.onPassLaneCardClick(route.target)
                    : undefined,
                onDragStart:
                  route.interactive && route.visibleCardId
                    ? (event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-tichu-pass-card",
                          route.visibleCardId!
                        );
                        props.onPassLaneCardDragStart(
                          route.target,
                          route.visibleCardId!
                        );
                      }
                    : undefined,
                onDragEnd:
                  route.interactive && route.visibleCardId
                    ? () =>
                        props.onPassLaneCardDragEnd(
                          route.target,
                          route.visibleCardId!
                        )
                    : undefined
              }
            : null
      } as FreshPassLane;
    });
  }, [
    passingAnchors,
    props
  ]);

  const trickCards = useMemo<FreshTrickCard[]>(() => {
    if (exchangePhaseActive) {
      return [];
    }

    const anchorBySeat = new Map(trickAnchors.map((anchor) => [anchor.seat, anchor] as const));
    const result: FreshTrickCard[] = [];

    for (const playView of props.seatRelativePlays) {
      const seat = getSeatFromPosition(playView.position);
      const trickAnchor = anchorBySeat.get(seat);
      if (!trickAnchor || playView.plays.length === 0) {
        continue;
      }

      playView.plays.forEach((entry, playIndex) => {
        entry.combination.cardIds.forEach((cardId, cardIndex) => {
          const offset =
            (cardIndex - (entry.combination.cardIds.length - 1) / 2) * 28;
          const stackOffset = playIndex * 10;
          const x =
            seat === "west"
              ? trickAnchor.centerPx.x + stackOffset
              : seat === "east"
                ? trickAnchor.centerPx.x - stackOffset
                : trickAnchor.centerPx.x + offset;
          const y =
            seat === "west" || seat === "east"
              ? trickAnchor.centerPx.y + offset
              : seat === "north"
                ? trickAnchor.centerPx.y + stackOffset
                : trickAnchor.centerPx.y - stackOffset;

          result.push({
            id: `${playView.seat}-${entry.combination.key}-${cardId}-${playIndex}-${cardIndex}`,
            seat,
            src: resolveNormalSpriteCardFaceSrc(resolveCard(cardId, props.cardLookup)),
            centerPx: { x, y },
            widthPx: 96,
            heightPx: 156,
            rotationDeg: trickAnchor.rotationDeg,
            zIndex: 180 + playIndex * 10 + cardIndex
          });
        });
      });
    }

    if (result.length > 0) {
      return result;
    }

    return props.pickupStageViews.flatMap((group) => {
      const seat = getSeatFromPosition(group.position);
      const trickAnchor = anchorBySeat.get(seat);
      if (!trickAnchor) {
        return [];
      }

      return group.cardIds.map((cardId, cardIndex) => ({
        id: `pickup-${group.seat}-${cardId}-${cardIndex}`,
        seat,
        src: resolveNormalSpriteCardFaceSrc(resolveCard(cardId, props.cardLookup)),
        centerPx: {
          x:
            seat === "west" || seat === "east"
              ? trickAnchor.centerPx.x
              : trickAnchor.centerPx.x + (cardIndex - (group.cardIds.length - 1) / 2) * 28,
          y:
            seat === "west" || seat === "east"
              ? trickAnchor.centerPx.y + (cardIndex - (group.cardIds.length - 1) / 2) * 28
              : trickAnchor.centerPx.y
        },
        widthPx: 96,
        heightPx: 156,
        rotationDeg: trickAnchor.rotationDeg,
        zIndex: 180 + cardIndex
      }));
    });
  }, [exchangePhaseActive, props.cardLookup, props.pickupStageViews, props.seatRelativePlays, trickAnchors]);

  const snapshot = useMemo(() => {
    const model = getFreshAltTableSnapshotModel();
    return {
      ...model,
      passingVisible,
      phase: props.state.phase,
      activeWish: props.resolvedWishRank,
      checks
    };
  }, [checks, passingVisible, props.resolvedWishRank, props.state.phase]);

  if (typeof window !== "undefined") {
    (window as SnapshotWindow).__freshAltTableSnapshot = () => snapshot;
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top, rgba(66, 37, 18, 0.24), rgba(8, 6, 5, 0.96) 50%), #090706",
        color: "#f1e6c8",
        overflow: "hidden"
      }}
    >
      <div
        ref={rootRef}
        data-testid="fresh-alt-table"
        data-alt-table-root="fresh"
        style={{
          position: "relative",
          width: "100vw",
          height: "100dvh",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0
          }}
        >
          <img
            data-testid="fresh-alt-table-base"
            src={FRESH_ALT_TABLE_SRC}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: fit.offsetX,
              top: fit.offsetY,
              width: fit.renderedW,
              height: fit.renderedH,
              userSelect: "none",
              pointerEvents: "none"
            }}
          />



          <FreshTrickLayer cards={trickCards} fit={fit} />

          <FreshCardsLayer
            cards={cards}
            fit={fit}
            showDebug={props.showDebug ?? false}
          />

          {passingVisible ? (
            <FreshPassingLayer
              lanes={passLanes}
              fit={fit}
              showDebug={props.showDebug ?? false}
            />
          ) : null}

          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 300
            }}
          >
            {props.controlHint ? (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: Math.max(fit.offsetY + 18, 16),
                  transform: "translateX(-50%)",
                  borderRadius: 999,
                  background: "rgba(7, 12, 10, 0.78)",
                  border: "1px solid rgba(201, 159, 92, 0.44)",
                  padding: "10px 16px",
                  maxWidth: "min(70%, 560px)",
                  textAlign: "center",
                  fontSize: 14
                }}
              >
                {props.controlHint}
              </div>
            ) : null}

            {props.resolvedWishRank !== null ? (
              <div
                style={{
                  position: "absolute",
                  left: Math.max(fit.offsetX + 24, 16),
                  top: Math.max(fit.offsetY + 24, 16),
                  borderRadius: 999,
                  background: "rgba(7, 12, 10, 0.78)",
                  border: "1px solid rgba(201, 159, 92, 0.44)",
                  padding: "8px 14px",
                  fontSize: 13
                }}
              >
                Wish: {getWishLabel(props.resolvedWishRank)}
              </div>
            ) : null}

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

            <div
              style={{
                position: "absolute",
                left: Math.max(fit.offsetX + 24, 16),
                top: Math.max(fit.offsetY + 80, 80),
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                zIndex: 310
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(15, 36, 26, 0.92), rgba(10, 24, 18, 0.95))",
                  border: "1px solid rgba(198, 166, 93, 0.55)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)"
                }}
              >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#c6a65d", letterSpacing: 2, fontWeight: 700 }}>NS</div>
                    <div style={{ fontSize: 22, color: "#f0ddb1", fontWeight: 700 }}>{props.derived.matchScore["team-0"]}</div>
                  </div>
                  <div style={{ width: 1, height: 28, background: "rgba(198, 166, 93, 0.4)" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#c6a65d", letterSpacing: 2, fontWeight: 700 }}>EW</div>
                    <div style={{ fontSize: 22, color: "#f0ddb1", fontWeight: 700 }}>{props.derived.matchScore["team-1"]}</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                left: fit.offsetX + 600 * fit.scale,
                top: fit.offsetY + 100 * fit.scale,
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                fontSize: 14 * fit.scale,
                color: "#c6a65d",
                fontWeight: 700,
                zIndex: 6
              }}
            >
              {props.state.calls?.["seat-2"]?.grandTichu ? "GT" : props.state.calls?.["seat-2"]?.smallTichu ? "T" : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: fit.offsetX + 768 * fit.scale,
                top: fit.offsetY + 40 * fit.scale,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                fontSize: 14 * fit.scale,
                color: "#c6a65d",
                fontWeight: 700,
                zIndex: 6
              }}
            >
              {props.state.calls?.["seat-2"]?.grandTichu ? "GT" : props.state.calls?.["seat-2"]?.smallTichu ? "T" : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: fit.offsetX + 1400 * fit.scale,
                top: fit.offsetY + 400 * fit.scale,
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                fontSize: 14 * fit.scale,
                color: "#c6a65d",
                fontWeight: 700,
                zIndex: 6
              }}
            >
              {props.state.calls?.["seat-1"]?.grandTichu ? "GT" : props.state.calls?.["seat-1"]?.smallTichu ? "T" : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: fit.offsetX + 136 * fit.scale,
                top: fit.offsetY + 400 * fit.scale,
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                fontSize: 14 * fit.scale,
                color: "#c6a65d",
                fontWeight: 700,
                zIndex: 6
              }}
            >
              {props.state.calls?.["seat-3"]?.grandTichu ? "GT" : props.state.calls?.["seat-3"]?.smallTichu ? "T" : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: fit.offsetX + 768 * fit.scale,
                top: fit.offsetY + 780 * fit.scale,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                fontFamily: "'Georgia', serif",
                fontSize: 14 * fit.scale,
                color: "#c6a65d",
                fontWeight: 700,
                zIndex: 6
              }}
            >
              {props.state.calls?.["seat-0"]?.grandTichu ? "GT" : props.state.calls?.["seat-0"]?.smallTichu ? "T" : ""}
            </div>
          </div>
        </div>

        <div
        style={{
            position: "absolute",
            left: "50%",
            bottom: Math.max(size.h - (fit.offsetY + fit.renderedH) + 16, 16),
            transform: "translateX(-50%)",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
            zIndex: 320,
            pointerEvents: "auto"
        }}
      >
          {props.localDragonRecipients.length > 0
            ? props.localDragonRecipients.map((recipient) => (
                <button
                  key={recipient}
                  type="button"
                  style={buildButtonStyle({ tone: "primary" })}
                  onClick={() => props.onDragonRecipientSelect(recipient)}
                >
                  Gift Dragon to {formatSeatShort(recipient)}
                </button>
              ))
            : props.normalActionRail.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  style={{
                    ...buildButtonStyle({ tone: slot.tone }),
                    opacity: slot.enabled ? 1 : 0.48
                  }}
                  onClick={() => props.onNormalAction(slot.id)}
                  disabled={!slot.enabled}
                >
                  {slot.label}
                </button>
              ))}
          {props.selectedCardIds.length > 0 ? (
            <button
              type="button"
              style={buildButtonStyle({ tone: "muted" })}
              onClick={props.onClearLocalSelection}
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>

      {props.wishDialogOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 500
          }}
        >
          <div
            style={{
              width: "min(640px, calc(100vw - 32px))",
              borderRadius: 24,
              padding: 24,
              background:
                "linear-gradient(180deg, rgba(20, 28, 23, 0.98), rgba(12, 16, 14, 0.98))",
              border: "1px solid rgba(201, 159, 92, 0.56)",
              boxShadow: "0 28px 64px rgba(0, 0, 0, 0.45)"
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Choose a wish</h2>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#d8c8a8" }}>
              Mahjong can ask for a rank that the next legal player must include if possible.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 18
              }}
            >
              {[null, ...props.wishSelectionOptions].map((rank, index) => {
                const active = props.resolvedWishRank === rank;
                return (
                  <button
                    key={`${rank ?? "none"}-${index}`}
                    type="button"
                    style={{
                      ...buildButtonStyle({
                        tone: active ? "primary" : "secondary"
                      }),
                      minWidth: 74
                    }}
                    onClick={() => props.onWishRankSelect(rank)}
                  >
                    {getWishLabel(rank)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                style={buildButtonStyle({ tone: "muted" })}
                onClick={props.onWishCancel}
                disabled={props.wishSubmissionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                style={buildButtonStyle({ tone: "primary" })}
                onClick={props.onWishConfirm}
                disabled={props.wishConfirmDisabled || props.wishSubmissionPending}
              >
                Confirm wish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
