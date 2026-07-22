import type {
  BrowserElementSummary,
  BrowserGuestMessage,
  BrowserInputLength,
  RecordedOperation,
} from "@shared/browser-types";

const BROWSER_GUEST_PARTITION = "traceability-explorer";
const BROWSER_INITIAL_URL = "https://localhost/";
const BROWSER_WEB_PREFERENCES =
  "contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes";
const BROWSER_COMMAND_CHANNEL = "traceability:browser-command";
const BROWSER_GUEST_CHANNEL = "traceability:browser-guest";

export type BrowserGuestCommand =
  | { type: "set-recording"; enabled: boolean }
  | { type: "select-element" };

export interface BrowserWebviewElement extends EventTarget {
  setAttribute(name: string, value: string): void;
  getWebContentsId?(): number;
  loadURL?(url: string): void;
  canGoBack?(): boolean;
  canGoForward?(): boolean;
  goBack?(): void;
  goForward?(): void;
  reload?(): void;
  send?(channel: string, ...args: unknown[]): void;
  remove?(): void;
}

export interface BrowserWebviewHost {
  appendChild(node: BrowserWebviewElement): unknown;
}

export interface BrowserWebviewDocument {
  createElement(name: "webview"): BrowserWebviewElement;
}

export interface BrowserWebviewCallbacks {
  onDomReady?(webContentsId: number): void;
  onLoadingChange?(isLoading: boolean): void;
  onTitleChange?(title: string): void;
  onNavigate?(url: string): void;
  onGuestMessage?(message: BrowserGuestMessage): void;
}

interface WebviewEvent extends Event {
  args?: unknown[];
  channel?: string;
  title?: string;
  url?: string;
}

export class BrowserWebviewController {
  public readonly webview: BrowserWebviewElement;
  private disposed = false;
  private readonly listeners: Array<[string, EventListener]>;

  public constructor(
    host: BrowserWebviewHost,
    private readonly callbacks: BrowserWebviewCallbacks = {},
    documentRef: BrowserWebviewDocument = document as unknown as BrowserWebviewDocument,
  ) {
    this.webview = documentRef.createElement("webview");
    this.webview.setAttribute("partition", BROWSER_GUEST_PARTITION);
    this.webview.setAttribute("src", BROWSER_INITIAL_URL);
    this.webview.setAttribute("webpreferences", BROWSER_WEB_PREFERENCES);
    this.listeners = [
      ["dom-ready", this.onDomReady],
      ["did-start-loading", this.onStartLoading],
      ["did-stop-loading", this.onStopLoading],
      ["page-title-updated", this.onTitleUpdated],
      ["did-navigate", this.onNavigate],
      ["did-navigate-in-page", this.onNavigate],
      ["ipc-message", this.onIpcMessage],
    ];

    for (const [event, listener] of this.listeners) this.webview.addEventListener(event, listener);
    host.appendChild(this.webview);
  }

  public navigate(url: string) {
    if (this.disposed) return;
    this.webview.loadURL?.(url);
  }

  public canGoBack(): boolean {
    return !this.disposed && (this.webview.canGoBack?.() ?? false);
  }

  public canGoForward(): boolean {
    return !this.disposed && (this.webview.canGoForward?.() ?? false);
  }

  public goBack() {
    if (this.canGoBack()) this.webview.goBack?.();
  }

  public goForward() {
    if (this.canGoForward()) this.webview.goForward?.();
  }

  public reload() {
    if (!this.disposed) this.webview.reload?.();
  }

  public send(command: BrowserGuestCommand) {
    if (!this.disposed) this.webview.send?.(BROWSER_COMMAND_CHANNEL, command);
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [event, listener] of this.listeners)
      this.webview.removeEventListener(event, listener);
    this.webview.remove?.();
  }

  private readonly onDomReady = () => {
    const webContentsId = this.webview.getWebContentsId?.();
    if (typeof webContentsId === "number") this.callbacks.onDomReady?.(webContentsId);
  };

  private readonly onStartLoading = () => this.callbacks.onLoadingChange?.(true);

  private readonly onStopLoading = () => this.callbacks.onLoadingChange?.(false);

  private readonly onTitleUpdated = (event: Event) => {
    const title = (event as WebviewEvent).title;
    if (typeof title === "string") this.callbacks.onTitleChange?.(title);
  };

  private readonly onNavigate = (event: Event) => {
    const url = (event as WebviewEvent).url;
    if (typeof url === "string") this.callbacks.onNavigate?.(url);
  };

  private readonly onIpcMessage = (event: Event) => {
    const { args, channel } = event as WebviewEvent;
    const message = args?.[0];
    const parsedMessage =
      channel === BROWSER_GUEST_CHANNEL ? parseBrowserGuestMessage(message) : null;
    if (parsedMessage) {
      this.callbacks.onGuestMessage?.(parsedMessage);
    }
  };
}

function parseBrowserGuestMessage(value: unknown): BrowserGuestMessage | null {
  const message = record(value);
  if (!message) return null;

  if (message.type === "element-selected") {
    const element = parseElementSummary(message.element);
    const url = boundedString(message.url, 2048);
    return element && url ? { type: "element-selected", element, url } : null;
  }

  if (message.type === "operation") {
    const operation = parseRecordedOperation(message.operation);
    return operation ? { type: "operation", operation } : null;
  }

  return null;
}

function parseRecordedOperation(value: unknown): RecordedOperation | null {
  const operation = record(value);
  const id = operation ? boundedString(operation.id, 128) : null;
  const at = operation ? boundedString(operation.at, 64) : null;
  const target = operation ? parseElementSummary(operation.target) : null;
  if (!operation || !id || !at || !target) return null;

  if (operation.type === "click" || operation.type === "submit") {
    return { id, at, type: operation.type, target };
  }

  if (operation.type !== "input") return null;
  const input = record(operation.input);
  const fieldType = input ? boundedString(input.fieldType, 32) : null;
  const length = input?.length;
  if (!fieldType || typeof input?.isSensitive !== "boolean" || !isBrowserInputLength(length))
    return null;

  return {
    id,
    at,
    type: "input",
    target,
    input: { fieldType, isSensitive: input.isSensitive, length },
  };
}

function parseElementSummary(value: unknown): BrowserElementSummary | null {
  const element = record(value);
  const tagName = element ? boundedString(element.tagName, 32) : null;
  const role = element ? nullableBoundedString(element.role, 120) : undefined;
  const name = element ? nullableBoundedString(element.name, 120) : undefined;
  const selector = element ? nullableBoundedString(element.selector, 240) : undefined;
  const text = element ? nullableBoundedString(element.text, 160) : undefined;
  if (
    !tagName ||
    role === undefined ||
    name === undefined ||
    selector === undefined ||
    text === undefined
  )
    return null;

  return { tagName, role, name, selector, text };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function nullableBoundedString(value: unknown, maxLength: number): string | null | undefined {
  return value === null ? null : boundedString(value, maxLength);
}

function isBrowserInputLength(value: unknown): value is BrowserInputLength {
  return (
    value === "empty" ||
    value === "1-8" ||
    value === "9-32" ||
    value === "33-128" ||
    value === "129+"
  );
}
