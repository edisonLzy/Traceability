import { webContents } from "electron";
import type { BrowserWindow, WebContents } from "electron";

import type { BrowserIPC } from "../../shared/browser-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";
import { BrowserCaptureService } from "./browser-capture-service.js";
import { BrowserGuestSession } from "./browser-guest-session.js";

export class BrowserService extends AbstractAgentIPCHandler<BrowserIPC> implements BrowserIPC {
  private readonly captureService: BrowserCaptureService;
  private readonly guestSession: BrowserGuestSession;
  private guest: WebContents | null = null;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.captureService = new BrowserCaptureService();
    this.guestSession = new BrowserGuestSession(browserWindow);
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = [
      "registerBrowserGuest",
      "unregisterBrowserGuest",
      "startBrowserRecording",
      "stopBrowserRecording",
    ] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) this.typedIpcMain.removeHandler(channel);
    };
  }

  public registerBrowserGuest: BrowserIPC["registerBrowserGuest"] = async ({ webContentsId }) => {
    const guest = webContents.fromId(webContentsId);
    const browserWindow = this.currentBrowserWindow;
    if (
      !guest ||
      guest.isDestroyed() ||
      guest.getType() !== "webview" ||
      !browserWindow ||
      browserWindow.isDestroyed() ||
      browserWindow.webContents.isDestroyed() ||
      guest.hostWebContents !== browserWindow.webContents
    ) {
      throw new Error("Browser guest must be a live webview hosted by the current window");
    }

    if (this.guest === guest) return;
    if (this.guest) await this.unregisterBrowserGuest();
    this.guestSession.setGuest(guest);
    this.captureService.setGuest(guest);
    this.guest = guest;
  };

  public unregisterBrowserGuest: BrowserIPC["unregisterBrowserGuest"] = async () => {
    await this.captureService.clearGuest();
    this.guestSession.clearGuest();
    this.guest = null;
  };

  public startBrowserRecording: BrowserIPC["startBrowserRecording"] = async () => {
    return this.captureService.start();
  };

  public stopBrowserRecording: BrowserIPC["stopBrowserRecording"] = async () => {
    return this.captureService.stop();
  };

  public override updateBrowserWindow = async (browserWindow: BrowserWindow) => {
    await this.unregisterBrowserGuest();
    this.guestSession.updateBrowserWindow(browserWindow);
    this.setBrowserWindow(browserWindow);
  };

  public async destroyAll() {
    await this.captureService.destroy();
    this.guestSession.destroy();
    this.guest = null;
    this.unbind?.();
  }
}
