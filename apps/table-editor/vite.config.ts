import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    strictPort: true
  },
  resolve: {
    alias: {
      "@tichuml/table-layout-schema": resolve(__dirname, "../../packages/table-layout-schema/src/index.ts")
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
