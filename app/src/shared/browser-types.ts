export type BrowserInputLength = "empty" | "1-8" | "9-32" | "33-128" | "129+";

export interface BrowserElementSummary {
  tagName: string;
  role: string | null;
  name: string | null;
  selector: string | null;
  text: string | null;
}

export type RecordedOperation =
  | { id: string; at: string; type: "click" | "submit"; target: BrowserElementSummary }
  | {
      id: string;
      at: string;
      type: "input";
      target: BrowserElementSummary;
      input: { fieldType: string; isSensitive: boolean; length: BrowserInputLength };
    };

export type RecordedResponse =
  | { state: "captured"; body: unknown }
  | { state: "skipped"; reason: "not-fetch-xhr" | "not-json" | "resource-limit" }
  | { state: "unavailable"; reason: "body-read-failed" | "invalid-json" | "stopped" }
  | { state: "pending-at-stop" };

export interface RecordedRequest {
  id: string;
  url: string;
  method: string;
  startedAt: string;
  resourceType: string | null;
  status: number | null;
  mimeType: string | null;
  encodedBytes: number;
  response: RecordedResponse;
}

export interface BrowserRecording {
  version: 1;
  id: string;
  startedAt: string;
  endedAt: string;
  url: string;
  operations: RecordedOperation[];
  network: RecordedRequest[];
  console: Array<{ at: string; level: "warning" | "error" | "exception"; message: string }>;
  memory: {
    metric: "JSHeapUsedSize";
    samples: Array<{ at: string; usedBytes: number; totalBytes?: number }>;
    initialBytes: number;
    finalBytes: number;
    deltaBytes: number;
  };
  captureErrors: Array<{ source: "cdp" | "guest"; message: string; at: string }>;
}

export interface BrowserComment {
  id: string;
  createdAt: string;
  url: string;
  element: BrowserElementSummary;
  comment: string;
}

export type BrowserGuestMessage =
  | { type: "operation"; operation: RecordedOperation }
  | { type: "element-selected"; element: BrowserElementSummary; url: string };
