import { join } from "node:path";

import { session } from "electron";
import type { BrowserWindow, Session, WebContents } from "electron";

const BROWSER_GUEST_PARTITION = "traceability-explorer";

type MutableWebPreferences = Record<string, unknown>;

export class BrowserGuestSession {
  private readonly session: Session;
  private hostWebContents: WebContents | null = null;
  private guest: WebContents | null = null;
  private readonly protectedGuests = new Set<WebContents>();

  private readonly onWillDownload = (...args: unknown[]) => {
    const event = args[0] as { preventDefault(): void } | undefined;
    event?.preventDefault();
  };

  private readonly onWillAttachWebview = (...args: unknown[]) => {
    const event = args[0] as { preventDefault(): void } | undefined;
    const webPreferences = args[1] as MutableWebPreferences | undefined;
    const params = args[2] as { src?: unknown } | undefined;

    if (!webPreferences || !isAllowedBrowserUrl(String(params?.src ?? ""))) {
      event?.preventDefault();
      return;
    }

    Object.assign(webPreferences, {
      preload: join(__dirname, "../../preload/browser-guest.cjs"),
      partition: BROWSER_GUEST_PARTITION,
      session: this.session,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  };

  private readonly onWillNavigate = (...args: unknown[]) => {
    const event = args[0] as { preventDefault(): void } | undefined;
    const url = typeof args[1] === "string" ? args[1] : (args[0] as { url?: unknown })?.url;
    if (!isAllowedBrowserUrl(String(url))) event?.preventDefault();
  };

  private readonly onWillRedirect = (...args: unknown[]) => {
    const event = args[0] as { preventDefault(): void } | undefined;
    const url = typeof args[1] === "string" ? args[1] : (args[0] as { url?: unknown })?.url;
    if (!isAllowedBrowserUrl(String(url))) event?.preventDefault();
  };

  private readonly onDidAttachWebview = (...args: unknown[]) => {
    const guest = args[1] as WebContents | undefined;
    if (guest && !guest.isDestroyed()) this.hardenGuest(guest);
  };

  constructor(browserWindow: BrowserWindow) {
    this.session = session.fromPartition(BROWSER_GUEST_PARTITION);
    this.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    this.session.setPermissionCheckHandler(() => false);
    this.session.on("will-download", this.onWillDownload as never);
    this.updateBrowserWindow(browserWindow);
  }

  public updateBrowserWindow(browserWindow: BrowserWindow) {
    this.hostWebContents?.removeListener("will-attach-webview", this.onWillAttachWebview as never);
    this.hostWebContents?.removeListener("did-attach-webview", this.onDidAttachWebview as never);
    this.clearGuest();
    this.releaseGuestPolicies();
    this.hostWebContents = browserWindow.webContents;
    this.hostWebContents.on("will-attach-webview", this.onWillAttachWebview as never);
    this.hostWebContents.on("did-attach-webview", this.onDidAttachWebview as never);
  }

  public setGuest(webContents: WebContents) {
    if (this.guest === webContents) return;
    this.clearGuest();
    this.guest = webContents;
    this.hardenGuest(webContents);
  }

  private hardenGuest(webContents: WebContents) {
    if (this.protectedGuests.has(webContents)) return;
    this.protectedGuests.add(webContents);
    webContents.on("will-navigate", this.onWillNavigate as never);
    webContents.on("will-redirect", this.onWillRedirect as never);
    webContents.setWindowOpenHandler((details) => {
      if (isAllowedBrowserUrl(details.url) && !webContents.isDestroyed()) {
        void Promise.resolve(webContents.loadURL(details.url)).catch(() => undefined);
      }
      return { action: "deny" };
    });
  }

  public clearGuest() {
    this.guest = null;
  }

  public destroy() {
    this.clearGuest();
    this.session.removeListener("will-download", this.onWillDownload as never);
    this.hostWebContents?.removeListener("will-attach-webview", this.onWillAttachWebview as never);
    this.hostWebContents?.removeListener("did-attach-webview", this.onDidAttachWebview as never);
    this.hostWebContents = null;
    this.releaseGuestPolicies();
  }

  private releaseGuestPolicies() {
    for (const guest of this.protectedGuests) {
      if (!guest.isDestroyed()) guest.removeListener("will-navigate", this.onWillNavigate as never);
      if (!guest.isDestroyed()) guest.removeListener("will-redirect", this.onWillRedirect as never);
    }
    this.protectedGuests.clear();
  }
}

function isAllowedBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
