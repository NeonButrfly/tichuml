import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@tichuml/shared": path.resolve("packages/shared/src/index.ts"),
      "@tichuml/engine": path.resolve("packages/engine/src/index.ts"),
      "@tichuml/telemetry": path.resolve("packages/telemetry/src/index.ts"),
      "@tichuml/ai-heuristics": path.resolve("packages/ai-heuristics/src/index.ts"),
      "@tichuml/ui-kit": path.resolve("packages/ui-kit/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});

