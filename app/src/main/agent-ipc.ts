import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

type UnbindFunction = VoidFunction;

export abstract class AbstractAgentIPCHandler<AgentIPC> {
  protected typedIpcMain = createTypedIpcMain<AgentIPC>();

  protected unbind: UnbindFunction | null = null;

  private browserWindow: BrowserWindow | null = null;

  constructor(initialBrowserWindow: BrowserWindow) {
    this.browserWindow = initialBrowserWindow;
  }

  protected get currentBrowserWindow(): BrowserWindow | null {
    return this.browserWindow;
  }

  public updateBrowserWindow = (browserWindow: BrowserWindow) => {
    this.browserWindow = browserWindow;
  };

  public sendMessageToRenderer(name: string, data: unknown) {
    const browserWindow = this.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      return;
    }

    browserWindow.webContents.send(name, data);
  }

  protected abstract bind(): UnbindFunction;
}

function createTypedIpcMain<AgentIPC = Record<string, never>>() {
  return {
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as string, (_event, ...params) => {
        return (listener as (...args: unknown[]) => unknown)(...params);
      });
    },
    removeHandler<C extends keyof AgentIPC = keyof AgentIPC>(channel: C) {
      ipcMain.removeHandler(channel as string);
    },
  };
}
