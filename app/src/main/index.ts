import { join } from "node:path";

import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { z } from "zod";

import type { Entry } from "../shared/session-ipc.js";
import { AgentPool } from "./agent-pool.js";
import { LocalDatabase } from "./db/database.js";
import { SessionService } from "./sessions/index.js";

let mainWindow: BrowserWindow | null = null;
let database: LocalDatabase | null = null;
let agentPool: AgentPool | null = null;
let sessionService: SessionService | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
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
  mainWindow = window;
  agentPool?.updateBrowserWindow(window);
  return window;
}

async function loadWindow(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function requireSessionService(): SessionService {
  if (!sessionService)
    throw new Error("Session service is unavailable before application readiness");
  return sessionService;
}

function registerIpc(): void {
  ipcMain.handle("sessions:create", (_event, appId: unknown) =>
    requireSessionService().create(z.string().min(1).parse(appId)),
  );
  ipcMain.handle("sessions:list", (_event, appId: unknown) =>
    requireSessionService().list(z.string().min(1).parse(appId)),
  );
  ipcMain.handle("sessions:get", (_event, sessionId: unknown) =>
    requireSessionService().get(z.string().uuid().parse(sessionId)),
  );
  ipcMain.handle("sessions:getEntries", (_event, sessionId: unknown) =>
    requireSessionService().getEntries(z.string().uuid().parse(sessionId)),
  );
  ipcMain.handle("sessions:rename", (_event, sessionId: unknown, name: unknown) => {
    requireSessionService().rename(
      z.string().uuid().parse(sessionId),
      z.string().trim().min(1).max(200).parse(name),
    );
  });
  ipcMain.handle("sessions:delete", (_event, sessionId: unknown) => {
    requireSessionService().delete(z.string().uuid().parse(sessionId));
  });
  ipcMain.handle("sessions:appendEntries", (_event, sessionId: unknown, entries: unknown) => {
    const parsedSessionId = z.string().uuid().parse(sessionId);
    const parsedEntries = z.array(z.custom<Entry>()).parse(entries);
    requireSessionService().appendEntries(parsedSessionId, parsedEntries);
  });

  ipcMain.handle("clipboard:writeText", (_event, text: unknown) => {
    clipboard.writeText(z.string().parse(text));
  });
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggleMaximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

app.whenReady().then(async () => {
  database = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
  sessionService = new SessionService(database);
  const initialWindow = createWindow();
  agentPool = new AgentPool(initialWindow);
  registerIpc();
  await loadWindow(initialWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createWindow();
      void loadWindow(window);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void agentPool?.destroyAll();
  database?.close();
});
