import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  server: { port: 5174 },
  build: {
    // Preview intentionally mirrors a deployed, minified bundle while preserving
    // a private source map that can be uploaded to Traceability.
    sourcemap: mode === "preview",
  },
  define: {
    __TRACEABILITY_RELEASE__: JSON.stringify(
      mode === "preview" ? "web-demo-preview" : "web-demo-dev",
    ),
  },
}));
