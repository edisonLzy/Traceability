import "./test-db.js";
import { describe, it, expect } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { ingestEvent } from "../domains/issues/service.js";
import {
  saveReplay,
  attachReplayToIssue,
  getReplayForIssue,
  listReplaysByIssue,
} from "../domains/replays/service.js";

describe("rrweb replays", () => {
  it("keeps issue association when replay payload arrives after issue ingest", () => {
    const app = createApp({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const { issue } = ingestEvent(app.id, {
      event_id: "e1",
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
      extra: { rrwebReplayId: "replay-1" },
    } as any);

    const placeholder = attachReplayToIssue("replay-1", issue.id, app.id, "e1");
    expect(placeholder.issueId).toBe(issue.id);
    expect(placeholder.eventCount).toBe(0);

    saveReplay(app.id, {
      replayId: "replay-1",
      sentryEventId: "e1",
      capturedAt: "2026-01-01T00:00:00Z",
      startAt: 1,
      endAt: 2,
      events: [
        { type: 4, timestamp: 1, data: { href: "https://example.test", width: 1280, height: 720 } },
        {
          type: 2,
          timestamp: 2,
          data: { node: { id: 1, type: 0, childNodes: [] }, initialOffset: { left: 0, top: 0 } },
        },
      ],
      metadata: { url: "https://example.test" },
    });

    const summaries = listReplaysByIssue(issue.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.eventCount).toBe(2);
    expect(summaries[0]!.issueId).toBe(issue.id);

    const replay = getReplayForIssue(issue.id, "replay-1");
    expect(replay?.events).toHaveLength(2);
    expect(replay?.metadata.url).toBe("https://example.test");
  });
});
