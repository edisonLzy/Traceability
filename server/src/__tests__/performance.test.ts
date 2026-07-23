import "./test-db.js";
import { describe, it, expect } from "vitest";

import type { SentryEventPayload } from "../domains/ingest/types.js";
import { recordFromTransaction } from "../domains/performance/service.js";

describe("recordFromTransaction", () => {
  it("extracts measurements from transaction and writes samples", () => {
    const payload: SentryEventPayload = {
      event_id: "tx1",
      type: "transaction",
      transaction: "/page",
      measurements: {
        lcp: { value: 1234, unit: "millisecond" },
        fcp: { value: 567, unit: "millisecond" },
        cls: { value: 0.1, unit: "score" },
      },
      start_timestamp: Date.now() / 1000,
      timestamp: Date.now() / 1000,
    };
    const result = recordFromTransaction("app1", payload);
    expect(result.accepted).toBe(3);
  });

  it("handles transaction without measurements", () => {
    const payload: SentryEventPayload = {
      event_id: "tx2",
      type: "transaction",
      transaction: "/empty",
      start_timestamp: Date.now() / 1000,
      timestamp: Date.now() / 1000 + 5,
    };
    const result = recordFromTransaction("app1", payload);
    expect(result.accepted).toBe(0);
  });
});
