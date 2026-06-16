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
import {
  PASSING_LANE_IDS,
  type PassingLaneId
} from "@tichuml/table-layout-schema";
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
  laneIds: PassingLaneId[];
  lanes: Partial<Record<PassingLaneId, TLane>>;
  hasLane: (laneId: PassingLaneId) => boolean;
  getLane: (laneId: PassingLaneId) => TLane | null;
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
  passingLanes: Partial<Record<PassingLaneId, TLane>>;
}): LaneSelectionModel<TLane> {
  const lanes = layout.passingLanes;
  const laneIds = PASSING_LANE_IDS.filter((laneId) => Object.hasOwn(lanes, laneId));

  return {
    laneIds,
    lanes,
    hasLane: (laneId) => Object.hasOwn(lanes, laneId),
    getLane: (laneId) => (Object.hasOwn(lanes, laneId) ? lanes[laneId] ?? null : null)
  };
}
