import {
  type AltTableLayout,
  type SideHandId,
  type SideHandLayout,
  type PassingLaneId,
  type PassingLaneTransform,
  type HandMasterTransform,
  type CardFanSettings,
  createDefaultAltTableLayout,
  createDefaultCardFanSettings,
  PASSING_LANE_IDS,
  SIDE_HAND_IDS
} from "@tichuml/table-layout-schema";

export type EditorObjectType = "hand" | "lane" | "arrow";

export interface EditorSelection {
  type: EditorObjectType;
  id: string;
}

export interface EditorState {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  clipboard: string | null;
}

export interface EditorHistoryEntry {
  layout: AltTableLayout;
  description: string;
}

const STORAGE_KEY = "tichuml-table-editor-v1";

export function createInitialEditorState(): EditorState {
  const saved = loadFromLocalStorage();
  if (saved) {
    return {
      layout: saved,
      selection: null,
      clipboard: null
    };
  }
  return {
    layout: createDefaultAltTableLayout(),
    selection: null,
    clipboard: null
  };
}

export function saveToLocalStorage(layout: AltTableLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout, null, 2));
  } catch {
    // Storage full or unavailable
  }
}

export function loadFromLocalStorage(): AltTableLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schemaVersion === 1) {
      return normalizeEditorLayout(parsed as AltTableLayout);
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeEditorLayout(layout: AltTableLayout): AltTableLayout {
  const defaultFan = createDefaultCardFanSettings();
  return {
    ...layout,
    hands: {
      north: normalizeHandFan(layout.hands.north, defaultFan),
      east: normalizeHandFan(layout.hands.east, defaultFan),
      west: normalizeHandFan(layout.hands.west, defaultFan),
      south: normalizeHandFan(layout.hands.south, defaultFan)
    }
  };
}

function normalizeHandFan<THand extends AltTableLayout["hands"][SideHandId]>(
  hand: THand,
  defaultFan: CardFanSettings
): THand {
  return {
    ...hand,
    fan: {
      ...defaultFan,
      ...hand.fan,
      cardLocalRotation: hand.fan.cardLocalRotation ?? defaultFan.cardLocalRotation,
      cardLocalPivot: hand.fan.cardLocalPivot ?? defaultFan.cardLocalPivot
    }
  };
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function selectHand(side: SideHandId): EditorSelection {
  return { type: "hand", id: side };
}

export function selectLane(laneId: PassingLaneId): EditorSelection {
  return { type: "lane", id: laneId };
}

export function selectArrow(laneId: PassingLaneId): EditorSelection {
  return { type: "arrow", id: laneId };
}

export function isEditableHandId(side: SideHandId): boolean {
  return side !== "south";
}

export function getSelectedHand(layout: AltTableLayout, selection: EditorSelection | null): SideHandLayout | null {
  if (!selection || selection.type !== "hand") return null;
  return layout.hands[selection.id as SideHandId] ?? null;
}

export function getSelectedLane(layout: AltTableLayout, selection: EditorSelection | null): PassingLaneTransform | null {
  if (!selection || (selection.type !== "lane" && selection.type !== "arrow")) return null;
  return layout.passingLanes[selection.id as PassingLaneId] ?? null;
}

export function updateHandMaster(
  layout: AltTableLayout,
  side: SideHandId,
  updater: (master: HandMasterTransform) => HandMasterTransform
): AltTableLayout {
  if (!isEditableHandId(side)) {
    return layout;
  }

  return {
    ...layout,
    hands: {
      ...layout.hands,
      [side]: {
        ...layout.hands[side],
        master: updater(layout.hands[side].master)
      }
    }
  };
}

export function updateHandFan(
  layout: AltTableLayout,
  side: SideHandId,
  updater: (fan: CardFanSettings) => CardFanSettings
): AltTableLayout {
  if (!isEditableHandId(side)) {
    return layout;
  }

  return {
    ...layout,
    hands: {
      ...layout.hands,
      [side]: {
        ...layout.hands[side],
        fan: updater(layout.hands[side].fan)
      }
    }
  };
}

export function updatePassingLane(
  layout: AltTableLayout,
  laneId: PassingLaneId,
  updater: (lane: PassingLaneTransform) => PassingLaneTransform
): AltTableLayout {
  return {
    ...layout,
    passingLanes: {
      ...layout.passingLanes,
      [laneId]: updater(layout.passingLanes[laneId])
    }
  };
}

export function cloneLayout(layout: AltTableLayout): AltTableLayout {
  return JSON.parse(JSON.stringify(layout));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { PASSING_LANE_IDS, SIDE_HAND_IDS };
