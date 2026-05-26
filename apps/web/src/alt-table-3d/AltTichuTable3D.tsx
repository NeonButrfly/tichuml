import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent
} from "react";
import "./alt-table-3d.css";
import {
  DESIGN_H,
  DESIGN_W,
  FIRST_DEAL_COUNT,
  PASS_COUNT,
  SECOND_DEAL_COUNT,
  SOUTH_PASS_IDS,
  bboxToPolygonPercent,
  buildAltTableSnapshot,
  buildAutoDemoAssignments,
  buildDemoDeck,
  createDemoHands,
  getTableTransform,
  loadTv6RuntimeAssets,
  type AltTableSnapshot,
  type DemoCard,
  type DemoHands,
  type DemoPhase,
  type DemoSeat,
  type PassAnchorId,
  type Tv6Anchor,
  type Tv6RuntimeAssets
} from "./tv6-runtime";

const DEAL_TO_GT_DELAY_MS = 1_200;
const GT_TO_PASSING_DELAY_MS = 1_200;
const CARD_ASPECT_RATIO_FALLBACK = 240 / 390;

const SEAT_ORDER: DemoSeat[] = ["north", "east", "south", "west"];

const HAND_LAYOUT: Record<
  DemoSeat,
  {
    left: number;
    top: number;
    gap: number;
    cardHeight: number;
    axis: "row" | "column";
  }
> = {
  north: { left: 426, top: 34, gap: 46, cardHeight: 126, axis: "row" },
  east: { left: 1380, top: 194, gap: 24, cardHeight: 108, axis: "column" },
  south: { left: 348, top: 820, gap: 58, cardHeight: 170, axis: "row" },
  west: { left: 52, top: 194, gap: 24, cardHeight: 108, axis: "column" }
};

type PassAssignments = Partial<Record<PassAnchorId, string>>;

type AltTableWindow = Window & {
  __TICHU_ALT_SNAPSHOT__?: AltTableSnapshot;
};

