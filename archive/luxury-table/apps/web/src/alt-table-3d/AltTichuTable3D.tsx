import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent
} from "react";

import "./alt-table-3d.css";
import AltTable3D, {
  ALT_TABLE_MODE,
  ALT_TABLE_RENDERER,
  type AltTablePlaneCard
} from "../altTable/AltTable3D";
import {
  DESIGN_H,
  DESIGN_W,
  makeNorthRackAnchors,
  makeSideRackAnchors,
  makeSouthCards,
  type CardRackAnchor
} from "../altTable/v18CardRackMath";
import { getFit } from "../altTable/tableFit";
import {
  FIRST_DEAL_COUNT,
  PASS_COUNT,
  SECOND_DEAL_COUNT,
  SOUTH_PASS_IDS,
  TV7_ASSET_ROOT,
  TV7_PASSING_OVERLAY_SRC,
  TV7_TABLE_PLATE_SRC,
  bboxToPolygonPercent,
  buildDemoDeck,
  createDemoHands,
  getCardBackSrc,
  loadTv7RuntimeAssets,
  type DemoCard,
  type DemoHands,
  type DemoPhase,
  type DemoSeat,
  type PassAnchorId,
  type Tv7PassAnchor,
  type Tv7RuntimeAssets
} from "./tv7-runtime";

const ALT_BOOT_PHASE: DemoPhase = "passing";
const ALT_BOOT_GT_CHOICE: "call" | "skip" | null = "skip";

type PassAssignments = Partial<Record<PassAnchorId, string>>;

