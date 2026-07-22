import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

type CommandHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

class FakeDebugger extends EventEmitter {
  public readonly attachedProtocols: string[] = [];
  public readonly commands: Array<{ method: string; params?: Record<string, unknown> }> = [];
  public detached = false;
  public readonly handlers = new Map<string, CommandHandler>();

  public attach(protocol: string) {
    this.attachedProtocols.push(protocol);
  }

  public async sendCommand(method: string, params?: Record<string, unknown>) {
    this.commands.push({ method, params });
    return this.handlers.get(method)?.(params ?? {}) ?? {};
  }

  public detach() {
    this.detached = true;
  }

  public emitMessage(method: string, params: Record<string, unknown>) {
    this.emit("message", {}, method, params);
  }
}

function createGuest(
  debuggerInstance = new FakeDebugger(),
  isDestroyed: () => boolean = () => false,
) {
  return {
    debugger: debuggerInstance,
    getURL: () => "https://example.test/current",
    isDestroyed,
  } as never;
}

async function createService(debuggerInstance = new FakeDebugger()) {
  const { BrowserCaptureService } = await import("./browser-capture-service.js");
  const service = new BrowserCaptureService();
  service.setGuest(createGuest(debuggerInstance));
  return { service, debuggerInstance };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function response(
  debuggerInstance: FakeDebugger,
  requestId: string,
  options: {
    type?: string;
    mimeType?: string;
    status?: number;
    bytes?: number;
    finalBytes?: number;
  } = {},
) {
  debuggerInstance.emitMessage("Network.requestWillBeSent", {
    requestId,
    type: options.type ?? "Fetch",
    request: { url: `https://api.example.test/${requestId}`, method: "GET" },
  });
  debuggerInstance.emitMessage("Network.responseReceived", {
    requestId,
    type: options.type ?? "Fetch",
    response: { status: options.status ?? 200, mimeType: options.mimeType ?? "application/json" },
  });
  if (options.bytes) {
    debuggerInstance.emitMessage("Network.dataReceived", {
      requestId,
      encodedDataLength: options.bytes,
    });
  }
  debuggerInstance.emitMessage("Network.loadingFinished", {
    requestId,
    ...(options.finalBytes === undefined ? {} : { encodedDataLength: options.finalBytes }),
  });
}

describe("BrowserCaptureService", () => {
  afterEach(() => vi.useRealTimers());

  it("captures Fetch JSON with recursively redacted sensitive values", async () => {
    const { service, debuggerInstance } = await createService();
    debuggerInstance.handlers.set("Network.getResponseBody", () => ({
      body: JSON.stringify({ token: "top-secret", nested: { apiKey: "private", ok: true } }),
      base64Encoded: false,
    }));

    await service.start();
    response(debuggerInstance, "request-1", { bytes: 80 });
    await settle();

    const recording = await service.stop();
    expect(recording.network).toMatchObject([
      {
        id: "request-1",
        response: {
          state: "captured",
          body: { token: "[REDACTED]", nested: { apiKey: "[REDACTED]", ok: true } },
        },
      },
    ]);
  });

  it("keeps metadata but skips bodies for non-JSON and non-Fetch requests", async () => {
    const { service, debuggerInstance } = await createService();
    await service.start();
    response(debuggerInstance, "html", { mimeType: "text/html" });
    response(debuggerInstance, "image", { type: "Image" });
    await settle();

    const recording = await service.stop();
    expect(recording.network).toMatchObject([
      { id: "html", mimeType: "text/html", response: { state: "skipped", reason: "not-json" } },
      {
        id: "image",
        resourceType: "Image",
        response: { state: "skipped", reason: "not-fetch-xhr" },
      },
    ]);
    expect(
      debuggerInstance.commands.filter(({ method }) => method === "Network.getResponseBody"),
    ).toEqual([]);
  });

  it("enforces one-response and total body byte limits before reading bodies", async () => {
    const { service, debuggerInstance } = await createService();
    debuggerInstance.handlers.set("Network.getResponseBody", () => ({
      body: '{"ok":true}',
      base64Encoded: false,
    }));
    await service.start();
    response(debuggerInstance, "too-large", { bytes: 256 * 1024 + 1 });
    for (let index = 0; index < 21; index += 1)
      response(debuggerInstance, `aggregate-${index}`, { bytes: 256 * 1024 });
    await settle();

    const recording = await service.stop();
    expect(recording.network.find(({ id }) => id === "too-large")?.response).toEqual({
      state: "skipped",
      reason: "resource-limit",
    });
    expect(recording.network.find(({ id }) => id === "aggregate-20")?.response).toEqual({
      state: "skipped",
      reason: "resource-limit",
    });
    expect(
      debuggerInstance.commands.filter(({ method }) => method === "Network.getResponseBody"),
    ).toHaveLength(20);
  });

  it("enforces body limits from loadingFinished bytes when data events are absent", async () => {
    const { service, debuggerInstance } = await createService();
    debuggerInstance.handlers.set("Network.getResponseBody", () => ({
      body: '{"ok":true}',
      base64Encoded: false,
    }));
    await service.start();
    response(debuggerInstance, "too-large-final", { finalBytes: 256 * 1024 + 1 });
    for (let index = 0; index < 21; index += 1)
      response(debuggerInstance, `aggregate-final-${index}`, { finalBytes: 256 * 1024 });
    await settle();

    const recording = await service.stop();
    expect(recording.network.find(({ id }) => id === "too-large-final")?.response).toEqual({
      state: "skipped",
      reason: "resource-limit",
    });
    expect(recording.network.find(({ id }) => id === "aggregate-final-20")?.response).toEqual({
      state: "skipped",
      reason: "resource-limit",
    });
    expect(
      debuggerInstance.commands.filter(({ method }) => method === "Network.getResponseBody"),
    ).toHaveLength(20);
  });

  it("marks unfinished requests as pending when capture stops", async () => {
    const { service, debuggerInstance } = await createService();
    await service.start();
    debuggerInstance.emitMessage("Network.requestWillBeSent", {
      requestId: "pending",
      type: "Fetch",
      request: { url: "https://api.example.test/pending", method: "GET" },
    });

    const recording = await service.stop();
    expect(recording.network).toMatchObject([
      { id: "pending", response: { state: "pending-at-stop" } },
    ]);
  });

  it("removes the debugger listener and detaches when the active guest is destroyed", async () => {
    const debuggerInstance = new FakeDebugger();
    let destroyed = false;
    const { BrowserCaptureService } = await import("./browser-capture-service.js");
    const service = new BrowserCaptureService();
    service.setGuest(createGuest(debuggerInstance, () => destroyed));
    await service.start();
    destroyed = true;

    await service.stop();

    expect(debuggerInstance.listenerCount("message")).toBe(0);
    expect(debuggerInstance.detached).toBe(true);
    expect(debuggerInstance.commands.map(({ method }) => method)).not.toContain("Network.disable");
  });

  it("records console, exception, and heap samples", async () => {
    vi.useFakeTimers();
    const { service, debuggerInstance } = await createService();
    let heap = 100;
    debuggerInstance.handlers.set("Performance.getMetrics", () => ({
      metrics: [
        { name: "JSHeapUsedSize", value: heap++ },
        { name: "JSTotalHeapSize", value: 1000 },
      ],
    }));
    await service.start();
    debuggerInstance.emitMessage("Runtime.consoleAPICalled", {
      type: "warning",
      args: [{ value: "watch out" }],
    });
    debuggerInstance.emitMessage("Runtime.exceptionThrown", {
      exceptionDetails: { text: "Unhandled", exception: { description: "boom" } },
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const recording = await service.stop();
    expect(recording.console).toMatchObject([
      { level: "warning", message: "watch out" },
      { level: "exception", message: "boom" },
    ]);
    expect(recording.memory).toMatchObject({ initialBytes: 100, finalBytes: 102, deltaBytes: 2 });
    expect(recording.memory.samples).toHaveLength(3);
  });

  it("rejects repeated starts without attaching a second debugger", async () => {
    const { service, debuggerInstance } = await createService();
    await service.start();

    await expect(service.start()).rejects.toThrow("already active");
    expect(debuggerInstance.attachedProtocols).toEqual(["1.3"]);
    await service.stop();
  });

  it("rejects guest replacement until the active capture has stopped", async () => {
    const { service, debuggerInstance } = await createService();
    const replacementDebugger = new FakeDebugger();
    await service.start();

    expect(() => service.setGuest(createGuest(replacementDebugger))).toThrow(
      "Cannot replace the browser guest while capture is active",
    );

    await service.stop();
    service.setGuest(createGuest(replacementDebugger));
    await service.start();
    expect(debuggerInstance.detached).toBe(true);
    expect(replacementDebugger.attachedProtocols).toEqual(["1.3"]);
    await service.stop();
  });

  it("returns valid recordings when debugger or response body operations fail", async () => {
    const attachFailure = new FakeDebugger();
    attachFailure.attach = () => {
      throw new Error("debugger unavailable");
    };
    const { service: unavailableService } = await createService(attachFailure);
    await unavailableService.start();
    const unavailableRecording = await unavailableService.stop();
    expect(unavailableRecording).toMatchObject({
      network: [],
      captureErrors: [{ source: "cdp", message: "debugger unavailable" }],
    });

    const { service, debuggerInstance } = await createService();
    debuggerInstance.handlers.set("Network.getResponseBody", () => {
      throw new Error("body unavailable");
    });
    await service.start();
    response(debuggerInstance, "body-error", { bytes: 30 });
    await settle();
    const recording = await service.stop();
    expect(recording.network).toMatchObject([
      { id: "body-error", response: { state: "unavailable", reason: "body-read-failed" } },
    ]);
    expect(recording.captureErrors).toMatchObject([{ source: "cdp", message: "body unavailable" }]);
  });
});
