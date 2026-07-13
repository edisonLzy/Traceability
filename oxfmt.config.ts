import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["docs/**", "node_modules/**", "dist/**"],
  sortImports: true,
});
