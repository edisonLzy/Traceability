import { describe, expect, it, vi } from "vitest";

import {
  BrowserWebviewController,
  type BrowserWebviewCallbacks,
  type BrowserWebviewElement,
} from "./browser-webview";

class FakeWebview extends EventTarget implements BrowserWebviewElement {
  public readonly attributes = new Map<string, string>();
  public readonly sent: Array<{ channel: string; args: unknown[] }> = [];
  public readonly loadedUrls: string[] = [];
  public backCalls = 0;
  public forwardCalls = 0;
  public reloadCalls = 0;
  public removed = false;
  public canGoBackResult = true;
  public canGoForwardResult = true;

  public setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  public getWebContentsId() {
    return 42;
  }

  public loadURL(url: string) {
    this.loadedUrls.push(url);
  }

  public canGoBack() {
    return this.canGoBackResult;
  }

  public canGoForward() {
    return this.canGoForwardResult;
  }

  public goBack() {
    this.backCalls += 1;
  }

  public goForward() {
    this.forwardCalls += 1;
  }

  public reload() {
    this.reloadCalls += 1;
  }

  public send(channel: string, ...args: unknown[]) {
    this.sent.push({ channel, args });
  }

  public remove() {
    this.removed = true;
  }
}

class FakeDocument {
  public readonly created: string[] = [];
  public readonly webview = new FakeWebview();

  public createElement(name: string): BrowserWebviewElement {
    this.created.push(name);
    return this.webview;
  }
}

class FakeHost {
  public readonly children: BrowserWebviewElement[] = [];

  public appendChild(node: BrowserWebviewElement) {
    this.children.push(node);
    return node;
  }
}

function event(type: string, properties: Record<string, unknown> = {}) {
  return Object.assign(new Event(type), properties);
}

