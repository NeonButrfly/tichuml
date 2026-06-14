interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: () => void;
  onLoadDefault: () => void;
  onClearLocal: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__group">
        <span className="editor-toolbar__label">File</span>
        <button className="editor-btn editor-btn--primary" onClick={props.onExport} title="Export layout JSON">
          Export JSON
        </button>
        <button className="editor-btn" onClick={props.onImport} title="Import layout JSON">
          Import JSON
        </button>
        <button className="editor-btn" onClick={props.onLoadDefault} title="Reset to default layout">
          Load Default
        </button>
      </div>

      <div className="editor-toolbar__group">
        <span className="editor-toolbar__label">History</span>
        <button className="editor-btn" onClick={props.onUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="editor-btn" onClick={props.onRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>

      <div className="editor-toolbar__group">
        <span className="editor-toolbar__label">Storage</span>
        <button className="editor-btn editor-btn--danger" onClick={props.onClearLocal} title="Clear local storage">
          Clear Local
        </button>
      </div>

      <div className="editor-toolbar__group">
        <span className="editor-toolbar__label">Shortcuts</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          W=Translate E=Rotate R=Scale Esc=Deselect
        </span>
      </div>
    </div>
  );
}
