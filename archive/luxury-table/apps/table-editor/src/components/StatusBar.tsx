import type { AltTableLayout } from "@tichuml/table-layout-schema";
import type { EditorSelection } from "../state/editorState";

interface StatusBarProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
}

export function StatusBar(props: StatusBarProps) {
  const { layout, selection } = props;

  const selectionLabel = selection
    ? `${selection.type}: ${selection.id}`
    : "Nothing selected";

  return (
    <div className="editor-statusbar">
      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">Selection:</span>
        <span className={`editor-statusbar__value ${selection ? "editor-statusbar__value--selected" : ""}`}>
          {selectionLabel}
        </span>
      </div>

      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">Schema:</span>
        <span className="editor-statusbar__value">v{layout.schemaVersion}</span>
      </div>

      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">Table:</span>
        <span className="editor-statusbar__value">
          {layout.table.worldWidth.toFixed(1)} x {layout.table.worldHeight.toFixed(1)}
        </span>
      </div>

      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">East cards:</span>
        <span className="editor-statusbar__value">{layout.hands.east.fan.cardCount}</span>
      </div>

      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">West cards:</span>
        <span className="editor-statusbar__value">{layout.hands.west.fan.cardCount}</span>
      </div>

      <div className="editor-statusbar__spacer" />

      <div className="editor-statusbar__item">
        <span className="editor-statusbar__label">Rotations:</span>
        <span className="editor-statusbar__value">radians (stored) / degrees (display)</span>
      </div>
    </div>
  );
}
