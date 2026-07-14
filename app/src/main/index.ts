import { join } from "path";

import { app, BrowserWindow } from "electron";

import { AgentPool } from "./agent-pool.js";
import { SessionPersistence } from "./sessions/index.js";

app.whenReady().then(() => {
  let browserWindow: BrowserWindow | null = createWindow();

  const agentPool = new AgentPool(browserWindow);
  const sessionPersistence = new SessionPersistence(browserWindow);

  app.on("activate", () => {
    if (!browserWindow || browserWindow.isDestroyed()) {
      browserWindow = createWindow();
      agentPool.updateBrowserWindow(browserWindow);
      sessionPersistence.updateBrowserWindow(browserWindow);
    }
  });

  app.on("quit", () => {
    void agentPool.destroyAll();
    void sessionPersistence.destroyAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Traceability main process started!");

function createWindow() {
  const isMac = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 18 } }
      : {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#f5f5f7",
            height: 30,
          },
        }),
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    title: "Traceability",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
