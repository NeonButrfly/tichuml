import type { Card } from "@tichuml/engine";
import type { PassLaneDirection, SeatVisualPosition } from "../table-layout";
import type {
  SouthPerspectivePose,
  SouthPerspectiveTableGeometry
} from "./south-perspective-projection";

export type AlternateCameraPreset = "left" | "center" | "right";

export type ImmersiveSceneSeat = {
  key: string;
  position: SeatVisualPosition;
  title: string;
  relation: string;
  status: string;
  handCount: number;
  isActive: boolean;
  pose: SouthPerspectivePose;
  countPose: SouthPerspectivePose | null;
};

export type ImmersiveSceneCard = {
  key: string;
  card: Card;
  position: SeatVisualPosition;
  pose: SouthPerspectivePose;
  width: number;
  height: number;
  selected?: boolean;
  faceDown?: boolean;
  legal?: boolean;
  winning?: boolean;
};

export type ImmersiveScenePassRoute = {
  key: string;
  pose: SouthPerspectivePose;
  width: number;
  height: number;
  sourcePosition: SeatVisualPosition;
  targetPosition: SeatVisualPosition;
  direction: PassLaneDirection;
  displayMode: "passing" | "pickup";
  occupied: boolean;
  interactive: boolean;
  selected: boolean;
  faceDown: boolean;
  assignedCard: Card | null;
};

export type ImmersiveSceneModel = {
  geometry: SouthPerspectiveTableGeometry;
  cameraYaw: number;
  phaseLabel: string;
  currentWishLabel: string;
  hintLabel: string;
  score: {
    we: number;
    they: number;
    pose: SouthPerspectivePose;
  };
  statusPose: SouthPerspectivePose;
  seats: ImmersiveSceneSeat[];
  remoteCards: ImmersiveSceneCard[];
  southCards: ImmersiveSceneCard[];
  trickCards: ImmersiveSceneCard[];
  passRoutes: ImmersiveScenePassRoute[];
};
