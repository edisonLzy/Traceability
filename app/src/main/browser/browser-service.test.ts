import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function createGuest(hostWebContents: unknown, type = "webview") {
  return {
    isDestroyed: () => false,
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

  it("tears down capture when unregistering or destroying a guest", async () => {
    electron.webContents.fromId.mockReturnValue(createGuest(browserWindow.webContents));
    await service.registerBrowserGuest({ webContentsId: 11 });

    await service.unregisterBrowserGuest();
    expect(capture.instances[0]?.clearGuest).toHaveBeenCalledTimes(1);

    await service.destroyAll();
    expect(capture.instances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("accepts a hosted webview after the BrowserWindow is recreated", async () => {
    const recreatedWindow = createFakeBrowserWindow();
    service.updateBrowserWindow(recreatedWindow as never);
    const guest = createGuest(recreatedWindow.webContents);
    electron.webContents.fromId.mockReturnValue(guest);

    await service.registerBrowserGuest({ webContentsId: 13 });

    expect(capture.instances[0]?.setGuest).toHaveBeenCalledWith(guest);
  });
});
