import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      // Keep preload compatible with Electron's renderer sandbox. The app
      // package is ESM, so Electron Vite emits this CJS preload as index.cjs.
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/preload/index.ts"),
          "browser-guest": resolve(import.meta.dirname, "src/preload/browser-guest.ts"),
        },
        output: {
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    base: "./",
    assetsInclude: ["**/*.lottie"],
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve(import.meta.dirname, "src/renderer"),
        "@shared": resolve(import.meta.dirname, "src/shared"),
        "@extensions": resolve(import.meta.dirname, "src/extensions"),
      },
    },
  },
});
