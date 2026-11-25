import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: {
        showroom: "index.html",
        game: "race.html",
        gallery: "model-gallery.html",
        gpuDrive: "webgpu-drive.html",
        gpuFleet: "webgpu-fleet.html"
      }
    }
  },
  optimizeDeps: { exclude: ["@dimforge/rapier3d-compat"] }
});
