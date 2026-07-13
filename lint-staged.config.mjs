export default {
  "*.{js,jsx,ts,tsx}": (filenames) => [
    `pnpm oxlint --fix ${filenames.join(" ")}`,
    `pnpm oxfmt --write ${filenames.join(" ")}`,
  ],
  "*.json": (filenames) => [`pnpm oxfmt --write ${filenames.join(" ")}`],
};
