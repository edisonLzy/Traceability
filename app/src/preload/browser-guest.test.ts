import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => {
  const listeners = new Map<string, (_event: unknown, command: unknown) => void>();
  return {
    listeners,
    on: vi.fn((channel: string, listener: (_event: unknown, command: unknown) => void) => {
      listeners.set(channel, listener);
    }),
    sendToHost: vi.fn(),
  };
});

vi.mock("electron", () => ({ ipcRenderer: ipc }));

class FakeElement extends EventTarget {
  public id = "";
  public name = "";
  public autocomplete = "";
  public textContent: string | null = null;
  public parentElement: FakeElement | null = null;
  public readonly children: FakeElement[] = [];
  public readonly attributes = new Map<string, string>();

  public constructor(public readonly tagName: string) {
    super();
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public appendChild(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }
}

class FakeInput extends FakeElement {
  public type = "text";
  public value = "";

  public constructor() {
    super("INPUT");
  }
}

class FakeTextarea extends FakeElement {
  public value = "";

  public constructor() {
    super("TEXTAREA");
  }
}

class FakeSelect extends FakeElement {
  public value = "";

  public constructor() {
    super("SELECT");
  }
}

class FakeDocument extends EventTarget {}

function guestEvent(type: string, target: EventTarget): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

async function installGuestProtocol(topFrame = true) {
  const fakeDocument = new FakeDocument();
  const fakeWindow = {
    location: { href: "https://fixture.example/" },
    top: null as unknown,
  };
  fakeWindow.top = topFrame ? fakeWindow : {};
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeInput);
  vi.stubGlobal("HTMLTextAreaElement", FakeTextarea);
  vi.stubGlobal("HTMLSelectElement", FakeSelect);

  await import("./browser-guest");
  return fakeDocument;
}

describe("browser guest preload", () => {
  beforeEach(() => {
    vi.resetModules();
    ipc.listeners.clear();
    ipc.on.mockClear();
    ipc.sendToHost.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not install in a child frame", async () => {
    await installGuestProtocol(false);

    expect(ipc.on).not.toHaveBeenCalled();
  });

  it("does not emit until recording is enabled and never emits a textarea value", async () => {
    const document = await installGuestProtocol();
    const textarea = new FakeTextarea();
    textarea.value = "raw input value";
    textarea.textContent = "raw input value";

    document.dispatchEvent(guestEvent("input", textarea));
    expect(ipc.sendToHost).not.toHaveBeenCalled();

    ipc.listeners.get("traceability:browser-command")?.(
      {},
      { type: "set-recording", enabled: true },
    );
    document.dispatchEvent(guestEvent("input", textarea));

    expect(ipc.sendToHost).toHaveBeenCalledTimes(1);
    const [, payload] = ipc.sendToHost.mock.calls[0] ?? [];
    expect(JSON.stringify(payload)).not.toContain("raw input value");
  });

  it("omits form text that contains a textarea default value", async () => {
    const document = await installGuestProtocol();
    const form = new FakeElement("FORM");
    const textarea = new FakeTextarea();
    textarea.textContent = "textarea default value";
    form.appendChild(textarea);
    form.textContent = "Search textarea default value";

    ipc.listeners.get("traceability:browser-command")?.(
      {},
      { type: "set-recording", enabled: true },
    );
    document.dispatchEvent(guestEvent("submit", form));

    const [, payload] = ipc.sendToHost.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      type: "operation",
      operation: { type: "submit", target: { name: null, text: null } },
    });
    expect(JSON.stringify(payload)).not.toContain("textarea default value");
  });

  it("omits selected contenteditable text, including when selecting a descendant", async () => {
    const document = await installGuestProtocol();
    const editor = new FakeElement("DIV");
    editor.attributes.set("contenteditable", "true");
    editor.textContent = "editable secret text";
    const child = new FakeElement("SPAN");
    child.textContent = "editable secret text";
    editor.appendChild(child);

    ipc.listeners.get("traceability:browser-command")?.({}, { type: "select-element" });
    document.dispatchEvent(guestEvent("click", child));

    const [, payload] = ipc.sendToHost.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      type: "element-selected",
      element: { name: null, text: null },
    });
    expect(JSON.stringify(payload)).not.toContain("editable secret text");
  });

  it("retains a safe input operation summary without its value", async () => {
    const document = await installGuestProtocol();
    const input = new FakeInput();
    input.id = "search";
    input.value = "user search query";
    input.textContent = "user search query";

    ipc.listeners.get("traceability:browser-command")?.(
      {},
      { type: "set-recording", enabled: true },
    );
    document.dispatchEvent(guestEvent("input", input));

    expect(ipc.sendToHost).toHaveBeenCalledWith(
      "traceability:browser-guest",
      expect.objectContaining({
        type: "operation",
        operation: expect.objectContaining({
          type: "input",
          target: expect.objectContaining({ name: "search", text: null }),
        }),
      }),
    );
    expect(JSON.stringify(ipc.sendToHost.mock.calls[0]?.[1])).not.toContain("user search query");
  });

  it("consumes one selected click without recording it as an operation", async () => {
    const document = await installGuestProtocol();
    const button = new FakeElement("BUTTON");
    const click = guestEvent("click", button);
    const stopImmediatePropagation = vi.spyOn(click, "stopImmediatePropagation");

    ipc.listeners.get("traceability:browser-command")?.(
      {},
      { type: "set-recording", enabled: true },
    );
    ipc.listeners.get("traceability:browser-command")?.({}, { type: "select-element" });
    document.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(ipc.sendToHost).toHaveBeenCalledWith(
      "traceability:browser-guest",
      expect.objectContaining({ type: "element-selected" }),
    );

    document.dispatchEvent(guestEvent("click", button));
    expect(ipc.sendToHost).toHaveBeenCalledTimes(2);
    expect(ipc.sendToHost.mock.calls[1]?.[1]).toMatchObject({ type: "operation" });
  });
});
