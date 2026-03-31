export const FOUNDATION_MILESTONE = "milestone-0";
export const workspaceManifests = [
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
const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;
export const defaultDatabaseUrl = runtimeEnv?.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tichuml";
//# sourceMappingURL=index.js.map