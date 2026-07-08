import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDefaultAltTableLayout,
  type AltTableLayout,
  type SideHandId,
  type PassingLaneId
} from "@tichuml/table-layout-schema";
import { useHistory } from "./state/useHistory";
import {
  createInitialEditorState,
  saveToLocalStorage,
  clearLocalStorage,
  selectHand,
  selectLane,
  selectArrow,
  type EditorSelection
} from "./state/editorState";
import { Toolbar } from "./components/Toolbar";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { StatusBar } from "./components/StatusBar";
import { EditorPreview } from "./rendering/EditorPreview";
import { JsonModal } from "./components/JsonModal";

export function App() {
  const initialState = useMemo(() => createInitialEditorState(), []);
  const defaultLayout = useMemo(() => createDefaultAltTableLayout(), []);

  const {
    layout,
    setLayout,
    undo,
    redo,
    resetToDefault,
    loadLayout
  } = useHistory(initialState.layout);

  const [selection, setSelection] = useState<EditorSelection | null>(initialState.selection);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonModalMode, setJsonModalMode] = useState<"import" | "export">("export");

  useEffect(() => {
    saveToLocalStorage(layout);
  }, [layout]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "w") {
        // Translate mode - handled by gizmo
      }
      if (event.key === "e") {
        // Rotate mode
      }
      if (event.key === "r") {
        // Scale mode
      }

      if (event.key === "Escape") {
        setSelection(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleSelectHand = useCallback((side: SideHandId) => {
    setSelection(selectHand(side));
  }, []);

  const handleSelectLane = useCallback((laneId: PassingLaneId) => {
    setSelection(selectLane(laneId));
  }, []);

  const handleSelectArrow = useCallback((laneId: PassingLaneId) => {
    setSelection(selectArrow(laneId));
  }, []);

  const handleExportJson = useCallback(() => {
    setJsonModalMode("export");
    setJsonModalOpen(true);
  }, []);

  const handleImportJson = useCallback(() => {
    setJsonModalMode("import");
    setJsonModalOpen(true);
  }, []);

  const handleCopySection = useCallback(() => {
    if (!selection) {
      return;
    }

    const payload =
      selection.type === "hand"
        ? { hands: { [selection.id]: layout.hands[selection.id as SideHandId] } }
        : {
            passingLanes: {
              [selection.id]: layout.passingLanes[selection.id as PassingLaneId]
            }
          };

    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }, [layout, selection]);

  const handleLoadDefault = useCallback(() => {
    resetToDefault(defaultLayout);
    setSelection(null);
  }, [resetToDefault, defaultLayout]);

  const handleClearLocal = useCallback(() => {
    clearLocalStorage();
  }, []);

  const handleJsonModalClose = useCallback(() => {
    setJsonModalOpen(false);
  }, []);

  const handleJsonImport = useCallback((newLayout: AltTableLayout) => {
    loadLayout(newLayout);
    setSelection(null);
    setJsonModalOpen(false);
  }, [loadLayout]);

  return (
    <div className="editor-root">
      <Toolbar
        onUndo={undo}
        onRedo={redo}
        onExport={handleExportJson}
        onImport={handleImportJson}
        onCopySection={handleCopySection}
        copySectionDisabled={!selection}
        onLoadDefault={handleLoadDefault}
        onClearLocal={handleClearLocal}
      />

      <HierarchyPanel
        layout={layout}
        selection={selection}
        onSelectHand={handleSelectHand}
        onSelectLane={handleSelectLane}
        onSelectArrow={handleSelectArrow}
      />

      <div className="editor-preview">
        <EditorPreview
          layout={layout}
          selection={selection}
          onLayoutChange={setLayout}
          onSelectHand={handleSelectHand}
          onSelectLane={handleSelectLane}
          onSelectArrow={handleSelectArrow}
          onClearSelection={() => setSelection(null)}
        />
      </div>

      <PropertiesPanel
        layout={layout}
        selection={selection}
        onLayoutChange={setLayout}
      />

      <StatusBar
        layout={layout}
        selection={selection}
      />

      {jsonModalOpen && (
        <JsonModal
          mode={jsonModalMode}
          layout={layout}
          onClose={handleJsonModalClose}
          onImport={handleJsonImport}
        />
      )}
    </div>
  );
}
