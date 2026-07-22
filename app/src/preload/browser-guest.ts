import { ipcRenderer } from "electron";

import { sanitizeBrowserEvidenceUrl } from "../browser-url-safety";
import type {
  BrowserElementSummary,
  BrowserGuestMessage,
  BrowserInputLength,
} from "../shared/browser-types.js";

const BROWSER_COMMAND_CHANNEL = "traceability:browser-command";
const BROWSER_GUEST_CHANNEL = "traceability:browser-guest";
const MAX_SELECTOR_LENGTH = 240;
const MAX_TEXT_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_PATH_DEPTH = 5;

type BrowserGuestCommand = { type: "set-recording"; enabled: boolean } | { type: "select-element" };
type GuestOperation =
  | { type: "click" | "submit"; target: BrowserElementSummary }
  | {
      type: "input";
      target: BrowserElementSummary;
      input: { fieldType: string; isSensitive: boolean; length: BrowserInputLength };
    };

if (window.top === window) installGuestProtocol();

function installGuestProtocol() {
  let recording = false;
  let selecting = false;

  ipcRenderer.on(BROWSER_COMMAND_CHANNEL, (_event, command: unknown) => {
    if (!isBrowserGuestCommand(command)) return;
    if (command.type === "set-recording") recording = command.enabled;
    if (command.type === "select-element") selecting = true;
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = getElement(event.target);
      if (!target) return;

      if (selecting) {
        selecting = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        emit({
          type: "element-selected",
          element: summarizeElement(target),
          url: sanitizeBrowserEvidenceUrl(window.location.href),
        });
        return;
      }

      if (recording) emitOperation({ type: "click", target: summarizeElement(target) });
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      if (!recording) return;
      const target = getInputElement(event.target);
      if (!target) return;

      emitOperation({
        type: "input",
        target: summarizeElement(target),
        input: {
          fieldType: inputFieldType(target),
          isSensitive: isSensitiveInput(target),
          length: inputLength(target.value.length),
        },
      });
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      if (!recording) return;
      const target = getElement(event.target);
      if (target) emitOperation({ type: "submit", target: summarizeElement(target) });
    },
    true,
  );
}

function emitOperation(operation: GuestOperation) {
  emit({
    type: "operation",
    operation: { ...operation, id: crypto.randomUUID(), at: new Date().toISOString() },
  });
}

function emit(message: BrowserGuestMessage) {
  ipcRenderer.sendToHost(BROWSER_GUEST_CHANNEL, message);
}

function isBrowserGuestCommand(value: unknown): value is BrowserGuestCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return (
    (value.type === "set-recording" && "enabled" in value && typeof value.enabled === "boolean") ||
    value.type === "select-element"
  );
}

function getElement(value: EventTarget | null): Element | null {
  return value instanceof Element ? value : null;
}

function getInputElement(
  value: EventTarget | null,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  if (
    value instanceof HTMLInputElement ||
    value instanceof HTMLTextAreaElement ||
    value instanceof HTMLSelectElement
  ) {
    return value;
  }
  return null;
}

function summarizeElement(element: Element): BrowserElementSummary {
  const testId = bounded(element.getAttribute("data-testid"), MAX_NAME_LENGTH);
  const id = bounded(element.id, MAX_NAME_LENGTH);
  const ariaLabel = bounded(element.getAttribute("aria-label"), MAX_NAME_LENGTH);
  const text = safeElementText(element, MAX_TEXT_LENGTH);
  const name = testId ?? id ?? ariaLabel ?? safeElementText(element, MAX_NAME_LENGTH);
  const selector = testId
    ? `[data-testid=${quoteAttribute(testId)}]`
    : id
      ? `#${escapeIdentifier(id)}`
      : ariaLabel
        ? `[aria-label=${quoteAttribute(ariaLabel)}]`
        : selectorPath(element);

  return {
    tagName: element.tagName,
    role: bounded(element.getAttribute("role"), MAX_NAME_LENGTH),
    name,
    selector: bounded(selector, MAX_SELECTOR_LENGTH),
    text,
  };
}

function safeElementText(element: Element, maxLength: number): string | null {
  if (containsValueBearingOrEditableContent(element)) return null;
  return bounded(element.textContent, maxLength);
}

function containsValueBearingOrEditableContent(element: Element): boolean {
  if (isValueBearingElement(element) || isWithinEditableContent(element)) return true;
  return Array.from(element.children).some(containsValueBearingOrEditableContent);
}

function isWithinEditableContent(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    const contentEditable = current.getAttribute("contenteditable");
    if (contentEditable !== null) return contentEditable.toLowerCase() !== "false";
    current = current.parentElement;
  }

  return false;
}

function isValueBearingElement(element: Element): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function selectorPath(element: Element): string | null {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && parts.length < MAX_PATH_DEPTH) {
    const tagName = current.tagName;
    const parentElement: Element | null = current.parentElement;
    const siblings: Element[] = parentElement
      ? Array.from(parentElement.children).filter((child) => child.tagName === tagName)
      : [];
    const position = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${Math.max(position, 1)})`);
    current = parentElement;
  }

  return bounded(parts.join(" > "), MAX_SELECTOR_LENGTH);
}

function bounded(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function quoteAttribute(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function inputFieldType(
  target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  if (target instanceof HTMLInputElement) return target.type || "text";
  return target.tagName.toLowerCase();
}

function isSensitiveInput(
  target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (target instanceof HTMLInputElement && ["password", "file", "hidden"].includes(target.type))
    return true;
  const identifier = `${target.name} ${target.id} ${target.autocomplete}`.toLowerCase();
  return /password|passcode|secret|token|card|credit|cvv/.test(identifier);
}

function inputLength(length: number): BrowserInputLength {
  if (length === 0) return "empty";
  if (length <= 8) return "1-8";
  if (length <= 32) return "9-32";
  if (length <= 128) return "33-128";
  return "129+";
}
