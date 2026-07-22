import { describe, it, expect } from "vitest";

import { parseEnvelope, filterSupportedItems } from "../domains/ingest/envelope.js";

function makeTextEnvelope(): Buffer {
  const header = JSON.stringify({ event_id: "abc", sent_at: "2024-01-01T00:00:00.000Z" });
  const itemHeader = JSON.stringify({ type: "event" });
  const payload = JSON.stringify({
    event_id: "e1",
    exception: { values: [{ type: "TypeError", value: "boom" }] },
  });
  return Buffer.from(`${header}\n${itemHeader}\n${payload}\n`);
}

function makeReplayEnvelope(): Buffer {
  const header = JSON.stringify({ event_id: "rep-1", sent_at: "2024-01-01T00:00:00.000Z" });
  const replayEventHeader = JSON.stringify({ type: "replay_event" });
  const replayEventPayload = JSON.stringify({
    type: "replay_event",
    replay_id: "abcd1234",
    timestamp: 1700000000,
    segment_id: 0,
    replay_type: "buffer",
  });
  const recordingData = Buffer.from("gzipped-bytes-here");
  const recordingHeader = JSON.stringify({
    type: "replay_recording",
    length: recordingData.length,
  });
  return Buffer.concat([
    Buffer.from(`${header}\n${replayEventHeader}\n${replayEventPayload}\n${recordingHeader}\n`),
    recordingData,
    Buffer.from("\n"),
  ]);
}

describe("parseEnvelope", () => {
  it("parses text-only envelope (legacy)", () => {
    const parsed = parseEnvelope(makeTextEnvelope());
    expect(parsed.header.event_id).toBe("abc");
    expect(parsed.items).toHaveLength(1);
    const [h] = parsed.items[0]!;
    expect(h.type).toBe("event");
  });

  it("parses envelope with binary replay_recording using length header", () => {
    const parsed = parseEnvelope(makeReplayEnvelope());
    expect(parsed.items).toHaveLength(2);
    const [h0] = parsed.items[0]!;
    expect(h0.type).toBe("replay_event");
    const [h1, p1] = parsed.items[1]!;
    expect(h1.type).toBe("replay_recording");
    expect(Buffer.isBuffer(p1)).toBe(true);
    expect((p1 as unknown as Buffer).toString()).toBe("gzipped-bytes-here");
  });
});

describe("filterSupportedItems", () => {
  it("includes event and transaction, excludes replay items", () => {
    // Replay items are not yet included — B3 will expand the filter
    const envelope = parseEnvelope(makeReplayEnvelope());
    const supported = filterSupportedItems(envelope);
    expect(supported.length).toBe(0);
  });

  it("includes event item from text envelope", () => {
    const envelope = parseEnvelope(makeTextEnvelope());
    const supported = filterSupportedItems(envelope);
    expect(supported.length).toBe(1);
    expect(supported[0]!.header.type).toBe("event");
  });
});
