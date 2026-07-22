import { Buffer } from "node:buffer";

import type { WebContents } from "electron";
import { v4 as uuidv4 } from "uuid";

import type { BrowserRecording, RecordedRequest } from "../../shared/browser-types.js";

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_RECORDING_BYTES = 5 * 1024 * 1024;
const SENSITIVE_KEY_PARTS = ["token", "password", "secret", "cookie", "authorization", "apikey"];

interface CapturedRequest {
  request: RecordedRequest;
  finished: boolean;
  bodyActive: boolean;
}

interface CaptureState {
  recording: BrowserRecording;
  attached: boolean;
  timer: ReturnType<typeof setInterval> | null;
  requests: Map<string, CapturedRequest>;
  requestSequences: Map<string, number>;
  totalReservedBytes: number;
  stopped: boolean;
}

interface CdpMetricsResult {
  metrics?: Array<{ name?: string; value?: number }>;
}

interface CdpBodyResult {
  body?: string;
  base64Encoded?: boolean;
}

export class BrowserCaptureService {
  private guest: WebContents | null = null;
  private active: CaptureState | null = null;
  private readonly onDebuggerMessage = (
    _event: unknown,
    method: string,
    params: Record<string, unknown>,
  ) => this.handleDebuggerMessage(method, params);

  public setGuest(webContents: WebContents) {
    this.guest = webContents;
  }

  public async clearGuest() {
    await this.stopIfActive();
    this.guest = null;
  }

  public async start(): Promise<{ recordingId: string }> {
    if (!this.guest || this.guest.isDestroyed()) throw new Error("Browser guest is not available");
    if (this.active) throw new Error("Browser capture is already active");

    const startedAt = timestamp();
    const state: CaptureState = {
      recording: {
        version: 1,
        id: uuidv4(),
        startedAt,
        endedAt: startedAt,
        url: "",
        operations: [],
        network: [],
        console: [],
        memory: {
          metric: "JSHeapUsedSize",
          samples: [],
          initialBytes: 0,
          finalBytes: 0,
          deltaBytes: 0,
        },
        captureErrors: [],
      },
      attached: false,
      timer: null,
      requests: new Map(),
      requestSequences: new Map(),
      totalReservedBytes: 0,
      stopped: false,
    };
    this.active = state;

    try {
      this.guest.debugger.attach("1.3");
      state.attached = true;
      this.guest.debugger.on("message", this.onDebuggerMessage);
    } catch (error) {
      this.captureError(state, error);
      return { recordingId: state.recording.id };
    }

    await this.safeCommand(state, "Network.enable");
    await this.safeCommand(state, "Runtime.enable");
    await this.safeCommand(state, "Log.enable");
    await this.sampleHeap(state);
    state.timer = setInterval(() => void this.sampleHeap(state), 1_000);
    return { recordingId: state.recording.id };
  }

  public async stop(): Promise<BrowserRecording> {
    const state = this.active;
    if (!state) throw new Error("Browser capture is not active");

    state.stopped = true;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;

    for (const captured of state.requests.values()) {
      if (captured.bodyActive) {
        captured.request.response = { state: "unavailable", reason: "stopped" };
      } else if (!captured.finished) {
        captured.request.response = { state: "pending-at-stop" };
      }
    }

    await this.sampleHeap(state, true);
    if (state.attached && this.guest && !this.guest.isDestroyed()) {
      await this.safeCommand(state, "Log.disable");
      await this.safeCommand(state, "Runtime.disable");
      await this.safeCommand(state, "Network.disable");
      this.guest.debugger.removeListener("message", this.onDebuggerMessage);
      try {
        this.guest.debugger.detach();
      } catch (error) {
        this.captureError(state, error);
      }
    }

    state.recording.endedAt = timestamp();
    state.recording.url = this.guest && !this.guest.isDestroyed() ? this.guest.getURL() : "";
    const recording = structuredClone(state.recording);
    this.active = null;
    state.requests.clear();
    state.requestSequences.clear();
    return recording;
  }

  public async destroy() {
    await this.clearGuest();
  }

