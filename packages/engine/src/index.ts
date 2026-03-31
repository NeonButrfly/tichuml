import { FOUNDATION_MILESTONE } from "@tichuml/shared";

export type EngineFoundation = {
  name: "authoritative-engine";
  milestone: typeof FOUNDATION_MILESTONE;
  deterministicCoreReady: false;
};

export const engineFoundation: EngineFoundation = {
  name: "authoritative-engine",
  milestone: FOUNDATION_MILESTONE,
  deterministicCoreReady: false
};

