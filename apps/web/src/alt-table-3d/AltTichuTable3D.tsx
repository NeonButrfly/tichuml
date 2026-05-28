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
  FINAL_HAND_COUNT,
  FIRST_DEAL_COUNT,
  PASS_COUNT,
  SECOND_DEAL_COUNT,
  SOUTH_PASS_IDS,
  bboxToPolygonPercent,
  buildAutoDemoAssignments,
  buildDemoDeck,
  buildTv7Snapshot,
  createDemoHands,
  getCardBackSrc,
  getSeatZone,
  getTableTransform,
  loadTv7RuntimeAssets,
  type DemoCard,
  type DemoHands,
  type DemoPhase,
  type DemoSeat,
  type PassAnchorId,
  type Tv7CardAnchor,
  type Tv7PassAnchor,
  type Tv7RuntimeAssets,
  type Tv7Snapshot
} from "./tv7-runtime";
import { AltHiddenHands3D, type HiddenHandCard } from "./AltHiddenHands3D";

const READY_TO_DEAL_DELAY_MS = 180;
const DEAL_TO_GT_DELAY_MS = 1_100;
const GT_TO_PASSING_DELAY_MS = 1_000;

type PassAssignments = Partial<Record<PassAnchorId, string>>;

type AltTableWindow = Window & {
  __tichuV7Snapshot?: () => Tv7Snapshot;
};

type RenderedCard = {
  anchor: Tv7CardAnchor;
  card: DemoCard;
  src: string;
  seat: DemoSeat | null;
  zone: string;
  isSelected: boolean;
  isInteractive: boolean;
};