  private async stopIfActive() {
    if (this.active) await this.stop();
  }

  private handleDebuggerMessage(method: string, params: Record<string, unknown>) {
    const state = this.active;
    if (!state || state.stopped) return;

    try {
      switch (method) {
        case "Network.requestWillBeSent":
          this.requestWillBeSent(state, params);
          break;
        case "Network.responseReceived":
          this.responseReceived(state, params);
          break;
        case "Network.dataReceived":
          this.dataReceived(state, params);
          break;
        case "Network.loadingFinished":
          this.loadingFinished(state, params);
          break;
        case "Runtime.consoleAPICalled":
          this.consoleCalled(state, params);
          break;
        case "Runtime.exceptionThrown":
          this.exceptionThrown(state, params);
          break;
        case "Log.entryAdded":
          this.logEntryAdded(state, params);
          break;
      }
    } catch (error) {
      this.captureError(state, error);
    }
  }

  private requestWillBeSent(state: CaptureState, params: Record<string, unknown>) {
    const requestId = stringValue(params.requestId);
    if (!requestId) return;
    const previous = state.requests.get(requestId);
    if (previous) {
      const redirectResponse = objectValue(params.redirectResponse);
      previous.finished = true;
      previous.request.status = numberOrNull(redirectResponse.status) ?? previous.request.status;
      previous.request.mimeType =
        nullableString(redirectResponse.mimeType) ?? previous.request.mimeType;
      previous.request.response = {
        state: "skipped",
        reason:
          previous.request.resourceType === "Fetch" || previous.request.resourceType === "XHR"
            ? "not-json"
            : "not-fetch-xhr",
      };
    }
    const sequence = (state.requestSequences.get(requestId) ?? 0) + 1;
    state.requestSequences.set(requestId, sequence);
    const request = objectValue(params.request);
    const record: RecordedRequest = {
      id: sequence === 1 ? requestId : `${requestId}:${sequence}`,
      url: stringValue(request.url),
      method: stringValue(request.method),
      startedAt: timestamp(),
      resourceType: nullableString(params.type),
      status: null,
      mimeType: null,
      encodedBytes: 0,
      response: { state: "unavailable", reason: "stopped" },
    };
    const captured = { request: record, finished: false, bodyActive: false };
    state.requests.set(requestId, captured);
    state.recording.network.push(record);
  }

  private responseReceived(state: CaptureState, params: Record<string, unknown>) {
    const captured = state.requests.get(stringValue(params.requestId));
    if (!captured) return;
    const response = objectValue(params.response);
    captured.request.status = numberOrNull(response.status);
    captured.request.mimeType = nullableString(response.mimeType);
    captured.request.resourceType ??= nullableString(params.type);
  }

  private dataReceived(state: CaptureState, params: Record<string, unknown>) {
    const captured = state.requests.get(stringValue(params.requestId));
    if (!captured) return;
    const bytes = numberOrNull(params.encodedDataLength);
    if (bytes !== null && bytes > 0) captured.request.encodedBytes += bytes;
  }

  private loadingFinished(state: CaptureState, params: Record<string, unknown>) {
    const captured = state.requests.get(stringValue(params.requestId));
    if (!captured) return;
    captured.finished = true;
    const { request } = captured;
    if (request.resourceType !== "Fetch" && request.resourceType !== "XHR") {
      request.response = { state: "skipped", reason: "not-fetch-xhr" };
      return;
    }
    if (!isJsonMimeType(request.mimeType)) {
      request.response = { state: "skipped", reason: "not-json" };
      return;
    }
    if (
      request.encodedBytes > MAX_RESPONSE_BYTES ||
      state.totalReservedBytes + request.encodedBytes > MAX_RECORDING_BYTES
    ) {
      request.response = { state: "skipped", reason: "resource-limit" };
      return;
    }
    state.totalReservedBytes += request.encodedBytes;
    captured.bodyActive = true;
    void this.captureBody(state, captured, stringValue(params.requestId));
  }

