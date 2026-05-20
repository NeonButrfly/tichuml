import type { GameState } from "@tichuml/engine";

export type SurfaceTableMode = "calm" | "decision" | "resolution";
export type SurfaceHandMode = "immersive" | "simplified";

export type SurfacePresentation = {
  tableMode: SurfaceTableMode;
  handMode: SurfaceHandMode;
  controlsVisible: boolean;
  dramaticTurnCue: boolean;
};

export function deriveLocalMustAct(input: {
  roundGenerationPending: boolean;
  autoplayLocal: boolean;
  localIsPrimaryActor: boolean;
  pickupPending: boolean;
  hasLocalPassSelection: boolean;
  hasLocalDragonRecipientChoice: boolean;
}): boolean {
  return (
    !input.roundGenerationPending &&
    !input.autoplayLocal &&
    (input.localIsPrimaryActor ||
      input.pickupPending ||
      input.hasLocalPassSelection ||
      input.hasLocalDragonRecipientChoice)
  );
}

export function deriveSurfacePresentation(input: {
  state: Pick<GameState, "pendingDragonGift">;
  localMustAct: boolean;
  wishDialogOpen: boolean;
  trickIsResolving: boolean;
  hasResolutionAnimation: boolean;
}): SurfacePresentation {
  const decisionMode = input.localMustAct || input.wishDialogOpen;
  const resolutionMode =
    input.trickIsResolving ||
    input.hasResolutionAnimation ||
    input.state.pendingDragonGift !== null;

  if (resolutionMode) {
    return {
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: input.localMustAct || input.wishDialogOpen,
      dramaticTurnCue: true
    };
  }

  if (decisionMode) {
    return {
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true,
      dramaticTurnCue: true
    };
  }

  return {
    tableMode: "calm",
    handMode: "immersive",
    controlsVisible: false,
    dramaticTurnCue: false
  };
}
