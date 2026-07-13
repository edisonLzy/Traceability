import type { Database } from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";

import { openDb } from "../db.js";
import { createAppsRepo } from "../domains/apps/db.js";
import { createIssuesRepo } from "../domains/issues/db.js";
import { createRrwebReplaysRepo } from "../domains/replays/db.js";

let db: Database;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("rrweb replays repo", () => {
  it("keeps issue association when replay payload arrives after issue ingest", () => {
    const apps = createAppsRepo(db);
    const issues = createIssuesRepo(db);
    const replays = createRrwebReplaysRepo(db);
    const app = apps.create({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const { issue } = issues.ingestEvent(app.id, {
      event_id: "e1",
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
      extra: { rrwebReplayId: "replay-1" },
    });

    const placeholder = replays.attachToIssue("replay-1", issue.id, app.id, "e1");
    expect(placeholder.issueId).toBe(issue.id);
    expect(placeholder.eventCount).toBe(0);

    replays.save(app.id, {
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

    const summaries = replays.listByIssue(issue.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.eventCount).toBe(2);
    expect(summaries[0]!.issueId).toBe(issue.id);

    const replay = replays.getForIssue(issue.id, "replay-1");
    expect(replay?.events).toHaveLength(2);
    expect(replay?.metadata.url).toBe("https://example.test");
  });
});
