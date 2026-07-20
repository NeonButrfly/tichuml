import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, "../web/public"),
  server: {
    port: 5178,
    strictPort: true
  },
  resolve: {
    alias: {
      "@tichuml/table-layout-schema": resolve(__dirname, "../../packages/table-layout-schema/src/index.ts"),
      "@tichuml/fresh-alt-authoring": resolve(__dirname, "../../apps/web/src/altTableFresh/authoringLayout.ts")
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
