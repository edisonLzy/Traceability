import { join } from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";
import { z } from "zod";

import { AgentPool } from "./agent/agent-pool.js";
import { ModelRegistry } from "./agent/model-registry.js";
import { SessionStore } from "./agent/session-store.js";
import { LocalDatabase } from "./db/database.js";

let mainWindow: BrowserWindow | null = null;
let database: LocalDatabase | null = null;
let agentPool: AgentPool | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
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
      // electron-vite emits the preload entry as ESM (`index.mjs`). Keeping this
      // explicit is important in production: without the preload the renderer
      // cannot reach the deliberately small, validated IPC surface.
      preload: join(__dirname, "../preload/index.mjs"),
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function requireAgentPool(): AgentPool {
  if (!agentPool) throw new Error("Agent runtime is unavailable before application readiness");
  return agentPool;
}

function registerIpc(): void {
  ipcMain.handle("sessions:list", (_event, appId: unknown) =>
    requireAgentPool().listSessions(z.string().parse(appId)),
  );
  ipcMain.handle("sessions:create", (_event, appId: unknown) =>
    requireAgentPool().createSession(z.string().parse(appId)),
  );
  ipcMain.handle("sessions:get", (_event, sessionId: unknown) =>
    requireAgentPool().getSession(z.string().parse(sessionId)),
  );
  ipcMain.handle("sessions:rename", (_event, input: unknown) => {
    const value = z
      .object({ sessionId: z.string(), title: z.string().min(1).max(200) })
      .parse(input);
    requireAgentPool().renameSession(value.sessionId, value.title);
  });
  ipcMain.handle("sessions:delete", (_event, sessionId: unknown) =>
    requireAgentPool().deleteSession(z.string().parse(sessionId)),
  );
  ipcMain.handle("sessions:set-model", (_event, input: unknown) => {
    const value = z
      .object({
        sessionId: z.string(),
        model: z.object({ providerId: z.string(), modelId: z.string() }),
      })
      .parse(input);
    return requireAgentPool().setModel(value.sessionId, value.model);
  });
  ipcMain.handle("agent:prompt", (_event, input: unknown) => {
    const value = z
      .object({
        sessionId: z.string(),
        text: z.string().trim().min(1).max(20_000),
        model: z.object({ providerId: z.string(), modelId: z.string() }).optional(),
        context: z.object({
          appId: z.string(),
          source: z.enum(["general", "issue", "performance", "metric"]),
          issueId: z.string().optional(),
          metricName: z.string().optional(),
          hours: z.union([z.literal(1), z.literal(24), z.literal(168)]).optional(),
        }),
      })
      .parse(input);
    return requireAgentPool().prompt(value);
  });
  ipcMain.handle("agent:abort", (_event, sessionId: unknown) =>
    requireAgentPool().abort(z.string().parse(sessionId)),
  );
  ipcMain.handle("agent:list-models", () => requireAgentPool().listModels());
  ipcMain.handle("agent:reload-models", () => requireAgentPool().reloadModels());
}

app.whenReady().then(async () => {
  database = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
  agentPool = new AgentPool(new SessionStore(database), new ModelRegistry(), () => mainWindow);
  await agentPool.initialize();
  registerIpc();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  agentPool?.dispose();
  database?.close();
});
