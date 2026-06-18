import type { AltTableLayout, SideHandId, PassingLaneId } from "@tichuml/table-layout-schema";
import { PASSING_LANE_IDS, SIDE_HAND_IDS } from "@tichuml/table-layout-schema";
import { isHandLocked } from "@tichuml/fresh-alt-authoring";
import type { EditorSelection } from "../state/editorState";

interface HierarchyPanelProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
}

export function HierarchyPanel(props: HierarchyPanelProps) {
  const { selection, onSelectHand, onSelectLane, onSelectArrow } = props;

  const isSelected = (type: string, id: string) => {
    return selection?.type === type && selection.id === id;
  };

  const laneGroups = {
    north: PASSING_LANE_IDS.filter((id) => id.startsWith("north-")),
    east: PASSING_LANE_IDS.filter((id) => id.startsWith("east-")),
    south: PASSING_LANE_IDS.filter((id) => id.startsWith("south-")),
    west: PASSING_LANE_IDS.filter((id) => id.startsWith("west-"))
  };

  return (
    <div className="editor-hierarchy">
      <div className="editor-hierarchy__title">Scene Hierarchy</div>

      <div className="editor-hierarchy__group">
        <div className="editor-hierarchy__group-label">Hands</div>
        {SIDE_HAND_IDS.map((side) => (
          <button
            type="button"
            key={side}
            className={`editor-hierarchy__item ${
              isSelected("hand", side) ? "editor-hierarchy__item--selected" : ""
            } ${isHandLocked(side) ? "editor-hierarchy__item--locked" : ""}`}
            disabled={isHandLocked(side)}
            onClick={() => onSelectHand(side)}
          >
            <div className="editor-hierarchy__icon">H</div>
            <span>
              {isHandLocked(side)
                ? `${side.charAt(0).toUpperCase() + side.slice(1)} Hand (Locked)`
                : `${side.charAt(0).toUpperCase() + side.slice(1)} Hand Master`}
            </span>
          </button>
        ))}
      </div>

      {(["north", "east", "south", "west"] as const).map((group) => (
        <div key={group} className="editor-hierarchy__group">
          <div className="editor-hierarchy__group-label">{group} Passing Lanes</div>
          {laneGroups[group].map((laneId) => (
            <div key={laneId}>
              <div
                className={`editor-hierarchy__item ${isSelected("lane", laneId) ? "editor-hierarchy__item--selected" : ""}`}
                onClick={() => onSelectLane(laneId)}
              >
                <div className="editor-hierarchy__icon">L</div>
                <span>{formatLaneName(laneId)}</span>
              </div>
              <div
                className={`editor-hierarchy__item ${isSelected("arrow", laneId) ? "editor-hierarchy__item--selected" : ""}`}
                onClick={() => onSelectArrow(laneId)}
                style={{ paddingLeft: 28 }}
              >
                <div className="editor-hierarchy__icon" style={{ fontSize: 8 }}>A</div>
                <span style={{ fontSize: 11, opacity: 0.7 }}>Arrow</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatLaneName(laneId: string): string {
  return laneId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
