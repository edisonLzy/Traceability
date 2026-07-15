import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const electronVersion = require("electron/package.json").version;
const electronVitePackagePath = require.resolve("electron-vite/package.json");
const electronViteCliPath = join(dirname(electronVitePackagePath), "bin/electron-vite.js");

const child = spawn(process.execPath, [electronViteCliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // electron-vite is installed in pnpm's shared virtual store, where resolving
    // `electron` can select another workspace package's version. Always run and
    // target the Electron version declared by the desktop app instead.
    ELECTRON_EXEC_PATH: electronPath,
    ELECTRON_MAJOR_VER: electronVersion.split(".")[0],
  },
});

child.on("error", (error) => {
  console.error("Failed to start electron-vite:", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
