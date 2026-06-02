import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const copyManifestPlugin = {
  name: "copy-extension-manifest",
  closeBundle: async (): Promise<void> => {
    const target = resolve("dist/manifest.json");
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve("manifest.json"), target);
  }
};

export default defineConfig({
  plugins: [react(), copyManifestPlugin],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve("index.html"),
        background: resolve("src/background.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
