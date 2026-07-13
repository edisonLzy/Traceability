import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "import"],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
    "no-unused-vars": "warn",
  },
});
