import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4096
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"]
  }
});