type AltTableSnapshot = {
  assetRoot: string;
  phase: DemoPhase;
  renderer: string;
  design: {
    width: number;
    height: number;
    w: number;
    h: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  table: {
    src: string;
    mode: string;
    designW: number;
    designH: number;
    rendered: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  };
  cardLayout: {
    src: string;
    layoutSource: string;
    anchors: Array<{
      id: string;
      zone: string;
      seat: string;
      renderMode: string;
      bbox_px: { x: number; y: number; w: number; h: number };
      screen_bbox: { x: number; y: number; width: number; height: number };
      rotation_deg: number;
      w_px: number;
      h_px: number;
    }>;
  };
  passing: {
    overlaySrc: string;
    anchors: Array<{
      id: PassAnchorId;
      arrow_direction: string;
      orientation: string;
      rotation: number;
      bbox_px: { x: number; y: number; w: number; h: number };
      screen_bbox: { x: number; y: number; width: number; height: number };
    }>;
  };
  cards: {
    usingImageAssets: true;
    placeholders: false;
    layoutSource: string;
    bySeat: Record<DemoSeat, number>;
    sampleSrcs: string[];
    north: {
      renderMode: "north_rack_back_mostly_visible";
      hiddenBottomPx: number;
      mostlyVisible: true;
    };
    east: {
      renderMode: "side_rack_readable_fan";
      usesPolygonWarping: false;
      usesNormalImageSprites: true;
      cardBackRecognizableRequired: true;
    };
    west: {
      renderMode: "side_rack_readable_fan";
      usesPolygonWarping: false;
      usesNormalImageSprites: true;
      cardBackRecognizableRequired: true;
    };
    south: {
      renderMode: "south_player_fan";
    };
  };
  deal: {
    phase: DemoPhase;
    counts: Record<DemoSeat | "deckRemaining", number>;
    history: string[];
  };
};

type AltTableWindow = Window & {
  __tichuAltTableSnapshot?: () => AltTableSnapshot;
  __tichuV7Snapshot?: () => AltTableSnapshot;
};

type InteractiveCard = {
  anchor: CardRackAnchor;
  card: DemoCard;
  handCount: number;
  isSelected: boolean;
  isInteractive: boolean;
  slotIndex: number;
  zone: string;
};

const ALT_PASSING_DIRECTIONS = [
  "NORTH (top edge): ← ↓ →",
  "SOUTH (bottom edge): ← ↑ →",
  "WEST (left edge): ↑ → ↓",
  "EAST (right edge): ↑ ← ↓"
] as const;

const ALT_ANCHOR_RULES = [
  "North lanes keyed to top edge",
  "South lanes keyed to bottom edge",
  "West lanes keyed to left edge",
  "East lanes keyed to right edge",
  "East/West 3 lanes share same keyed edge for alignment",
  "Cards sit inside rails (racks)",
  "Target boxes are not rotated",
  "Dragon is on lower layer"
] as const;

const ALT_LAYER_ORDER = [
  "1. Table Base",
  "2. Dragon Motif",
  "3. Hands / Deck Flow / Tricks",
  "4. Passing Overlay (during passing)",
  "5. Assigned Pass Cards / UI"
] as const;

export function getAltTablePlateBlendConfig() {
  return {
    opacity: 1,
    brightness: 1,
    saturate: 1
  } as const;
}

function projectBbox(
  bbox: { x: number; y: number; w: number; h: number },
  viewportW: number,
  viewportH: number
) {
  const fit = getFit(viewportW, viewportH);
  return {
    x: fit.offsetX + bbox.x * fit.scale,
    y: fit.offsetY + bbox.y * fit.scale,
    width: bbox.w * fit.scale,
    height: bbox.h * fit.scale
  };
}

function anchorToBbox(anchor: CardRackAnchor) {
  const width = anchor.wPx * anchor.scaleX;
  const hiddenBottom =
    anchor.renderMode === "north_rack_back_mostly_visible"
      ? anchor.hiddenBottomPx ?? 10
      : 0;
  const height = anchor.hPx * anchor.scaleY - hiddenBottom;
  return {
    x: anchor.centerPx.x - width / 2,
    y: anchor.centerPx.y - height / 2 - hiddenBottom / 2,
    w: width,
    h: height
  };
}

function buildSnapshot(config: {
  assets: Tv7RuntimeAssets;
  phase: DemoPhase;
  gtChoice: "call" | "skip" | null;
  viewportW: number;
  viewportH: number;
  handCounts: Record<DemoSeat, number>;
  deckRemaining: number;
  cardAnchors: CardRackAnchor[];
}) {
  const fit = getFit(config.viewportW, config.viewportH);
  const renderedWidth = DESIGN_W * fit.scale;
  const renderedHeight = DESIGN_H * fit.scale;

  return {
    assetRoot: TV7_ASSET_ROOT,
    phase: config.phase,
    renderer: ALT_TABLE_RENDERER,
    design: {
      width: DESIGN_W,
      height: DESIGN_H,
      w: DESIGN_W,
      h: DESIGN_H,
      scale: fit.scale,
      offsetX: fit.offsetX,
      offsetY: fit.offsetY
    },
    table: {
      src: TV7_TABLE_PLATE_SRC,
      mode: ALT_TABLE_MODE,
      designW: DESIGN_W,
      designH: DESIGN_H,
      rendered: {
        x: fit.offsetX,
        y: fit.offsetY,
        width: renderedWidth,
        height: renderedHeight,
        scale: fit.scale
      }
    },
    cardLayout: {
      src: "v18CardRackMath",
      layoutSource: "v18_math",
      anchors: config.cardAnchors.map((anchor) => ({
        id: anchor.id,
        zone: anchor.zone,
        seat: anchor.seat,
        renderMode: anchor.renderMode,
        bbox_px: anchorToBbox(anchor),
        screen_bbox: projectBbox(anchorToBbox(anchor), config.viewportW, config.viewportH),
        rotation_deg: anchor.rotationDeg,
        w_px: anchor.wPx,
        h_px: anchor.hPx
      }))
    },
    passing: {
      overlaySrc: TV7_PASSING_OVERLAY_SRC,
      anchors: config.assets.passAnchors.map((anchor) => ({
        id: anchor.id,
        arrow_direction: anchor.arrow_direction,
        orientation: anchor.slot_orientation,
        rotation: anchor.slot_rotation_deg,
        bbox_px: anchor.bbox_px,
        screen_bbox: projectBbox(anchor.bbox_px, config.viewportW, config.viewportH)
      }))
    },
    cards: {
      usingImageAssets: true,
      placeholders: false,
      layoutSource: "v18_math",
      bySeat: config.handCounts,
      sampleSrcs: config.assets.sampleCardSrcs,
      north: {
        renderMode: "north_rack_back_mostly_visible",
        hiddenBottomPx: 10,
        mostlyVisible: true
      },
      east: {
        renderMode: "side_rack_readable_fan",
        usesPolygonWarping: false,
        usesNormalImageSprites: true,
        cardBackRecognizableRequired: true
      },
      west: {
        renderMode: "side_rack_readable_fan",
        usesPolygonWarping: false,
        usesNormalImageSprites: true,
        cardBackRecognizableRequired: true
      },
      south: {
        renderMode: "south_player_fan"
      }
    },
    deal: {
      phase: config.phase,
      counts: {
        ...config.handCounts,
        deckRemaining: config.deckRemaining
      },
      history: buildDealHistory(config.phase, config.gtChoice)
    }
  } satisfies AltTableSnapshot;
}

function buildDealHistory(phase: DemoPhase, gtChoice: "call" | "skip" | null) {
  const history = ["ready"];
  if (phase !== "ready") {
    history.push("deal8");
  }
  if (
    phase === "grand_tichu" ||
    phase === "deal6" ||
    phase === "passing" ||
    phase === "passed"
  ) {
    history.push("grand_tichu");
  }
  if (gtChoice) {
    history.push(`gt:${gtChoice}`);
  }
  if (phase === "deal6" || phase === "passing" || phase === "passed") {
    history.push("deal6");
  }
  if (phase === "passing" || phase === "passed") {
    history.push("passing");
  }
  if (phase === "passed") {
    history.push("passed");
  }
  return history;
}

export function AltTichuTable3D() {
  const [assets, setAssets] = useState<Tv7RuntimeAssets | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [phase, setPhase] = useState<DemoPhase>(ALT_BOOT_PHASE);
  const gtChoice = ALT_BOOT_GT_CHOICE;
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
  const fit = getFit(viewportSize.width, viewportSize.height);

  const boardStyle = useMemo<CSSProperties>(
    () => ({
      left: `${fit.offsetX}px`,
      top: `${fit.offsetY}px`,
      width: `${DESIGN_W}px`,
      height: `${DESIGN_H}px`,
      transform: `scale(${fit.scale})`,
      transformOrigin: "top left"
    }),
    [fit]
  );
  const plateBlendConfig = useMemo(() => getAltTablePlateBlendConfig(), []);
  const plateStyle = useMemo<CSSProperties>(
    () => ({
      opacity: plateBlendConfig.opacity,
      filter: `brightness(${plateBlendConfig.brightness}) saturate(${plateBlendConfig.saturate})`
    }),
    [plateBlendConfig]
  );

  const passAnchors = useMemo(() => assets?.passAnchors ?? [], [assets]);
  const backSrc = useMemo(
    () => (assets ? getCardBackSrc(assets.cardMap, "blue") : ""),
    [assets]
  );

  const northAnchors = useMemo(
    () => makeNorthRackAnchors(handCounts.north),
    [handCounts.north]
  );
  const eastAnchors = useMemo(
    () => makeSideRackAnchors("east", handCounts.east),
    [handCounts.east]
  );
  const westAnchors = useMemo(
    () => makeSideRackAnchors("west", handCounts.west),
    [handCounts.west]
  );
  const southAnchors = useMemo(
    () => makeSouthCards(handCounts.south),
    [handCounts.south]
  );

  const southCards = useMemo<InteractiveCard[]>(
    () =>
      (visibleHands?.south ?? []).map((card, index) => ({
        anchor: southAnchors[index]!,
        card,
        handCount: handCounts.south,
        isSelected: selectedSouthCardIds.includes(card.id),
        isInteractive: phase === "passing",
        slotIndex: index,
        zone: "south_hand"
      })),
    [handCounts.south, phase, selectedSouthCardIds, southAnchors, visibleHands]
  );

  const opponentCards = useMemo(
    () => [
      ...(visibleHands?.north ?? []).map((card, index) => ({
        anchor: northAnchors[index]!,
        card,
        seat: "north" as const,
        zone: "north_hand"
      })),
      ...(visibleHands?.east ?? []).map((card, index) => ({
        anchor: eastAnchors[index]!,
        card,
        seat: "east" as const,
        zone: "east_hand"
      })),
      ...(visibleHands?.west ?? []).map((card, index) => ({
        anchor: westAnchors[index]!,
        card,
        seat: "west" as const,
        zone: "west_hand"
      }))
    ],
    [eastAnchors, northAnchors, visibleHands, westAnchors]
  );

  const allCardAnchors = useMemo(
    () => [...northAnchors, ...eastAnchors, ...westAnchors, ...southAnchors],
    [eastAnchors, northAnchors, southAnchors, westAnchors]
  );

  const planeCards = useMemo<AltTablePlaneCard[]>(
    () => [
      ...opponentCards.map(({ anchor, seat }) => ({
        id: `${seat}-${anchor.index}`,
        seat,
        zone: anchor.zone,
        src: backSrc,
        anchor
      })),
      ...southCards.map(({ anchor, card, isSelected }) => ({
        id: card.id,
        seat: "south" as const,
        zone: anchor.zone,
        src: card.src,
        anchor,
        selectedLiftPx: isSelected ? 18 : 0
      }))
    ],
    [backSrc, opponentCards, southCards]
  );

  const assignedSouthCount = SOUTH_PASS_IDS.filter(
    (anchorId) => Boolean(passAssignments[anchorId])
  ).length;
  const confirmPassEnabled = phase === "passing" && assignedSouthCount === PASS_COUNT;

  useEffect(() => {
    if (typeof window === "undefined" || !assets) {
      return;
    }

    const build = () =>
      buildSnapshot({
        assets,
        phase,
        gtChoice,
        viewportW: viewportSize.width,
        viewportH: viewportSize.height,
        handCounts,
        deckRemaining,
        cardAnchors: allCardAnchors
      });

    (window as AltTableWindow).__tichuAltTableSnapshot = build;
    (window as AltTableWindow).__tichuV7Snapshot = build;
    return () => {
      delete (window as AltTableWindow).__tichuAltTableSnapshot;
      delete (window as AltTableWindow).__tichuV7Snapshot;
    };
  }, [
    allCardAnchors,
    assets,
    deckRemaining,
    gtChoice,
    handCounts,
    phase,
    viewportSize.height,
    viewportSize.width
  ]);

  if (loadError) {
    throw loadError;
  }

  if (!assets || !visibleHands || !hands) {
    return (
      <section className="alt-table-3d-route alt-table-3d-route--loading">
        <div className="alt-table-loading">
          <strong>Loading alt table</strong>
          <span>Validating /tv7 math assets over the clean /tv_ed plate.</span>
        </div>
      </section>
    );
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

  function handleConfirmPass() {
    if (!confirmPassEnabled) {
      return;
    }

    setPhase("passed");
  }

  return (
    <section className="alt-table-3d-route">
      <div className="alt-table-stage" data-alt-table-root="tv7">
        <div className="alt-table-board" style={boardStyle}>
          <img
            alt="Tichu table plate"
            className="alt-table-board__plate"
            data-table-layer="plate"
            src={assets.tableMeta.src}
            style={plateStyle}
          />

          <AltTable3D cards={planeCards} />

          <div className="alt-table-world-scene__meta">
            {opponentCards.map(({ anchor, seat, zone, card }) => (
              <span
                key={`${zone}-${card.id}`}
                data-card-id={card.id}
                data-card-render-mode={anchor.renderMode}
                data-facing-seat={seat}
                data-layout-source="v18_math"
                data-render-mode="r3f-hidden-hand"
                data-seat={seat}
                data-seat-hand={zone}
                data-uses-polygon-warping="false"
                data-zone={zone}
              />
            ))}
          </div>

          {southCards.map((renderedCard) => (
            <button
              key={`${renderedCard.zone}-${renderedCard.card.id}`}
              aria-label={renderedCard.card.label}
              className={[
                "alt-table-hand-hitbox",
                renderedCard.isSelected ? "alt-table-hand-hitbox--selected" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-card-id={renderedCard.card.id}
              data-card-render-mode={renderedCard.anchor.renderMode}
              data-layout-source="v18_math"
              data-seat="south"
              data-zone={renderedCard.zone}
              draggable={renderedCard.isInteractive}
              onClick={
                renderedCard.isInteractive
                  ? () => toggleSouthCard(renderedCard.card.id)
                  : undefined
              }
              onDragStart={(event) => {
                if (!renderedCard.isInteractive) {
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", renderedCard.card.id);
                handleCardDragStart(renderedCard.card.id);
              }}
              style={buildCardHitboxStyle(renderedCard.anchor)}
              type="button"
            />
          ))}

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
                    data-arrow-direction={anchor.arrow_direction}
                    data-orientation={anchor.slot_orientation}
                    data-pass-id={anchor.id}
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

          <div className="alt-table-board__chrome" data-alt-board-chrome="true">
            <aside className="alt-table-status">
              <div className="alt-table-status__header">
                <strong>Passing Lanes (12)</strong>
                <span data-alt-phase-label="true">PASSING</span>
              </div>
              <div className="alt-table-status__counts">
                <span>North {handCounts.north}</span>
                <span>East {handCounts.east}</span>
                <span>South {handCounts.south}</span>
                <span>West {handCounts.west}</span>
                <span>Deck {deckRemaining}</span>
              </div>
              <p className="alt-table-status__body">
                Opponent hands now sit in fixed design-space rack fans over the
                shared table image, using readable card-back sprites instead of
                warped table-plane strips.
              </p>
              <div className="alt-table-status__section">
                <div className="alt-table-status__legend">[] = Passing Target</div>
                <div className="alt-table-status__legend">Arrow = Pass Direction</div>
                <div className="alt-table-status__legend">
                  Dashed box = actual target area (not rotated)
                </div>
              </div>
              <div className="alt-table-status__flow">
                <span>Deal 8: {FIRST_DEAL_COUNT}</span>
                <span>GT shown: yes</span>
                <span>Deal 6: {SECOND_DEAL_COUNT}</span>
                <span>GT choice: {gtChoice ?? "skip"}</span>
              </div>
              <div className="alt-table-status__section">
                <div className="alt-table-status__section-title">Passing Directions</div>
                <div className="alt-table-status__rules">
                  {ALT_PASSING_DIRECTIONS.map((line) => (
                    <div key={line} className="alt-table-status__rule">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
              <div className="alt-table-status__section">
                <div className="alt-table-status__section-title">Anchor Rules</div>
                <div className="alt-table-status__rules">
                  {ALT_ANCHOR_RULES.map((line) => (
                    <div key={line} className="alt-table-status__rule">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
              <div className="alt-table-status__section">
                <div className="alt-table-status__section-title">Layer Order (Bottom → Top)</div>
                <div className="alt-table-status__rules">
                  {ALT_LAYER_ORDER.map((line) => (
                    <div key={line} className="alt-table-status__rule">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
              {phase === "passing" ? (
                <div className="alt-table-status__actions">
                  <button
                    type="button"
                    data-alt-action="confirm-pass"
                    disabled={!confirmPassEnabled}
                    onClick={handleConfirmPass}
                  >
                    PASS
                  </button>
                </div>
              ) : null}
              {phase === "passing" ? (
                <div className="alt-table-status__selection">
                  <span>South selected: {selectedSouthCardIds.length}/3</span>
                  <span>South assigned: {assignedSouthCount}/3</span>
                </div>
              ) : null}
            </aside>

            <div className="alt-table-footer">
              <section className="alt-table-preview">
                <div className="alt-table-preview__title">Hand Anchor Preview</div>
                <img
                  alt="Hand anchor preview"
                  className="alt-table-preview__image"
                  src="/tv_ed/h/prev/table.png"
                />
              </section>
              <section className="alt-table-preview">
                <div className="alt-table-preview__title">Passing Anchor Preview</div>
                <img
                  alt="Passing anchor preview"
                  className="alt-table-preview__image"
                  src="/tv_ed/h/prev/all.png"
                />
              </section>
              <section className="alt-table-preview">
                <div className="alt-table-preview__title">Trick Anchor Preview (Virtual)</div>
                <div className="alt-table-trick-preview" aria-hidden="true">
                  <div className="alt-table-trick-preview__slot alt-table-trick-preview__slot--north" />
                  <div className="alt-table-trick-preview__slot alt-table-trick-preview__slot--west" />
                  <div className="alt-table-trick-preview__slot alt-table-trick-preview__slot--center" />
                  <div className="alt-table-trick-preview__slot alt-table-trick-preview__slot--east" />
                  <div className="alt-table-trick-preview__slot alt-table-trick-preview__slot--south" />
                </div>
              </section>
            </div>
          </div>
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

function buildCardHitboxStyle(anchor: CardRackAnchor) {
  return {
    left: `${anchor.centerPx.x}px`,
    top: `${anchor.centerPx.y}px`,
    width: `${anchor.wPx * anchor.scaleX}px`,
    height: `${anchor.hPx * anchor.scaleY}px`,
    transform: `translate(-50%, -50%) rotate(${anchor.rotationDeg}deg)`,
    transformOrigin: "center center"
  } satisfies CSSProperties;
}

export function resolveCardSpriteVisualTuning(
  anchor: { w_px: number; h_px: number },
  zone: string,
  slotIndex = 0,
  handCount = 1
) {
  if (zone !== "south_hand") {
    return {
      width: anchor.w_px,
      height: anchor.h_px,
      translateX: 0,
      translateY: 0,
      transformOrigin: "center center"
    } as const;
  }

  const centerIndex = (Math.max(handCount, 1) - 1) / 2;
  const offsetFromCenter = slotIndex - centerIndex;
  const distance = Math.abs(offsetFromCenter);
  const width = anchor.w_px * 0.7;
  const height = anchor.h_px * 0.7;

  return {
    width,
    height,
    translateX: offsetFromCenter * -11,
    translateY: 86 - distance * 2,
    transformOrigin: "center 86%"
  } as const;
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
