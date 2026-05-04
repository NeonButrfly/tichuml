import { readRuntimeEnv } from "./runtime-env.js";

export const FOUNDATION_MILESTONE = "milestone-0";
export * from "./backend.js";
export * from "./outcomes.js";
export * from "./runtime-env.js";
export * from "./seed.js";

export type WorkspacePackage =
  | "@tichuml/shared"
  | "@tichuml/engine"
  | "@tichuml/telemetry"
  | "@tichuml/ai-heuristics"
  | "@tichuml/ui-kit";

export type WorkspaceManifest = {
  packageName: WorkspacePackage;
  displayName: string;
  stage: "foundation";
};

export const workspaceManifests: WorkspaceManifest[] = [
  {
    packageName: "@tichuml/shared",
    displayName: "Shared",
    stage: "foundation"
  },
  {
    packageName: "@tichuml/engine",
    displayName: "Engine",
    stage: "foundation"
  },
  {
    packageName: "@tichuml/telemetry",
    displayName: "Telemetry",
    stage: "foundation"
  },
  {
    packageName: "@tichuml/ai-heuristics",
    displayName: "AI Heuristics",
    stage: "foundation"
  },
  {
    packageName: "@tichuml/ui-kit",
    displayName: "UI Kit",
    stage: "foundation"
  }
];

export const defaultDatabaseUrl =
  readRuntimeEnv("DATABASE_URL") ??
  "postgres://tichu:tichu_dev_password@localhost:54329/tichu";
