import { useState, useCallback } from "react";
import type { AltTableLayout } from "@tichuml/table-layout-schema";
import { validateAltTableLayout } from "@tichuml/table-layout-schema";

interface JsonModalProps {
  mode: "import" | "export";
  layout: AltTableLayout;
  onClose: () => void;
  onImport: (layout: AltTableLayout) => void;
}

export function JsonModal(props: JsonModalProps) {
  const { mode, layout, onClose, onImport } = props;
  const [jsonText, setJsonText] = useState(() => JSON.stringify(layout, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch {
      setError("Failed to copy to clipboard");
    }
  }, [jsonText]);

  const handleImport = useCallback(() => {
    setError(null);
    setWarnings([]);

    try {
      const parsed = JSON.parse(jsonText);
      const result = validateAltTableLayout(parsed);

      if (result.errors.length > 0) {
        setError(result.errors.join("\n"));
        return;
      }

      setWarnings(result.warnings);
      onImport(parsed as AltTableLayout);
    } catch (err) {
      setError(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [jsonText, onImport]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alt-table-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonText]);

  return (
    <div className="editor-modal-backdrop" onClick={onClose}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-modal__title">
          {mode === "export" ? "Export Layout JSON" : "Import Layout JSON"}
        </div>

        <textarea
          className="editor-modal__textarea"
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setError(null);
          }}
          readOnly={mode === "export"}
          spellCheck={false}
        />

        {error && <div className="editor-modal__error">{error}</div>}
        {warnings.map((w, i) => (
          <div key={i} className="editor-modal__warning">{w}</div>
        ))}

        <div className="editor-modal__actions">
          {mode === "export" ? (
            <>
              <button className="editor-btn" onClick={handleCopy}>
                Copy to Clipboard
              </button>
              <button className="editor-btn editor-btn--primary" onClick={handleDownload}>
                Download File
              </button>
              <button className="editor-btn" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button className="editor-btn editor-btn--primary" onClick={handleImport}>
                Import
              </button>
              <button className="editor-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
