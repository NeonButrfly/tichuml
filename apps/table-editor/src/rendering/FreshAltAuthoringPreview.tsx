import { useMemo } from "react";
import type {
  AltTableLayout,
  PassingLaneId,
  SideHandId
} from "@tichuml/table-layout-schema";
import {
  createFreshAltAuthoringScene,
  createLaneSelectionModel,
  isHandLocked
} from "@tichuml/fresh-alt-authoring";
import type { EditorSelection } from "../state/editorState";

// Editable preview affordances intentionally route through onSelectHand for "north", "east", and "west" only.

interface FreshAltAuthoringPreviewProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
  onSelectEditableHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}

type PreviewHandId = keyof AltTableLayout["hands"];

function toPercent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function getHandCenter(
  scene: ReturnType<typeof createFreshAltAuthoringScene>,
  side: PreviewHandId
) {
  const cards = scene.hands[side];
  const total = cards.reduce(
    (sum, card) => ({
      x: sum.x + card.centerPx.x,
      y: sum.y + card.centerPx.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / cards.length,
    y: total.y / cards.length
  };
}

function getLaneIdFromAnchorId(anchorId: string): PassingLaneId {
  return anchorId.replace("_pass_", "-") as PassingLaneId;
}

function getHandLabel(side: PreviewHandId) {
  const name = `${side.charAt(0).toUpperCase()}${side.slice(1)} Hand`;
  return isHandLocked(side) ? `${name} (Locked)` : name;
}

export function FreshAltAuthoringPreview({
  layout,
  selection,
  onLayoutChange: _onLayoutChange,
  onSelectEditableHand: selectHand,
  onSelectLane,
  onSelectArrow,
  onClearSelection
}: FreshAltAuthoringPreviewProps) {
  const scene = useMemo(() => createFreshAltAuthoringScene(), []);
  const laneSelection = useMemo(() => createLaneSelectionModel(layout), [layout]);

  const northCenter = useMemo(() => getHandCenter(scene, "north"), [scene]);
  const eastCenter = useMemo(() => getHandCenter(scene, "east"), [scene]);
  const southCenter = useMemo(() => getHandCenter(scene, "south"), [scene]);
  const westCenter = useMemo(() => getHandCenter(scene, "west"), [scene]);

  const handleNorthSelect = () => selectHand("north");
  const handleEastSelect = () => selectHand("east");
  const handleWestSelect = () => selectHand("west");

  return (
    <div
      className="editor-preview__canvas editor-preview__authoring"
      onClick={onClearSelection}
    >
      <div
        className="editor-preview__board"
        style={{ aspectRatio: `${scene.design.w} / ${scene.design.h}` }}
      >
        <button
          type="button"
          className={`editor-preview__hand editor-preview__hand--north ${
            selection?.type === "hand" && selection.id === "north"
              ? "editor-preview__hand--selected"
              : ""
          }`}
          style={{
            left: toPercent(northCenter.x, scene.design.w),
            top: toPercent(northCenter.y, scene.design.h)
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleNorthSelect();
          }}
        >
          <span className="editor-preview__hand-label">{getHandLabel("north")}</span>
          <span className="editor-preview__hand-count">
            {layout.hands.north.fan.cardCount} cards
          </span>
        </button>

        <button
          type="button"
          className={`editor-preview__hand editor-preview__hand--east ${
            selection?.type === "hand" && selection.id === "east"
              ? "editor-preview__hand--selected"
              : ""
          }`}
          style={{
            left: toPercent(eastCenter.x, scene.design.w),
            top: toPercent(eastCenter.y, scene.design.h)
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleEastSelect();
          }}
        >
          <span className="editor-preview__hand-label">{getHandLabel("east")}</span>
          <span className="editor-preview__hand-count">
            {layout.hands.east.fan.cardCount} cards
          </span>
        </button>

        <div
          className="editor-preview__hand editor-preview__hand--south editor-preview__hand--locked"
          style={{
            left: toPercent(southCenter.x, scene.design.w),
            top: toPercent(southCenter.y, scene.design.h)
          }}
        >
          <span className="editor-preview__hand-label">{getHandLabel("south")}</span>
          <span className="editor-preview__hand-count">
            {layout.hands.south.fan.cardCount} cards
          </span>
        </div>

        <button
          type="button"
          className={`editor-preview__hand editor-preview__hand--west ${
            selection?.type === "hand" && selection.id === "west"
              ? "editor-preview__hand--selected"
              : ""
          }`}
          style={{
            left: toPercent(westCenter.x, scene.design.w),
            top: toPercent(westCenter.y, scene.design.h)
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleWestSelect();
          }}
        >
          <span className="editor-preview__hand-label">{getHandLabel("west")}</span>
          <span className="editor-preview__hand-count">
            {layout.hands.west.fan.cardCount} cards
          </span>
        </button>

        {scene.passing
          .map((anchor) => {
            const laneId = getLaneIdFromAnchorId(anchor.id);
            const lane = laneSelection.getLane(laneId);

            if (!lane) {
              return null;
            }

            const isLaneSelected =
              selection?.type === "lane" && selection.id === laneId;
            const isArrowSelected =
              selection?.type === "arrow" && selection.id === laneId;

            return (
              <div
                key={anchor.id}
                className={`editor-preview__lane ${
                  isLaneSelected ? "editor-preview__lane--selected" : ""
                }`}
                style={{
                  left: toPercent(anchor.centerPx.x, scene.design.w),
                  top: toPercent(anchor.centerPx.y, scene.design.h)
                }}
              >
                <button
                  type="button"
                  className="editor-preview__lane-hit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLane(laneId);
                  }}
                >
                  {laneId}
                </button>
                <button
                  type="button"
                  className={`editor-preview__lane-arrow ${
                    isArrowSelected ? "editor-preview__lane-arrow--selected" : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectArrow(laneId);
                  }}
                >
                  Arrow
                </button>
              </div>
            );
          })
          .filter(Boolean)}

        {scene.tricks.map((trick) => (
          <div
            key={trick.seat}
            className="editor-preview__trick"
            style={{
              left: toPercent(trick.centerPx.x, scene.design.w),
              top: toPercent(trick.centerPx.y, scene.design.h)
            }}
          >
            {trick.seat}
          </div>
        ))}
      </div>
    </div>
  );
}