export function AltTichuTable3D() {
  const [assets, setAssets] = useState<Tv6RuntimeAssets | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("deal8");
  const [gtChoice, setGtChoice] = useState<"call" | "skip" | null>(null);
  const [selectedSouthCardIds, setSelectedSouthCardIds] = useState<string[]>([]);
  const [passAssignments, setPassAssignments] = useState<PassAssignments>({});
  const [hoveredAnchorId, setHoveredAnchorId] = useState<PassAnchorId | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width:
      typeof window === "undefined" ? DESIGN_W : Math.max(window.innerWidth, 1),
    height:
      typeof window === "undefined" ? DESIGN_H : Math.max(window.innerHeight, 1)
  }));

  useEffect(() => {
    let cancelled = false;

    void loadTv6RuntimeAssets()
      .then((loadedAssets) => {
        if (!cancelled) {
          setAssets(loadedAssets);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewport = () => {
      setViewportSize({
        width: Math.max(window.innerWidth, 1),
        height: Math.max(window.innerHeight, 1)
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!assets || phase !== "deal8") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("gt");
    }, DEAL_TO_GT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [assets, phase]);

  useEffect(() => {
    if (phase !== "deal6") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("passing");
    }, GT_TO_PASSING_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  const deck = useMemo(
    () => (assets ? buildDemoDeck(assets.cardMap) : []),
    [assets]
  );
  const hands = useMemo(
    () => (deck.length > 0 ? createDemoHands(deck) : null),
    [deck]
  );
  const cardLookup = useMemo(() => {
    const map = new Map<string, DemoCard>();
    for (const card of deck) {
      map.set(card.id, card);
    }
    return map;
  }, [deck]);
  const cardAspectRatio =
    assets && assets.cardMetas.length > 0
      ? assets.cardMetas[0]!.naturalW / assets.cardMetas[0]!.naturalH
      : CARD_ASPECT_RATIO_FALLBACK;

  const displayedHands = useMemo<DemoHands | null>(() => {
    if (!hands) {
      return null;
    }

    if (phase === "deal8" || phase === "gt") {
      return hands.deal8;
    }

    return hands.final;
  }, [hands, phase]);

  const transform = getTableTransform(viewportSize.width, viewportSize.height);
  const boardStyle = useMemo<CSSProperties>(
    () => ({
      left: `${transform.offsetX}px`,
      top: `${transform.offsetY}px`,
      width: `${DESIGN_W}px`,
      height: `${DESIGN_H}px`,
      transform: `scale(${transform.scale})`,
      transformOrigin: "top left"
    }),
    [transform]
  );

  const handCounts = useMemo(
    () =>
      ({
        north: displayedHands?.north.length ?? 0,
        east: displayedHands?.east.length ?? 0,
        south: displayedHands?.south.length ?? 0,
        west: displayedHands?.west.length ?? 0
      }) satisfies Record<DemoSeat, number>,
    [displayedHands]
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !assets ||
      !displayedHands
    ) {
      return;
    }

    (window as AltTableWindow).__TICHU_ALT_SNAPSHOT__ = buildAltTableSnapshot({
      phase,
      viewportW: viewportSize.width,
      viewportH: viewportSize.height,
      handCounts,
      anchors: assets.anchors,
      assets
    });
  }, [assets, displayedHands, handCounts, phase, viewportSize.height, viewportSize.width]);

  if (loadError) {
    throw loadError;
  }

  if (!assets || !displayedHands || !hands) {
    return (
      <section className="alt-table-3d-route alt-table-3d-route--loading">
        <div className="alt-table-loading">
          <strong>Loading alt table</strong>
          <span>Validating /tv6 assets and locked passing anchors.</span>
        </div>
      </section>
    );
  }

  const assignedSouthCardIds = new Set(
    SOUTH_PASS_IDS.map((anchorId) => passAssignments[anchorId]).filter(
      (cardId): cardId is string => Boolean(cardId)
    )
  );

  function startGtResolution(choice: "call" | "skip") {
    setGtChoice(choice);
    setPhase("deal6");
  }

  function buildNextAssignments(
    current: PassAssignments,
    anchorId: PassAnchorId,
    cardId: string
  ) {
    const next: PassAssignments = {};

    for (const [assignedAnchorId, assignedCardId] of Object.entries(current)) {
      if (
        assignedCardId &&
        assignedCardId !== cardId &&
        assignedAnchorId !== anchorId
      ) {
        next[assignedAnchorId as PassAnchorId] = assignedCardId;
      }
    }

    next[anchorId] = cardId;
    return next;
  }

  function replaceAssignment(anchorId: PassAnchorId, cardId: string) {
    setPassAssignments((current) => buildNextAssignments(current, anchorId, cardId));
  }

  function clearAssignment(anchorId: PassAnchorId) {
    setPassAssignments((current) => {
      if (!current[anchorId]) {
        return current;
      }

      const next = { ...current };
      delete next[anchorId];
      return next;
    });
  }

  function handleSouthCardToggle(cardId: string) {
    if (phase !== "passing") {
      return;
    }

    setSelectedSouthCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((selectedId) => selectedId !== cardId);
      }

      if (current.length >= PASS_COUNT) {
        return current;
      }

      return [...current, cardId];
    });
  }

  function assignSelectedCard(anchorId: PassAnchorId) {
    if (!SOUTH_PASS_IDS.includes(anchorId)) {
      return;
    }

    setPassAssignments((current) => {
      const selectedCardId = selectedSouthCardIds.find(
        (cardId) =>
          !SOUTH_PASS_IDS.some((selectedAnchorId) => current[selectedAnchorId] === cardId)
      );

      if (!selectedCardId) {
        return current;
      }

      return buildNextAssignments(current, anchorId, selectedCardId);
    });
  }

  function handlePassTargetClick(anchorId: PassAnchorId) {
    if (phase !== "passing") {
      return;
    }

    if (SOUTH_PASS_IDS.includes(anchorId) && passAssignments[anchorId]) {
      clearAssignment(anchorId);
      return;
    }

    assignSelectedCard(anchorId);
  }

  function handleCardDragStart(cardId: string) {
    if (phase !== "passing") {
      return;
    }

    setDraggedCardId(cardId);
  }

  function handlePassTargetDrop(event: DragEvent<HTMLButtonElement>, anchorId: PassAnchorId) {
    event.preventDefault();
    setHoveredAnchorId(null);

    if (phase !== "passing") {
      return;
    }

    const incomingCardId =
      event.dataTransfer.getData("text/plain") || draggedCardId || "";
    if (!incomingCardId) {
      return;
    }

    replaceAssignment(anchorId, incomingCardId);
    setDraggedCardId(null);
  }

  function handlePassTargetDragOver(event: DragEvent<HTMLButtonElement>, anchorId: PassAnchorId) {
    if (phase !== "passing") {
      return;
    }

    event.preventDefault();
    setHoveredAnchorId(anchorId);
  }

  function handleAutoDemoPass() {
    setSelectedSouthCardIds(hands.final.south.slice(0, PASS_COUNT).map((card) => card.id));
    setPassAssignments(buildAutoDemoAssignments(hands.final));
  }

  function handleConfirmPass() {
    setPhase("passed");
  }

  return (
    <section className="alt-table-3d-route">
      <div className="alt-table-status">
        <div className="alt-table-status__header">
          <strong>Alt Table Demo</strong>
          <span data-alt-phase-label="true">{phase}</span>
        </div>
        <div className="alt-table-status__counts">
          <span>North {handCounts.north}</span>
          <span>East {handCounts.east}</span>
          <span>South {handCounts.south}</span>
          <span>West {handCounts.west}</span>
        </div>
        <div className="alt-table-status__flow">
          <span>Deal 8: {FIRST_DEAL_COUNT}</span>
          <span>GT shown: {phase === "gt" || phase === "deal6" || phase === "passing" || phase === "passed" ? "yes" : "no"}</span>
          <span>Deal 6: {phase === "deal6" || phase === "passing" || phase === "passed" ? SECOND_DEAL_COUNT : 0}</span>
          <span>GT choice: {gtChoice ?? "pending"}</span>
        </div>
        {phase === "gt" ? (
          <div className="alt-table-status__actions">
            <button
              type="button"
              data-alt-action="call-gt"
              onClick={() => startGtResolution("call")}
            >
              Call GT
            </button>
            <button
              type="button"
              data-alt-action="skip-gt"
              onClick={() => startGtResolution("skip")}
            >
              Skip GT
            </button>
          </div>
        ) : null}
        {phase === "passing" ? (
          <div className="alt-table-status__actions">
            <button
              type="button"
              data-alt-action="auto-demo-pass"
              onClick={handleAutoDemoPass}
            >
              Auto demo pass
            </button>
            <button
              type="button"
              data-alt-action="confirm-pass"
              onClick={handleConfirmPass}
            >
              Confirm pass
            </button>
          </div>
        ) : null}
        {phase === "passing" ? (
          <div className="alt-table-status__selection">
            <span>South selected: {selectedSouthCardIds.length}/3</span>
            <span>Assigned: {assignedSouthCardIds.size}/3</span>
          </div>
        ) : null}
      </div>

      <div className="alt-table-stage" data-alt-table-root="tv6">
        <div className="alt-table-board" style={boardStyle}>
          <img
            alt="Tichu table plate"
            className="alt-table-board__plate"
            data-table-layer="plate"
            src={assets.tableMeta.src}
          />

          {SEAT_ORDER.map((seat) => (
            <SeatHand
              key={seat}
              axis={HAND_LAYOUT[seat].axis}
              aspectRatio={cardAspectRatio}
              cards={displayedHands[seat]}
              cardHeight={HAND_LAYOUT[seat].cardHeight}
              gap={HAND_LAYOUT[seat].gap}
              isPassing={phase === "passing"}
              left={HAND_LAYOUT[seat].left}
              seat={seat}
              selectedCardIds={seat === "south" ? selectedSouthCardIds : []}
              top={HAND_LAYOUT[seat].top}
              onCardClick={seat === "south" ? handleSouthCardToggle : undefined}
              onCardDragStart={seat === "south" ? handleCardDragStart : undefined}
            />
          ))}

          {phase === "passing" ? (
            <img
              alt="Passing lanes"
              className="alt-table-board__overlay"
              data-table-layer="passing-overlay"
              src={assets.overlayMeta.src}
            />
          ) : null}

          {phase === "passing"
            ? assets.anchors.map((anchor) => {
                const assignedCard = passAssignments[anchor.id]
                  ? cardLookup.get(passAssignments[anchor.id]!)
                  : null;
                const isFilled = Boolean(assignedCard);
                const isHovered = hoveredAnchorId === anchor.id;

                return (
                  <button
                    key={anchor.id}
                    type="button"
                    className={[
                      "alt-table-pass-target",
                      isFilled ? "alt-table-pass-target--filled" : "",
                      isHovered ? "alt-table-pass-target--hovered" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-pass-id={anchor.id}
                    data-arrow-direction={anchor.arrow_direction}
                    data-orientation={anchor.slot_orientation}
                    data-rotation={String(anchor.slot_rotation_deg)}
                    onClick={() => handlePassTargetClick(anchor.id)}
                    onDragEnter={() => setHoveredAnchorId(anchor.id)}
                    onDragLeave={() =>
                      setHoveredAnchorId((current) =>
                        current === anchor.id ? null : current
                      )
                    }
                    onDragOver={(event) => handlePassTargetDragOver(event, anchor.id)}
                    onDrop={(event) => handlePassTargetDrop(event, anchor.id)}
                    style={buildPassTargetStyle(anchor)}
                  >
                    {assignedCard ? (
                      <AssignedPassCard
                        anchor={anchor}
                        aspectRatio={cardAspectRatio}
                        card={assignedCard}
                      />
                    ) : (
                      <span className="alt-table-pass-target__hint">
                        {anchor.id}
                      </span>
                    )}
                  </button>
                );
              })
            : null}
        </div>
      </div>
    </section>
  );
}

function buildPassTargetStyle(anchor: Tv6Anchor): CSSProperties {
  return {
    left: `${anchor.bbox_px.x}px`,
    top: `${anchor.bbox_px.y}px`,
    width: `${anchor.bbox_px.w}px`,
    height: `${anchor.bbox_px.h}px`,
    clipPath:
      anchor.polygon_px.length > 2
        ? `polygon(${bboxToPolygonPercent(anchor.bbox_px, anchor.polygon_px)})`
        : undefined
  };
}

function SeatHand(props: {
  seat: DemoSeat;
  cards: DemoCard[];
  left: number;
  top: number;
  gap: number;
  cardHeight: number;
  axis: "row" | "column";
  aspectRatio: number;
  isPassing: boolean;
  selectedCardIds: string[];
  onCardClick?: (cardId: string) => void;
  onCardDragStart?: (cardId: string) => void;
}) {
  return (
    <div
      className={`alt-table-seat alt-table-seat--${props.seat} alt-table-seat--${props.axis}`}
      data-seat-hand={props.seat}
      style={{
        left: `${props.left}px`,
        top: `${props.top}px`
      }}
    >
      {props.cards.map((card, index) => {
        const isSelected = props.selectedCardIds.includes(card.id);
        const width = props.cardHeight * props.aspectRatio;

        return (
          <button
            key={card.id}
            type="button"
            className={[
              "alt-table-card-button",
              isSelected ? "alt-table-card-button--selected" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            data-card-id={card.id}
            draggable={Boolean(props.onCardDragStart) && props.isPassing}
            onClick={() => props.onCardClick?.(card.id)}
            onDragStart={(event) => {
              if (!props.onCardDragStart) {
                return;
              }

              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.id);
              props.onCardDragStart(card.id);
            }}
            style={{
              left:
                props.axis === "row" ? `${index * props.gap}px` : undefined,
              top:
                props.axis === "column" ? `${index * props.gap}px` : undefined,
              width: `${width}px`,
              height: `${props.cardHeight}px`
            }}
          >
            <img
              alt={card.label}
              className="alt-table-card-image"
              src={card.src}
            />
          </button>
        );
      })}
    </div>
  );
}

function AssignedPassCard(props: {
  anchor: Tv6Anchor;
  card: DemoCard;
  aspectRatio: number;
}) {
  const size =
    props.anchor.slot_orientation === "portrait"
      ? {
          height: props.anchor.bbox_px.h,
          width: props.anchor.bbox_px.h * props.aspectRatio
        }
      : {
          width: props.anchor.bbox_px.w,
          height: props.anchor.bbox_px.w / props.aspectRatio
        };

  return (
    <span
      className="alt-table-pass-card"
      data-pass-card="true"
      style={{
        width: `${Math.min(size.width, props.anchor.bbox_px.w)}px`,
        height: `${Math.min(size.height, props.anchor.bbox_px.h)}px`,
        transform: `rotate(${props.anchor.card_rotation_hint_deg ?? props.anchor.slot_rotation_deg}deg)`
      }}
    >
      <img
        alt={props.card.label}
        className="alt-table-pass-card__image"
        data-pass-card-img="true"
        src={props.card.src}
      />
    </span>
  );
}
