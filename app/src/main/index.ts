import { join } from "path";

import { app, BrowserWindow } from "electron";

import { AgentPool } from "./agent-pool.js";
import { BrowserService } from "./browser/browser-service.js";
import { SessionPersistence } from "./sessions/index.js";

void app
  .whenReady()
  .then(() => {
    let browserWindow: BrowserWindow | null = createWindow();

    const agentPool = new AgentPool(browserWindow);
    const browserService = new BrowserService(browserWindow);
    const sessionPersistence = new SessionPersistence(browserWindow);
    loadWindow(browserWindow);

    app.on("activate", async () => {
      if (!browserWindow || browserWindow.isDestroyed()) {
        const recreatedWindow = createWindow();
        await browserService.updateBrowserWindow(recreatedWindow);
        browserWindow = recreatedWindow;
        agentPool.updateBrowserWindow(recreatedWindow);
        sessionPersistence.updateBrowserWindow(recreatedWindow);
        loadWindow(recreatedWindow);
      }
    });

    app.on("quit", () => {
      void agentPool.destroyAll();
      void browserService.destroyAll();
      void sessionPersistence.destroyAll();
    });
  })
  .catch((error: unknown) => {
    console.error("Failed to initialize Traceability main process:", error);
    app.quit();
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
      webviewTag: true,
    },
  });

  return mainWindow;
}

function loadWindow(browserWindow: BrowserWindow) {
  if (process.env.ELECTRON_RENDERER_URL) {
    void browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void browserWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
