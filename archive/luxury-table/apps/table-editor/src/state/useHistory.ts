import { useCallback, useRef, useState } from "react";
import type { AltTableLayout } from "@tichuml/table-layout-schema";
import { cloneLayout, deepEqual } from "../state/editorState";

const MAX_HISTORY = 100;

interface HistoryEntry {
  layout: AltTableLayout;
  description: string;
  timestamp: number;
}

export function useHistory(initialLayout: AltTableLayout) {
  const [layout, setLayoutState] = useState<AltTableLayout>(initialLayout);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const lastSavedRef = useRef<AltTableLayout>(cloneLayout(initialLayout));

  const setLayout = useCallback((nextLayout: AltTableLayout, description = "Edit") => {
    setLayoutState((prev) => {
      if (deepEqual(prev, nextLayout)) return prev;

      pastRef.current.push({
        layout: cloneLayout(prev),
        description,
        timestamp: Date.now()
      });

      if (pastRef.current.length > MAX_HISTORY) {
        pastRef.current = pastRef.current.slice(-MAX_HISTORY);
      }

      futureRef.current = [];
      lastSavedRef.current = cloneLayout(nextLayout);
      return nextLayout;
    });
  }, []);

  const setLayoutDirect = useCallback((nextLayout: AltTableLayout) => {
    setLayoutState(nextLayout);
    lastSavedRef.current = cloneLayout(nextLayout);
  }, []);

  const undo = useCallback((): boolean => {
    const entry = pastRef.current.pop();
    if (!entry) return false;

    setLayoutState((current) => {
      futureRef.current.push({
        layout: cloneLayout(current),
        description: "Redo",
        timestamp: Date.now()
      });
      lastSavedRef.current = cloneLayout(entry.layout);
      return entry.layout;
    });

    return true;
  }, []);

  const redo = useCallback((): boolean => {
    const entry = futureRef.current.pop();
    if (!entry) return false;

    setLayoutState((current) => {
      pastRef.current.push({
        layout: cloneLayout(current),
        description: "Undo",
        timestamp: Date.now()
      });
      lastSavedRef.current = cloneLayout(entry.layout);
      return entry.layout;
    });

    return true;
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const resetToDefault = useCallback((defaultLayout: AltTableLayout) => {
    setLayoutState((current) => {
      pastRef.current.push({
        layout: cloneLayout(current),
        description: "Reset to defaults",
        timestamp: Date.now()
      });
      futureRef.current = [];
      lastSavedRef.current = cloneLayout(defaultLayout);
      return defaultLayout;
    });
  }, []);

  const loadLayout = useCallback((newLayout: AltTableLayout) => {
    setLayoutState((current) => {
      pastRef.current.push({
        layout: cloneLayout(current),
        description: "Load layout",
        timestamp: Date.now()
      });
      futureRef.current = [];
      lastSavedRef.current = cloneLayout(newLayout);
      return newLayout;
    });
  }, []);

  return {
    layout,
    setLayout,
    setLayoutDirect,
    undo,
    redo,
    canUndo,
    canRedo,
    resetToDefault,
    loadLayout
  };
}