export function AltTichuTable3D() {
  const [assets, setAssets] = useState<Tv7RuntimeAssets | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("ready");
  const [gtChoice, setGtChoice] = useState<"call" | "skip" | null>(null);
  const [selectedSouthCardIds, setSelectedSouthCardIds] = useState<string[]>([]);
  const [passAssignments, setPassAssignments] = useState<PassAssignments>({});
  const [hoveredPassId, setHoveredPassId] = useState<PassAnchorId | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width:
      typeof window === "undefined" ? DESIGN_W : Math.max(window.innerWidth, 1),
    height:
      typeof window === "undefined" ? DESIGN_H : Math.max(window.innerHeight, 1)
  }));

  useEffect(() => {
    let cancelled = false;

    void loadTv7RuntimeAssets()
      .then((nextAssets) => {
        if (!cancelled) {
          setAssets(nextAssets);
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
    if (!assets || phase !== "ready") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("deal8");
    }, READY_TO_DEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [assets, phase]);

  useEffect(() => {
    if (!assets || phase !== "deal8") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("grand_tichu");
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

  const visibleHands = useMemo<DemoHands | null>(() => {
    if (!hands) {
      return null;
    }

    if (phase === "ready") {
      return {
        north: [],
        east: [],
        south: [],
        west: []
      };
    }

    if (phase === "deal8" || phase === "grand_tichu") {
      return hands.deal8;
    }

    return hands.final;
  }, [hands, phase]);

  const handCounts = useMemo(
    () =>
      ({
        north: visibleHands?.north.length ?? 0,
        east: visibleHands?.east.length ?? 0,
        south: visibleHands?.south.length ?? 0,
        west: visibleHands?.west.length ?? 0
      }) satisfies Record<DemoSeat, number>,
    [visibleHands]
  );

  const dealtCardCount =
    handCounts.north + handCounts.east + handCounts.south + handCounts.west;
  const deckRemaining = Math.max(deck.length - dealtCardCount, 0);
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

  const passAnchors = useMemo(() => assets?.passAnchors ?? [], [assets]);
  const cardAnchors = useMemo(() => assets?.cardAnchors ?? [], [assets]);
  const backSrc = useMemo(
    () => (assets ? getCardBackSrc(assets.cardMap, "blue") : ""),
    [assets]
  );

  const renderedCards = useMemo<RenderedCard[]>(() => {
    if (!assets || !visibleHands) {
      return [];
    }

    const cards: RenderedCard[] = [];
    for (const seat of ["north", "east", "south", "west"] as const) {
      const zone = getSeatZone(seat);
      const anchors = cardAnchors
        .filter((anchor) => anchor.zone === zone)
        .sort((left, right) => left.slot - right.slot);
      const hand = visibleHands[seat];

      for (const [index, card] of hand.entries()) {
        const anchor = anchors[index];
        if (!anchor) {
          continue;
        }

        cards.push({
          anchor,
          card,
          src: anchor.face_policy === "back" ? backSrc : card.src,
          seat,
          zone,
          isSelected: selectedSouthCardIds.includes(card.id),
          isInteractive: seat === "south" && phase === "passing"
        });
      }
    }

    return cards;
  }, [assets, backSrc, cardAnchors, phase, selectedSouthCardIds, visibleHands]);

  const hiddenHandCards = useMemo<HiddenHandCard[]>(
    () =>
      renderedCards.flatMap((card) => {
        if (card.seat === null || card.seat === "south") {
          return [];
        }

        return [
          {
            anchor: card.anchor,
            card: card.card,
            seat: card.seat,
            zone: card.zone
          }
        ];
      }),
    [renderedCards]
  );

  const surfaceCards = useMemo(
    () => renderedCards.filter((card) => card.seat === "south"),
    [renderedCards]
  );

  const deckAnchor = cardAnchors.find((anchor) => anchor.zone === "deck") ?? null;
  const discardAnchor =
    cardAnchors.find((anchor) => anchor.zone === "discard") ?? null;
  const deckPreviewCard = deckRemaining > 0 ? deck[dealtCardCount] ?? null : null;
  const discardPreviewCard =
    phase === "passed" && hands ? hands.final.south[FINAL_HAND_COUNT - 1] ?? null : null;

  const assignedSouthCount = SOUTH_PASS_IDS.filter(
    (anchorId) => Boolean(passAssignments[anchorId])
  ).length;
  const confirmPassEnabled = phase === "passing" && assignedSouthCount === PASS_COUNT;

  useEffect(() => {
    if (typeof window === "undefined" || !assets) {
      return;
    }

    const buildSnapshot = () =>
      buildTv7Snapshot({
        assets,
        phase,
        gtChoice,
        viewportW: viewportSize.width,
        viewportH: viewportSize.height,
        handCounts,
        deckRemaining
      });

    (window as AltTableWindow).__tichuV7Snapshot = buildSnapshot;
    return () => {
      delete (window as AltTableWindow).__tichuV7Snapshot;
    };
  }, [assets, deckRemaining, gtChoice, handCounts, phase, viewportSize.height, viewportSize.width]);

  if (loadError) {
    throw loadError;
  }

  if (!assets || !visibleHands || !hands) {
    return (
      <section className="alt-table-3d-route alt-table-3d-route--loading">
        <div className="alt-table-loading">
          <strong>Loading alt table</strong>
          <span>Validating /tv7 authored layers and card assets.</span>
        </div>
      </section>
    );
  }

  function beginGrandTichu(choice: "call" | "skip") {
    setGtChoice(choice);
    setPhase("deal6");
  }

  function buildNextAssignments(
    current: PassAssignments,
    passId: PassAnchorId,
    cardId: string
  ) {
    const next: PassAssignments = {};
    for (const [assignedPassId, assignedCardId] of Object.entries(current)) {
      if (
        assignedCardId &&
        assignedCardId !== cardId &&
        assignedPassId !== passId
      ) {
        next[assignedPassId as PassAnchorId] = assignedCardId;
      }
    }
    next[passId] = cardId;
    return next;
  }

  function toggleSouthCard(cardId: string) {
    if (phase !== "passing") {
      return;
    }

    setSelectedSouthCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((candidate) => candidate !== cardId);
      }

      if (current.length >= PASS_COUNT) {
        return current;
      }

      return [...current, cardId];
    });
  }

  function assignSelectedSouthCard(passId: PassAnchorId) {
    if (phase !== "passing" || !SOUTH_PASS_IDS.includes(passId)) {
      return;
    }

    const nextCardId = selectedSouthCardIds.find((cardId) => {
      const assignedToOtherLane = SOUTH_PASS_IDS.some(
        (laneId) => laneId !== passId && passAssignments[laneId] === cardId
      );
      return !assignedToOtherLane;
    });

    if (!nextCardId) {
      return;
    }

    setPassAssignments((current) => buildNextAssignments(current, passId, nextCardId));
  }

  function clearAssignment(passId: PassAnchorId) {
    setPassAssignments((current) => {
      if (!current[passId]) {
        return current;
      }

      const next = { ...current };
      delete next[passId];
      return next;
    });
  }

  function handlePassTargetClick(passId: PassAnchorId) {
    if (phase !== "passing" || !SOUTH_PASS_IDS.includes(passId)) {
      return;
    }

    if (passAssignments[passId]) {
      clearAssignment(passId);
      return;
    }

    assignSelectedSouthCard(passId);
  }

  function replaceAssignment(passId: PassAnchorId, cardId: string) {
    if (phase !== "passing" || !SOUTH_PASS_IDS.includes(passId)) {
      return;
    }
    setPassAssignments((current) => buildNextAssignments(current, passId, cardId));
  }

  function handleCardDragStart(cardId: string) {
    if (phase !== "passing") {
      return;
    }

    setDraggedCardId(cardId);
  }

  function handlePassTargetDragOver(
    event: DragEvent<HTMLButtonElement>,
    passId: PassAnchorId
  ) {
    if (phase !== "passing" || !SOUTH_PASS_IDS.includes(passId)) {
      return;
    }

    event.preventDefault();
    setHoveredPassId(passId);
  }

  function handlePassTargetDrop(
    event: DragEvent<HTMLButtonElement>,
    passId: PassAnchorId
  ) {
    event.preventDefault();
    setHoveredPassId(null);

    if (phase !== "passing" || !SOUTH_PASS_IDS.includes(passId)) {
      return;
    }

    const incomingCardId =
      event.dataTransfer.getData("text/plain") || draggedCardId || "";
    if (!incomingCardId) {
      return;
    }

    replaceAssignment(passId, incomingCardId);
    setDraggedCardId(null);
  }

  function handleAutoDemoPass() {
    setSelectedSouthCardIds(
      hands.final.south.slice(0, PASS_COUNT).map((card) => card.id)
    );
    setPassAssignments(buildAutoDemoAssignments(hands.final));
  }

  function handleConfirmPass() {
    if (!confirmPassEnabled) {
      return;
    }

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
          <span>Deck {deckRemaining}</span>
        </div>
        <div className="alt-table-status__flow">
          <span>Deal 8: {phase === "ready" ? 0 : FIRST_DEAL_COUNT}</span>
          <span>
            GT shown:{" "}
            {phase === "grand_tichu" ||
            phase === "deal6" ||
            phase === "passing" ||
            phase === "passed"
              ? "yes"
              : "no"}
          </span>
          <span>
            Deal 6:{" "}
            {phase === "deal6" || phase === "passing" || phase === "passed"
              ? SECOND_DEAL_COUNT
              : 0}
          </span>
          <span>GT choice: {gtChoice ?? "pending"}</span>
        </div>
        {phase === "grand_tichu" ? (
          <div className="alt-table-status__actions">
            <button
              type="button"
              data-alt-action="call-gt"
              onClick={() => beginGrandTichu("call")}
            >
              Call GT
            </button>
            <button
              type="button"
              data-alt-action="skip-gt"
              onClick={() => beginGrandTichu("skip")}
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
              disabled={!confirmPassEnabled}
              onClick={handleConfirmPass}
            >
              Confirm pass
            </button>
          </div>
        ) : null}
        {phase === "passing" ? (
          <div className="alt-table-status__selection">
            <span>South selected: {selectedSouthCardIds.length}/3</span>
            <span>South assigned: {assignedSouthCount}/3</span>
          </div>
        ) : null}
      </div>

      <div className="alt-table-stage" data-alt-table-root="tv7">
        <div className="alt-table-board" style={boardStyle}>
          <img
            alt="Tichu table plate"
            className="alt-table-board__plate"
            data-table-layer="plate"
            src={assets.tableMeta.src}
          />

          <AltHiddenHands3D backSrc={backSrc} cards={hiddenHandCards} />

          {surfaceCards.map((renderedCard) => (
            <CardSprite
              key={`${renderedCard.zone}-${renderedCard.card.id}`}
              anchor={renderedCard.anchor}
              card={renderedCard.card}
              isInteractive={renderedCard.isInteractive}
              isSelected={renderedCard.isSelected}
              passId={null}
              src={renderedCard.src}
              zone={renderedCard.zone}
              onClick={
                renderedCard.isInteractive
                  ? () => toggleSouthCard(renderedCard.card.id)
                  : undefined
              }
              onDragStart={
                renderedCard.isInteractive
                  ? () => handleCardDragStart(renderedCard.card.id)
                  : undefined
              }
            />
          ))}

          {deckAnchor && deckPreviewCard ? (
            <CardSprite
              anchor={deckAnchor}
              card={deckPreviewCard}
              isInteractive={false}
              isSelected={false}
              key="deck-preview"
              passId={null}
              src={backSrc}
              zone="deck"
            />
          ) : null}

          {discardAnchor && discardPreviewCard ? (
            <CardSprite
              anchor={discardAnchor}
              card={discardPreviewCard}
              isInteractive={false}
              isSelected={false}
              key="discard-preview"
              passId={null}
              src={discardPreviewCard.src}
              zone="discard"
            />
          ) : null}

          {phase === "passing" ? (
            <img
              alt="Passing lanes"
              className="alt-table-board__overlay"
              data-table-layer="passing-overlay"
              src={assets.passingOverlayMeta.src}
            />
          ) : null}

          {phase === "passing"
            ? passAnchors.map((anchor) => {
                const assignedCardId = passAssignments[anchor.id];
                const assignedCard = assignedCardId
                  ? cardLookup.get(assignedCardId) ?? null
                  : null;
                const isInteractive = SOUTH_PASS_IDS.includes(anchor.id);

                return (
                  <button
                    key={anchor.id}
                    type="button"
                    className={[
                      "alt-table-pass-target",
                      hoveredPassId === anchor.id
                        ? "alt-table-pass-target--hovered"
                        : "",
                      assignedCard ? "alt-table-pass-target--filled" : "",
                      isInteractive ? "" : "alt-table-pass-target--locked"
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-pass-id={anchor.id}
                    data-arrow-direction={anchor.arrow_direction}
                    data-orientation={anchor.slot_orientation}
                    data-rotation={String(anchor.slot_rotation_deg)}
                    onClick={() => handlePassTargetClick(anchor.id)}
                    onDragEnter={() => setHoveredPassId(anchor.id)}
                    onDragLeave={() =>
                      setHoveredPassId((current) =>
                        current === anchor.id ? null : current
                      )
                    }
                    onDragOver={(event) => handlePassTargetDragOver(event, anchor.id)}
                    onDrop={(event) => handlePassTargetDrop(event, anchor.id)}
                    style={buildPassTargetStyle(anchor)}
                  >
                    {assignedCard ? (
                      <PassCardSprite
                        anchor={anchor}
                        card={assignedCard}
                        src={assignedCard.src}
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

function buildPassTargetStyle(anchor: Tv7PassAnchor): CSSProperties {
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

function buildCardStyle(anchor: Tv7CardAnchor, selected: boolean): CSSProperties {
  const translateY = selected ? -18 : 0;
  return {
    left: `${anchor.center_px.x}px`,
    top: `${anchor.center_px.y}px`,
    width: `${anchor.w_px}px`,
    height: `${anchor.h_px}px`,
    transform: `translate(-50%, calc(-50% + ${translateY}px)) rotate(${anchor.rotation_deg}deg)`,
    transformOrigin: "center center"
  };
}

function buildPassCardStyle(anchor: Tv7PassAnchor): CSSProperties {
  const rotation = anchor.card_rotation_hint_deg ?? anchor.slot_rotation_deg;
  return {
    left: `${anchor.center_px.x}px`,
    top: `${anchor.center_px.y}px`,
    width: `${anchor.bbox_px.w}px`,
    height: `${anchor.bbox_px.h}px`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    transformOrigin: "center center"
  };
}

function CardSprite(props: {
  anchor: Tv7CardAnchor;
  card: DemoCard;
  src: string;
  zone: string;
  isSelected: boolean;
  isInteractive: boolean;
  passId: string | null;
  onClick?: () => void;
  onDragStart?: () => void;
}) {
  const className = [
    "alt-table-card",
    props.isSelected ? "alt-table-card--selected" : "",
    props.isInteractive ? "alt-table-card--interactive" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const commonProps = {
    className,
    "data-card-id": props.card.id,
    "data-zone": props.zone,
    "data-layout-source": "prototype_layer",
    "data-seat": props.anchor.seat ?? "",
    ...(props.passId ? { "data-pass-id": props.passId } : {})
  };

  if (props.isInteractive) {
    return (
      <button
        {...commonProps}
        type="button"
        draggable
        onClick={props.onClick}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", props.card.id);
          props.onDragStart?.();
        }}
        style={buildCardStyle(props.anchor, props.isSelected)}
      >
        <img alt={props.card.label} className="alt-table-card__image" src={props.src} />
      </button>
    );
  }

  return (
    <div {...commonProps} style={buildCardStyle(props.anchor, props.isSelected)}>
      <img alt={props.card.label} className="alt-table-card__image" src={props.src} />
    </div>
  );
}

function PassCardSprite(props: {
  anchor: Tv7PassAnchor;
  card: DemoCard;
  src: string;
}) {
  return (
    <div
      className="alt-table-pass-card"
      data-card-id={props.card.id}
      data-pass-id={props.anchor.id}
      data-zone="passing"
      data-layout-source="prototype_layer"
      style={buildPassCardStyle(props.anchor)}
    >
      <img
        alt={props.card.label}
        className="alt-table-pass-card__image"
        data-pass-card-img="true"
        src={props.src}
      />
    </div>
  );
}
