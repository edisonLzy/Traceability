import type { SentryEventPayload } from "@traceability/protocol";
import type { Database } from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";

import { openDb } from "../db.js";
import { createAppsRepo } from "../domains/apps/db.js";
import { createIssuesRepo } from "../domains/issues/db.js";

let db: Database;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("issues repo ingestEvent", () => {
  it("creates a new issue on first occurrence", () => {
    const apps = createAppsRepo(db);
    const issues = createIssuesRepo(db);
    const app = apps.create({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const payload: SentryEventPayload = {
      event_id: "e1",
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
    };
    const { issue, created } = issues.ingestEvent(app.id, payload);
    expect(created).toBe(true);
    expect(issue.count).toBe(1);
    expect(issue.status).toBe("open");
  });

  it("increments count on duplicate fingerprint, no new row", () => {
    const apps = createAppsRepo(db);
    const issues = createIssuesRepo(db);
    const app = apps.create({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const payload: SentryEventPayload = {
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
    };
    const first = issues.ingestEvent(app.id, payload);
    const second = issues.ingestEvent(app.id, payload);
    expect(second.created).toBe(false);
    expect(second.issue.id).toBe(first.issue.id);
    expect(second.issue.count).toBe(2);
  });

  it("setStatus + attachPatch flow", () => {
    const apps = createAppsRepo(db);
    const issues = createIssuesRepo(db);
    const app = apps.create({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const { issue } = issues.ingestEvent(app.id, {
      type: "error",
      message: "m",
      exception: { values: [{ type: "E", value: "m" }] },
    });
    issues.setStatus(issue.id, "fix-manual");
    expect(issues.get(issue.id)!.status).toBe("fix-manual");
    issues.attachPatch(issue.id, "fix-branch", "patches/fix.diff");
    expect(issues.get(issue.id)!.status).toBe("fixing");
    expect(issues.getLatestPatch(issue.id)!.branch).toBe("fix-branch");
  });
});
