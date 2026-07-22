import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveBrowserGuestPreload } from "./browser-guest-session.js";

const electron = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  session: { fromPartition: vi.fn() },
  webContents: { fromId: vi.fn() },
}));

const capture = vi.hoisted(() => ({
  instances: [] as Array<{
    setGuest: ReturnType<typeof vi.fn>;
    clearGuest: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("electron", () => electron);

vi.mock("./browser-capture-service.js", () => ({
  BrowserCaptureService: class {
    setGuest = vi.fn();
    clearGuest = vi.fn().mockResolvedValue(undefined);
    start = vi.fn().mockResolvedValue({ recordingId: "recording-1" });
    stop = vi.fn().mockResolvedValue({ id: "recording-1" });
    destroy = vi.fn().mockResolvedValue(undefined);

    constructor() {
      capture.instances.push(this);
    }
  },
}));

const { BrowserService } = await import("./browser-service.js");

function createFakeSession() {
  return {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

function createFakeBrowserWindow() {
  const hostWebContents = {
    isDestroyed: () => false,
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  return { isDestroyed: () => false, webContents: hostWebContents };
}

function createGuest(hostWebContents: unknown, type = "webview", destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    getType: () => type,
    hostWebContents,
    on: vi.fn(),
    removeListener: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(),
  };
}

describe("BrowserService", () => {
  let fakeSession: ReturnType<typeof createFakeSession>;
  let browserWindow: ReturnType<typeof createFakeBrowserWindow>;
  let service: InstanceType<typeof BrowserService>;

  beforeEach(() => {
    vi.clearAllMocks();
    capture.instances.length = 0;
    fakeSession = createFakeSession();
    electron.session.fromPartition.mockReturnValue(fakeSession);
    browserWindow = createFakeBrowserWindow();
    service = new BrowserService(browserWindow as never);
  });

  afterEach(async () => {
    await service.destroyAll();
  });

  it("self-registers exactly the four Browser IPC handlers", () => {
    expect(electron.ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      "registerBrowserGuest",
      "unregisterBrowserGuest",
      "startBrowserRecording",
      "stopBrowserRecording",
    ]);
  });

  it("registers a live webview hosted by the current BrowserWindow", async () => {
    const guest = createGuest(browserWindow.webContents);
    electron.webContents.fromId.mockReturnValue(guest);

    const register = electron.ipcMain.handle.mock.calls.find(
      ([channel]) => channel === "registerBrowserGuest",
    )?.[1];
    await register({}, { webContentsId: 42 });

    expect(capture.instances[0]?.setGuest).toHaveBeenCalledWith(guest);
    expect(guest.on).toHaveBeenCalledWith("will-navigate", expect.any(Function));
  });

  it("forces every allowed attachment into the protected guest session", () => {
    const attachWebview = browserWindow.webContents.on.mock.calls.find(
      ([event]) => event === "will-attach-webview",
    )?.[1];
    const event = { preventDefault: vi.fn() };
    const preferences = {
      partition: "persist:untrusted",
      session: {},
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
    };

    attachWebview(event, preferences, { src: "https://example.com" });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(preferences).toMatchObject({
      preload: resolveBrowserGuestPreload(__dirname),
      partition: "traceability-explorer",
      session: fakeSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  });

  it("resolves the guest preload beside the bundled main directory", () => {
    expect(resolveBrowserGuestPreload("/workspace/app/out/main")).toBe(
      "/workspace/app/out/preload/browser-guest.cjs",
    );
  });

  it("denies permissions, downloads, and disallowed webview sources", () => {
    const permissionRequest = fakeSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    const permissionCheck = fakeSession.setPermissionCheckHandler.mock.calls[0]?.[0];
    const willDownload = fakeSession.on.mock.calls.find(
      ([event]) => event === "will-download",
    )?.[1];
    const attachWebview = browserWindow.webContents.on.mock.calls.find(
      ([event]) => event === "will-attach-webview",
    )?.[1];
    const permissionCallback = vi.fn();
    const downloadEvent = { preventDefault: vi.fn() };
    const attachEvent = { preventDefault: vi.fn() };

    permissionRequest({}, "camera", permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
    expect(permissionCheck({}, "camera", "https://example.com")).toBe(false);
    willDownload(downloadEvent);
    expect(downloadEvent.preventDefault).toHaveBeenCalledOnce();
    attachWebview(attachEvent, {}, { src: "file:///etc/passwd" });
    expect(attachEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("rejects a non-webview guest", async () => {
    electron.webContents.fromId.mockReturnValue(createGuest(browserWindow.webContents, "window"));

    await expect(service.registerBrowserGuest({ webContentsId: 7 })).rejects.toThrow(
      "Browser guest must be a live webview hosted by the current window",
    );
    expect(capture.instances[0]?.setGuest).not.toHaveBeenCalled();
  });

  it("rejects a webview hosted by another BrowserWindow", async () => {
    electron.webContents.fromId.mockReturnValue(createGuest({}));

    await expect(service.registerBrowserGuest({ webContentsId: 8 })).rejects.toThrow(
      "Browser guest must be a live webview hosted by the current window",
    );
    expect(capture.instances[0]?.setGuest).not.toHaveBeenCalled();
  });

  it("rejects a destroyed webview", async () => {
    electron.webContents.fromId.mockReturnValue(
      createGuest(browserWindow.webContents, "webview", true),
    );

    await expect(service.registerBrowserGuest({ webContentsId: 9 })).rejects.toThrow(
      "Browser guest must be a live webview hosted by the current window",
    );
    expect(capture.instances[0]?.setGuest).not.toHaveBeenCalled();
  });

  it("rejects a disallowed server redirect after a safe popup is loaded in the guest", async () => {
    const guest = createGuest(browserWindow.webContents);
    electron.webContents.fromId.mockReturnValue(guest);
    await service.registerBrowserGuest({ webContentsId: 10 });
    const popupHandler = guest.setWindowOpenHandler.mock.calls[0]?.[0];
    const redirectHandler = guest.on.mock.calls.find(([event]) => event === "will-redirect")?.[1];
    const redirectEvent = { preventDefault: vi.fn() };

    expect(popupHandler({ url: "https://example.com/new-window" })).toEqual({ action: "deny" });
    expect(guest.loadURL).toHaveBeenCalledWith("https://example.com/new-window");
    expect(redirectHandler).toEqual(expect.any(Function));
    redirectHandler(redirectEvent, "file:///etc/passwd");

    expect(redirectEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("prevents direct navigation to a forbidden URL", async () => {
    const guest = createGuest(browserWindow.webContents);
    electron.webContents.fromId.mockReturnValue(guest);
    await service.registerBrowserGuest({ webContentsId: 14 });
    const navigateHandler = guest.on.mock.calls.find(([event]) => event === "will-navigate")?.[1];
    const navigateEvent = { preventDefault: vi.fn() };

    expect(navigateHandler).toEqual(expect.any(Function));
    navigateHandler(navigateEvent, "file:///etc/passwd");

    expect(navigateEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("forwards start and stop handlers to the capture service", async () => {
    const start = electron.ipcMain.handle.mock.calls.find(
      ([channel]) => channel === "startBrowserRecording",
    )?.[1];
    const stop = electron.ipcMain.handle.mock.calls.find(
      ([channel]) => channel === "stopBrowserRecording",
    )?.[1];

    await expect(start({})).resolves.toEqual({ recordingId: "recording-1" });
    await expect(stop({})).resolves.toEqual({ id: "recording-1" });
    expect(capture.instances[0]?.start).toHaveBeenCalledOnce();
    expect(capture.instances[0]?.stop).toHaveBeenCalledOnce();
  });

  it("tears down capture when unregistering or destroying a guest", async () => {
    electron.webContents.fromId.mockReturnValue(createGuest(browserWindow.webContents));
    await service.registerBrowserGuest({ webContentsId: 11 });

    await service.unregisterBrowserGuest();
    expect(capture.instances[0]?.clearGuest).toHaveBeenCalledTimes(1);

    await service.destroyAll();
    expect(capture.instances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("releases the active capture before accepting a guest from a recreated BrowserWindow", async () => {
    electron.webContents.fromId.mockReturnValue(createGuest(browserWindow.webContents));
    await service.registerBrowserGuest({ webContentsId: 12 });
    const recreatedWindow = createFakeBrowserWindow();
    await service.updateBrowserWindow(recreatedWindow as never);
    expect(capture.instances[0]?.clearGuest).toHaveBeenCalledOnce();
    const guest = createGuest(recreatedWindow.webContents);
    electron.webContents.fromId.mockReturnValue(guest);

    await service.registerBrowserGuest({ webContentsId: 13 });

    expect(capture.instances[0]?.setGuest).toHaveBeenCalledWith(guest);
  });

  it("cleans active capture before changing guest-session or base-window ownership", async () => {
    const captureService = capture.instances[0]!;
    const internals = service as unknown as {
      guestSession: { updateBrowserWindow(browserWindow: unknown): void };
      setBrowserWindow(browserWindow: unknown): void;
    };
    const calls: string[] = [];
    let resolveClearGuest: () => void;
    captureService.clearGuest.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClearGuest = () => {
            calls.push("clearGuest");
            resolve();
          };
        }),
    );
    const updateGuestSession = vi
      .spyOn(internals.guestSession, "updateBrowserWindow")
      .mockImplementation((_window) => {
        calls.push("updateGuestSession");
        return undefined;
      });
    const setBrowserWindow = vi
      .spyOn(internals, "setBrowserWindow")
      .mockImplementation((_window) => {
        calls.push("setBrowserWindow");
        return undefined;
      });

    const update = service.updateBrowserWindow(createFakeBrowserWindow() as never);

    expect(captureService.clearGuest).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);

    resolveClearGuest!();
    await update;

    expect(calls).toEqual(["clearGuest", "updateGuestSession", "setBrowserWindow"]);
    updateGuestSession.mockRestore();
    setBrowserWindow.mockRestore();
  });
});
