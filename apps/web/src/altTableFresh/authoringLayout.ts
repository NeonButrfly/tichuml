import {
  makeNorthHandAnchors,
  makePassingAnchors,
  makeSideHandAnchors,
  makeSouthHandAnchors,
  makeTrickAnchors,
  type CardAnchor,
  type PassAnchor,
  type TrickAnchor
} from "./freshTableMath";
import { DESIGN_H, DESIGN_W } from "./tableFit";

export type FreshAltHandId = "north" | "east" | "south" | "west";

export interface FreshAltAuthoringScene {
  design: {
    w: number;
    h: number;
  };
  hands: Record<FreshAltHandId, CardAnchor[]>;
  passing: PassAnchor[];
  tricks: TrickAnchor[];
}

export interface LaneSelectionModel<TLane> {
  laneIds: string[];
  lanes: Record<string, TLane>;
  hasLane: (laneId: string) => boolean;
  getLane: (laneId: string) => TLane | null;
}

const EDITABLE_HAND_IDS: FreshAltHandId[] = ["north", "east", "west"];

export function createFreshAltAuthoringScene(): FreshAltAuthoringScene {
  return {
    design: {
      w: DESIGN_W,
      h: DESIGN_H
    },
    hands: {
      north: makeNorthHandAnchors(),
      east: makeSideHandAnchors("east"),
      south: makeSouthHandAnchors(),
      west: makeSideHandAnchors("west")
    },
    passing: makePassingAnchors(),
    tricks: makeTrickAnchors()
  };
}

export function getEditableHandIds(): FreshAltHandId[] {
  return [...EDITABLE_HAND_IDS];
}

export function isHandLocked(handId: FreshAltHandId): boolean {
  return !EDITABLE_HAND_IDS.includes(handId);
}

export function createLaneSelectionModel<TLane>(layout: {
  passingLanes: Record<string, TLane>;
}): LaneSelectionModel<TLane> {
  const lanes = layout.passingLanes;
  const laneIds = Object.keys(lanes);

  return {
    laneIds,
    lanes,
    hasLane: (laneId) => laneId in lanes,
    getLane: (laneId) => lanes[laneId] ?? null
  };
}
