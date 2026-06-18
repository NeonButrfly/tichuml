import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  AltTableLayout,
  PassingLaneId,
  SideHandId
} from "@tichuml/table-layout-schema";
import {
  createFreshAltAuthoringScene,
  createLaneSelectionModel,
  getEditableHandIds,
  isHandLocked
} from "@tichuml/fresh-alt-authoring";
import { FreshCardsLayer } from "../../../web/src/altTableFresh/FreshCardsLayer";
import { FRESH_ALT_CARD_BACK_SRC, FRESH_ALT_TABLE_SRC } from "../../../web/src/altTableFresh/freshAltTableChecks";
import { FreshPassingLayer } from "../../../web/src/altTableFresh/FreshPassingLayer";
import { designToScreen, getTableFit } from "../../../web/src/altTableFresh/tableFit";
import type { EditorSelection } from "../state/editorState";

interface FreshAltAuthoringPreviewProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}

export function FreshAltAuthoringPreview({
  layout,
  selection,
  onSelectHand,
  onSelectLane,
  onSelectArrow,
  onClearSelection
}: FreshAltAuthoringPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1536, h: 1024 });

  useLayoutEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      setSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height
      });
    });

    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const scene = useMemo(() => createFreshAltAuthoringScene(layout), [layout]);
  const fit = useMemo(() => getTableFit(size.w, size.h), [size]);
  const laneSelection = useMemo(() => createLaneSelectionModel(layout), [layout]);
  const southLocked = isHandLocked("south");
  const handleNorthSelect = () => onSelectHand("north");
  const handleEastSelect = () => onSelectHand("east");
  const handleWestSelect = () => onSelectHand("west");
  const handSelectHandlers = {
    north: handleNorthSelect,
    east: handleEastSelect,
    west: handleWestSelect
  } as const;

  const cards = useMemo(
    () =>
      (Object.entries(scene.hands) as [SideHandId, typeof scene.hands.north][])
        .flatMap(([handId, anchors]) =>
          anchors.map((anchor) => ({
            id: `${handId}-${anchor.id}`,
            seat: anchor.seat,
            src: FRESH_ALT_CARD_BACK_SRC,
            anchor,
            interactive: false
          }))
        ),
    [scene.hands]
  );

  const lanes = useMemo(
    () =>
      scene.passing
        .filter((anchor) => laneSelection.hasLane(anchor.laneId))
        .map((anchor) => {
          const lane = laneSelection.getLane(anchor.laneId);

          return {
            anchor,
            interactive: !anchor.locked,
            occupied: false,
            selected:
              selection?.type === "lane" && selection.id === anchor.laneId,
            ariaLabel: `${anchor.laneId} passing lane`,
            visible: anchor.visible,
            locked: anchor.locked,
            rotationDeg: anchor.rotationDeg,
            borderOpacity: anchor.borderOpacity,
            fillOpacity: anchor.fillOpacity,
            arrowRotationDeg: anchor.arrowRotationDeg,
            arrowOffsetPx: anchor.arrowOffsetPx,
            arrowScale: anchor.arrowScale,
            ...(lane ? { onClick: () => onSelectLane(anchor.laneId) } : {})
          };
        }),
    [laneSelection, onSelectLane, scene.passing, selection]
  );

  const editableHandIds = useMemo(() => getEditableHandIds(), []);

  return (
    <div
      ref={rootRef}
      className="editor-preview__canvas editor-preview__authoring"
      data-testid="editor-fresh-alt-preview"
      onClick={onClearSelection}
    >
      <img
        className="editor-preview__table"
        src={FRESH_ALT_TABLE_SRC}
        alt=""
        draggable={false}
        style={{
          left: fit.offsetX,
          top: fit.offsetY,
          width: fit.renderedW,
          height: fit.renderedH
        }}
      />

      <FreshCardsLayer cards={cards} fit={fit} />
      <FreshPassingLayer lanes={lanes} fit={fit} />

      {editableHandIds.map((handId) => {
        const region = scene.handRegions[handId];
        const center = designToScreen(region.centerPx.x, region.centerPx.y, fit);
        const isSelected =
          selection?.type === "hand" && selection.id === handId;

        return (
          <button
            key={handId}
            type="button"
            className={`editor-preview__hand-hit ${
              isSelected ? "editor-preview__hand-hit--selected" : ""
            }`}
            style={{
              left: center.x,
              top: center.y,
              width: region.wPx * fit.scale,
              height: region.hPx * fit.scale
            }}
            onClick={(event) => {
              event.stopPropagation();
              handSelectHandlers[handId as keyof typeof handSelectHandlers]();
            }}
          >
            <span className="editor-preview__chip">
              {formatHandLabel(handId)}
            </span>
          </button>
        );
      })}

      {scene.passing
        .filter((anchor) => anchor.visible)
        .map((anchor) => {
          const arrowPoint = getArrowButtonPoint(anchor, fit);
          const isSelected =
            selection?.type === "arrow" && selection.id === anchor.laneId;

          return (
            <button
              key={`${anchor.laneId}-arrow`}
              type="button"
              className={`editor-preview__arrow-hit ${
                isSelected ? "editor-preview__arrow-hit--selected" : ""
              }`}
              style={{
                left: arrowPoint.x,
                top: arrowPoint.y
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectArrow(anchor.laneId);
              }}
            >
              Arrow
            </button>
          );
        })}

      <div
        className="editor-preview__south-lock"
        style={getSouthLockStyle(scene.handRegions.south, fit)}
      >
        <span
          className={`editor-preview__chip ${southLocked ? "editor-preview__chip--locked" : ""}`}
        >
          South Hand (Locked)
        </span>
      </div>
    </div>
  );
}

function formatHandLabel(handId: SideHandId) {
  return `${handId.charAt(0).toUpperCase()}${handId.slice(1)} Hand`;
}

function getSouthLockStyle(
  region: ReturnType<typeof createFreshAltAuthoringScene>["handRegions"]["south"],
  fit: ReturnType<typeof getTableFit>
) {
  const center = designToScreen(region.centerPx.x, region.centerPx.y, fit);

  return {
    left: center.x,
    top: center.y + region.hPx * fit.scale * 0.55
  };
}

function getArrowButtonPoint(
  anchor: ReturnType<typeof createFreshAltAuthoringScene>["passing"][number],
  fit: ReturnType<typeof getTableFit>
) {
  const basePoint = designToScreen(anchor.centerPx.x, anchor.centerPx.y, fit);
  const offset = anchor.orientation === "portrait"
    ? { x: anchor.wPx / 2 + 28, y: 0 }
    : { x: 0, y: -(anchor.hPx / 2 + 24) };
  const rotated = rotateVector(offset, anchor.rotationDeg);

  return {
    x: basePoint.x + (rotated.x + anchor.arrowOffsetPx.x) * fit.scale,
    y: basePoint.y + (rotated.y + anchor.arrowOffsetPx.y) * fit.scale
  };
}

function rotateVector(
  vector: { x: number; y: number },
  rotationDeg: number
) {
  if (rotationDeg === 0) {
    return vector;
  }

  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}
