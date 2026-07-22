import "./test-db.js";
import { describe, it, expect } from "vitest";

import { createApp, listApps } from "../domains/apps/service.js";
import { type SentryEventPayload } from "../domains/ingest/types.js";
import { ingestEvent, getIssue, requestFix, attachPatch } from "../domains/issues/service.js";

describe("issues service ingestEvent", () => {
  it("creates a new issue on first occurrence", () => {
    const app = createApp({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const payload: SentryEventPayload = {
      event_id: "e1",
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
    } as any;
    const { issue, created } = ingestEvent(app.id, payload);
    expect(created).toBe(true);
    expect(issue.count).toBe(1);
    expect(issue.status).toBe("open");
  });

  it("increments count on duplicate fingerprint, no new row", () => {
    const app = createApp({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const payload: SentryEventPayload = {
      type: "error",
      exception: { values: [{ type: "TypeError", value: "x" }] },
    } as any;
    const first = ingestEvent(app.id, payload);
    const second = ingestEvent(app.id, payload);
    expect(second.created).toBe(false);
    expect(second.issue.id).toBe(first.issue.id);
    expect(second.issue.count).toBe(2);
  });

  it("setStatus + attachPatch flow", () => {
    const app = createApp({ name: "A", repoUrl: "git@x:a.git", defaultBranch: "main" });
    const { issue } = ingestEvent(app.id, {
      type: "error",
      message: "m",
      exception: { values: [{ type: "E", value: "m" }] },
    } as any);
    requestFix(issue.id);
    expect(getIssue(issue.id).status).toBe("fix-manual");
    attachPatch(issue.id, { branch: "fix-branch", patch: "diff content" });
    expect(getIssue(issue.id).status).toBe("fixing");
  });
});
