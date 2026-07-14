import { join } from "node:path";

import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { z } from "zod";

import { AgentPool } from "./agent-pool.js";
import { LocalDatabase } from "./db/database.js";
import { SessionService } from "./sessions/index.js";

app.whenReady().then(() => {
  let browserWindow: BrowserWindow | null = createWindow();
  const database = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
  const agentPool = new AgentPool(browserWindow);
  const sessionService = new SessionService(database, browserWindow);
  const unbindAppShellIpc = bindAppShellIpc(() => browserWindow);

  void loadWindow(browserWindow);

  app.on("activate", () => {
    if (!browserWindow || browserWindow.isDestroyed()) {
      browserWindow = createWindow();
      agentPool.updateBrowserWindow(browserWindow);
      sessionService.updateBrowserWindow(browserWindow);
      void loadWindow(browserWindow);
    }
  });

  app.on("quit", () => {
    void agentPool.destroyAll();
    sessionService.destroy();
    unbindAppShellIpc();
    database.close();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function createWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: "#101115",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(__dirname, "../preload/index.mjs"),
    },
  });
}

async function loadWindow(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function bindAppShellIpc(getBrowserWindow: () => BrowserWindow | null): VoidFunction {
  ipcMain.handle("clipboard:writeText", (_event, text: unknown) => {
    clipboard.writeText(z.string().parse(text));
  });
  ipcMain.handle("window:minimize", () => getBrowserWindow()?.minimize());
  ipcMain.handle("window:toggleMaximize", () => {
    const window = getBrowserWindow();
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", () => getBrowserWindow()?.close());

  return () => {
    ipcMain.removeHandler("clipboard:writeText");
    ipcMain.removeHandler("window:minimize");
    ipcMain.removeHandler("window:toggleMaximize");
    ipcMain.removeHandler("window:close");
  };
}
