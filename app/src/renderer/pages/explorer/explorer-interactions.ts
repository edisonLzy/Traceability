import type { BrowserComment, BrowserGuestMessage, BrowserRecording } from "@shared/browser-types";

import type { BrowserGuestCommand } from "./browser-webview";

type SelectedElement = Extract<BrowserGuestMessage, { type: "element-selected" }>;

export interface ExplorerInteractionDependencies {
  startRecording(): Promise<{ recordingId: string }>;
  stopRecording(): Promise<BrowserRecording>;
  unregisterGuest(): Promise<void>;
  send(command: BrowserGuestCommand): void;
  createId(): string;
  now(): Date;
  info(...data: unknown[]): void;
  onTransitionChange?(isTransitioning: boolean): void;
}

/**
 * Keeps the Explorer's ordered IPC/guest interactions independent from React.
 * It intentionally has no persistence dependency: recordings and comments only
 * leave the page through the explicit developer-console diagnostic output.
 */
export class ExplorerInteractionCoordinator {
  public isRecording = false;
  public isTransitioning = false;
  public selectedElement: SelectedElement | null = null;
  private unmounted = false;

  public constructor(private readonly dependencies: ExplorerInteractionDependencies) {}

  public async startRecording() {
    if (this.isTransitioning) return;
    this.setTransitioning(true);
    try {
      await this.dependencies.startRecording();
      this.dependencies.send({ type: "set-recording", enabled: true });
      this.isRecording = true;
    } finally {
      this.setTransitioning(false);
    }
  }

  public async stopRecording() {
    if (this.isTransitioning) return;
    this.setTransitioning(true);
    try {
      this.dependencies.send({ type: "set-recording", enabled: false });
      const recording = await this.dependencies.stopRecording();
      this.dependencies.info(
        "[traceability:explorer-recording]",
        JSON.stringify(recording, null, 2),
      );
      return recording;
    } finally {
      this.isRecording = false;
      this.setTransitioning(false);
    }
  }

  public selectElement() {
    this.dependencies.send({ type: "select-element" });
  }

  public receiveGuestMessage(message: BrowserGuestMessage) {
    if (message.type === "element-selected") this.selectedElement = message;
  }

  public submitComment(value: string): BrowserComment | null {
    const selected = this.selectedElement;
    const comment = value.trim();
    if (!selected || !comment) return null;

    const submitted: BrowserComment = {
      id: this.dependencies.createId(),
      createdAt: this.dependencies.now().toISOString(),
      url: selected.url,
      element: selected.element,
      comment,
    };
    this.dependencies.info("[traceability:explorer-comment]", JSON.stringify(submitted, null, 2));
    this.selectedElement = null;
    return submitted;
  }

  public cancelComment() {
    this.selectedElement = null;
  }

  public async unmount() {
    if (this.unmounted) return;
    this.unmounted = true;
    await this.dependencies.unregisterGuest();
  }

  private setTransitioning(isTransitioning: boolean) {
    this.isTransitioning = isTransitioning;
    this.dependencies.onTransitionChange?.(isTransitioning);
  }
}
