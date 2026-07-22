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