  private async captureBody(state: CaptureState, captured: CapturedRequest, requestId: string) {
    try {
      const result = (await this.command(state, "Network.getResponseBody", {
        requestId,
      })) as CdpBodyResult | null;
      if (!result || state.stopped || this.active !== state) return;
      const content = result.base64Encoded
        ? Buffer.from(result.body ?? "", "base64").toString("utf8")
        : (result.body ?? "");
      try {
        captured.request.response = { state: "captured", body: redactJson(JSON.parse(content)) };
      } catch (error) {
        captured.request.response = { state: "unavailable", reason: "invalid-json" };
        this.captureError(state, error);
      }
    } catch (error) {
      if (!state.stopped && this.active === state) {
        captured.request.response = { state: "unavailable", reason: "body-read-failed" };
        this.captureError(state, error);
      }
    } finally {
      captured.bodyActive = false;
    }
  }

  private consoleCalled(state: CaptureState, params: Record<string, unknown>) {
    const level = params.type === "warning" || params.type === "error" ? params.type : null;
    if (!level) return;
    const args = Array.isArray(params.args) ? params.args : [];
    state.recording.console.push({ at: timestamp(), level, message: consoleMessage(args[0]) });
  }

  private exceptionThrown(state: CaptureState, params: Record<string, unknown>) {
    const details = objectValue(params.exceptionDetails);
    const exception = objectValue(details.exception);
    state.recording.console.push({
      at: timestamp(),
      level: "exception",
      message: stringValue(exception.description) || stringValue(details.text),
    });
  }

  private logEntryAdded(state: CaptureState, params: Record<string, unknown>) {
    const entry = objectValue(params.entry);
    const level = entry.level === "warning" || entry.level === "error" ? entry.level : null;
    if (!level) return;
    state.recording.console.push({ at: timestamp(), level, message: stringValue(entry.text) });
  }

  private async sampleHeap(state: CaptureState, final = false) {
    if (!state.attached || (state.stopped && !final)) return;
    try {
      const result = (await this.command(
        state,
        "Performance.getMetrics",
      )) as CdpMetricsResult | null;
      if (!result) return;
      const usedBytes = result.metrics?.find(({ name }) => name === "JSHeapUsedSize")?.value;
      if (typeof usedBytes !== "number") return;
      const totalBytes = result.metrics?.find(({ name }) => name === "JSTotalHeapSize")?.value;
      const sample =
        typeof totalBytes === "number"
          ? { at: timestamp(), usedBytes, totalBytes }
          : { at: timestamp(), usedBytes };
      state.recording.memory.samples.push(sample);
      if (state.recording.memory.samples.length === 1)
        state.recording.memory.initialBytes = usedBytes;
      state.recording.memory.finalBytes = usedBytes;
      state.recording.memory.deltaBytes =
        state.recording.memory.finalBytes - state.recording.memory.initialBytes;
    } catch (error) {
      this.captureError(state, error);
    }
  }

  private async command(state: CaptureState, method: string, params?: Record<string, unknown>) {
    if (!this.guest || this.guest.isDestroyed()) return null;
    return this.guest.debugger.sendCommand(method, params);
  }

  private async safeCommand(state: CaptureState, method: string, params?: Record<string, unknown>) {
    try {
      return await this.command(state, method, params);
    } catch (error) {
      this.captureError(state, error);
      return null;
    }
  }

  private captureError(state: CaptureState, error: unknown) {
    state.recording.captureErrors.push({
      source: "cdp",
      message: errorMessage(error),
      at: timestamp(),
    });
  }
}

function timestamp() {
  return new Date().toISOString();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function isJsonMimeType(mimeType: string | null) {
  const mime = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  return mime === "application/json" || Boolean(mime?.endsWith("+json"));
}

function consoleMessage(value: unknown) {
  const argument = objectValue(value);
  const message = argument.value ?? argument.description ?? argument.unserializableValue;
  return typeof message === "string" ? message : JSON.stringify(message ?? "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEY_PARTS.some((part) => key.toLowerCase().includes(part))
        ? "[REDACTED]"
        : redactJson(nested),
    ]),
  );
}
