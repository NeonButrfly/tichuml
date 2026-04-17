export const FOUNDATION_MILESTONE = "milestone-0";
export * from "./backend.js";
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

const runtimeEnv =
  typeof process !== "undefined" ? process.env : undefined;

export const defaultDatabaseUrl =
  runtimeEnv?.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tichuml";
