import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tichuml/ai-heuristics": path.resolve(projectDir, "../../packages/ai-heuristics/src/index.ts"),
      "@tichuml/engine": path.resolve(projectDir, "../../packages/engine/src/index.ts"),
      "@tichuml/shared": path.resolve(projectDir, "../../packages/shared/src/index.ts"),
      "@tichuml/ui-kit": path.resolve(projectDir, "../../packages/ui-kit/src/index.tsx")
    }
  }
});