describe("BrowserWebviewController", () => {
  it("creates one hardened explorer webview and forwards browser callbacks", () => {
    const document = new FakeDocument();
    const host = new FakeHost();
    const callbacks = {
      onDomReady: vi.fn(),
      onLoadingChange: vi.fn(),
      onTitleChange: vi.fn(),
      onNavigate: vi.fn(),
      onGuestMessage: vi.fn(),
    } satisfies BrowserWebviewCallbacks;

    const controller = new BrowserWebviewController(host, callbacks, document);
    const { webview } = document;

    expect(document.created).toEqual(["webview"]);
    expect(host.children).toEqual([webview]);
    expect(webview.getAttribute("partition")).toBe("traceability-explorer");
    expect(webview.getAttribute("src")).toBe("https://localhost/");
    expect(webview.getAttribute("webpreferences")).toBe(
      "contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes",
    );

    webview.dispatchEvent(event("dom-ready"));
    webview.dispatchEvent(event("did-start-loading"));
    webview.dispatchEvent(event("page-title-updated", { title: "Fixture" }));
    webview.dispatchEvent(event("did-navigate", { url: "https://example.com/" }));
    webview.dispatchEvent(event("did-navigate-in-page", { url: "https://example.com/docs" }));
    webview.dispatchEvent(
      event("ipc-message", {
        channel: "traceability:browser-guest",
        args: [
          {
            type: "element-selected",
            element: {
              tagName: "BUTTON",
              role: "button",
              name: "Save",
              selector: "#save",
              text: "Save",
            },
            url: "https://example.com/docs",
          },
        ],
      }),
    );
    webview.dispatchEvent(event("did-stop-loading"));

    expect(callbacks.onDomReady).toHaveBeenCalledWith(42);
    expect(callbacks.onLoadingChange).toHaveBeenNthCalledWith(1, true);
    expect(callbacks.onLoadingChange).toHaveBeenNthCalledWith(2, false);
    expect(callbacks.onTitleChange).toHaveBeenCalledWith("Fixture");
    expect(callbacks.onNavigate).toHaveBeenNthCalledWith(1, "https://example.com/");
    expect(callbacks.onNavigate).toHaveBeenNthCalledWith(2, "https://example.com/docs");
    expect(callbacks.onGuestMessage).toHaveBeenCalledWith({
      type: "element-selected",
      element: { tagName: "BUTTON", role: "button", name: "Save", selector: "#save", text: "Save" },
      url: "https://example.com/docs",
    });

    controller.dispose();
  });

  it("drops malformed guest IPC payloads", () => {
    const document = new FakeDocument();
    const onGuestMessage = vi.fn();
    const controller = new BrowserWebviewController(new FakeHost(), { onGuestMessage }, document);

    document.webview.dispatchEvent(
      event("ipc-message", {
        channel: "traceability:browser-guest",
        args: [{ type: "operation", operation: { type: "input", input: { value: "secret" } } }],
      }),
    );

    expect(onGuestMessage).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("forwards bounded main-frame load failures without surfacing aborted or subframe loads", () => {
    const document = new FakeDocument();
    const onLoadFailure = vi.fn();
    const callbacks = { onLoadFailure } satisfies BrowserWebviewCallbacks;
    const controller = new BrowserWebviewController(new FakeHost(), callbacks, document);

    document.webview.dispatchEvent(
      event("did-fail-load", {
        errorCode: -3,
        errorDescription: "ERR_ABORTED",
        isMainFrame: true,
      }),
    );
    document.webview.dispatchEvent(
      event("did-fail-load", {
        errorCode: -105,
        errorDescription: "ERR_NAME_NOT_RESOLVED",
        isMainFrame: false,
      }),
    );
    document.webview.dispatchEvent(
      event("did-fail-load", {
        errorCode: -105,
        errorDescription: "x".repeat(300),
        isMainFrame: true,
      }),
    );

    expect(onLoadFailure).toHaveBeenCalledTimes(1);
    expect(onLoadFailure).toHaveBeenCalledWith({
      errorCode: -105,
      errorDescription: "x".repeat(240),
    });

    controller.dispose();
  });

  it("controls navigation, forwards guest commands, and removes every listener and node on disposal", () => {
    const document = new FakeDocument();
    const host = new FakeHost();
    const onDomReady = vi.fn();
    const onLoadingChange = vi.fn();
    const onTitleChange = vi.fn();
    const onNavigate = vi.fn();
    const onGuestMessage = vi.fn();
    const controller = new BrowserWebviewController(
      host,
      { onDomReady, onLoadingChange, onTitleChange, onNavigate, onGuestMessage },
      document,
    );
    const { webview } = document;

    controller.navigate("https://example.com/");
    controller.goBack();
    controller.goForward();
    controller.reload();
    controller.send({ type: "set-recording", enabled: true });

    expect(webview.loadedUrls).toEqual(["https://example.com/"]);
    expect(webview.backCalls).toBe(1);
    expect(webview.forwardCalls).toBe(1);
    expect(webview.reloadCalls).toBe(1);
    expect(webview.sent).toEqual([
      {
        channel: "traceability:browser-command",
        args: [{ type: "set-recording", enabled: true }],
      },
    ]);

    controller.dispose();
    webview.dispatchEvent(event("dom-ready"));
    webview.dispatchEvent(event("did-start-loading"));
    webview.dispatchEvent(event("did-stop-loading"));
    webview.dispatchEvent(event("page-title-updated", { title: "After disposal" }));
    webview.dispatchEvent(event("did-navigate", { url: "https://after-dispose.example/" }));
    webview.dispatchEvent(event("did-navigate-in-page", { url: "https://after-dispose.example/" }));
    webview.dispatchEvent(
      event("ipc-message", {
        channel: "traceability:browser-guest",
        args: [
          {
            type: "element-selected",
            element: { tagName: "BUTTON", role: null, name: null, selector: null, text: null },
            url: "https://after-dispose.example/",
          },
        ],
      }),
    );
    controller.navigate("https://after-dispose.example/");
    controller.send({ type: "select-element" });

    expect(webview.removed).toBe(true);
    expect(onDomReady).not.toHaveBeenCalled();
    expect(onLoadingChange).not.toHaveBeenCalled();
    expect(onTitleChange).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onGuestMessage).not.toHaveBeenCalled();
    expect(webview.loadedUrls).toEqual(["https://example.com/"]);
    expect(webview.sent).toHaveLength(1);
  });
});
