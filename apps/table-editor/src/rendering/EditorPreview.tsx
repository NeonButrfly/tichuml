import type { AltTableLayout, SideHandId, PassingLaneId } from "@tichuml/table-layout-schema";
import type { EditorSelection } from "../state/editorState";
import { FreshAltAuthoringPreview } from "./FreshAltAuthoringPreview";

interface EditorPreviewProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}

export function EditorPreview(props: EditorPreviewProps) {
  const {
    layout,
    selection,
    onSelectHand,
    onSelectLane,
    onSelectArrow,
    onClearSelection
  } = props;

  return (
    <FreshAltAuthoringPreview
      layout={layout}
      selection={selection}
      onSelectHand={onSelectHand}
      onSelectLane={onSelectLane}
      onSelectArrow={onSelectArrow}
      onClearSelection={onClearSelection}
    />
  );
}
