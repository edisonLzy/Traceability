import "./test-db.js";
import { describe, it, expect, beforeEach } from "vitest";

import type { ReplayEventPayload } from "../domains/ingest/types.js";
import type { SentryEventPayload } from "../domains/ingest/types.js";
import { issues, events, patches } from "../domains/issues/db.js";
import { ingestEvent, appendEvent } from "../domains/issues/service.js";
import { db, replays, replaySegments } from "../domains/replays/db.js";
import {
  appendSegment,
  attachReplayToIssue,
  getReplayForIssue,
  listReplaysByIssue,
} from "../domains/replays/service.js";

beforeEach(() => {
  db.delete(replaySegments).run();
  db.delete(replays).run();
  db.delete(events).run();
  db.delete(patches).run();
  db.delete(issues).run();
});

function makeReplayEvent(overrides: Partial<ReplayEventPayload> = {}): ReplayEventPayload {
  return {
    type: "replay_event",
    replay_id: "test-" + Date.now(),
    timestamp: Date.now(),
    segment_id: 0,
    replay_type: "buffer",
    ...overrides,
  };
}

function makeErrorPayload(id: string): SentryEventPayload {
  return {
    event_id: id,
    exception: { values: [{ type: "TypeError", value: "test error" }] },
  };
}

describe("segment replays", () => {
  it("appends segments and retrieves them in order", () => {
    const replayId = "seq-" + Date.now();
    const evt0 = makeReplayEvent({ replay_id: replayId, segment_id: 0, timestamp: 100 });
    appendSegment({
      appId: "app1",
      replayEvent: evt0,
      recording: Buffer.from(JSON.stringify([{ seq: 1 }])),
    });

    const evt1 = makeReplayEvent({ replay_id: replayId, segment_id: 1, timestamp: 200 });
    appendSegment({
      appId: "app1",
      replayEvent: evt1,
      recording: Buffer.from(JSON.stringify([{ seq: 2 }])),
    });

    // Retrieve via attached issue
    const { issue } = ingestEvent("app1", makeErrorPayload("e1"), []);
    attachReplayToIssue(replayId, issue.id);

    const result = getReplayForIssue(issue.id, replayId);
    expect(result.replayId).toBe(replayId);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.segmentId).toBe(0);
    expect(result.segments[1]!.segmentId).toBe(1);
    expect(result.segments[0]!.events).toEqual([{ seq: 1 }]);
    expect(result.segments[1]!.events).toEqual([{ seq: 2 }]);
  });

  it("attaches replay to issue and lists it", () => {
    const replayId = "list-" + Date.now();
    appendSegment({
      appId: "app1",
      replayEvent: makeReplayEvent({ replay_id: replayId }),
      recording: Buffer.from("[]"),
    });

    const { issue } = ingestEvent("app1", makeErrorPayload("e2"), []);
    attachReplayToIssue(replayId, issue.id);

    const list = listReplaysByIssue(issue.id);
    expect(list.some((r) => r.replayId === replayId)).toBe(true);
    expect(list[0]!.segmentCount).toBe(1);
  });

  it("uses contexts.replay.replay_id for attachment", () => {
    const replayId = "ctx-" + Date.now();
    appendSegment({
      appId: "app1",
      replayEvent: makeReplayEvent({ replay_id: replayId }),
      recording: Buffer.from(JSON.stringify([{ frame: "data" }])),
    });

    // Simulate what the ingest service does: read contexts.replay.replay_id
    const payload: SentryEventPayload = {
      event_id: "e3",
      contexts: { replay: { replay_id: replayId } },
      exception: { values: [{ type: "Error", value: "ctx test" }] },
    };
    const { issue } = ingestEvent("app1", payload, []);
    attachReplayToIssue(replayId, issue.id);

    const result = getReplayForIssue(issue.id, replayId);
    expect(result.segments[0]!.events).toEqual([{ frame: "data" }]);
  });
});
