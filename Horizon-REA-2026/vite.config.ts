import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const dracoSource = resolve(rootDir, "node_modules/three/examples/jsm/libs/draco/gltf");
const dracoPublic = resolve(rootDir, "public/model-draco");

/** Include local Draco decoders in BOTH dev and Pages builds (no CDN required). */
function prepareDraco() {
  mkdirSync(dracoPublic, { recursive:true });
  for (const filename of ["draco_wasm_wrapper.js", "draco_decoder.wasm", "draco_decoder.js"]) {
    copyFileSync(resolve(dracoSource,filename),resolve(dracoPublic,filename));
  }
}

export default defineConfig({
  base: "./",
  plugins: [{
    name: "horizon-gallery-local-draco",
    configResolved: prepareDraco
  }],
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: {
        game: resolve(rootDir,"index.html"),
        gallery: resolve(rootDir,"model-gallery.html")
      }
    }
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"]
  }
});
