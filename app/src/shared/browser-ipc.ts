import type { BrowserRecording } from "./browser-types.js";

export interface BrowserIPC {
  registerBrowserGuest(input: { webContentsId: number }): Promise<void>;
  unregisterBrowserGuest(): Promise<void>;
  startBrowserRecording(): Promise<{ recordingId: string }>;
  stopBrowserRecording(): Promise<BrowserRecording>;
}
