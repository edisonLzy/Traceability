import { randomUUID } from "node:crypto";

import type { Issue, Event, Patch, IssueStatus, SourceLocation } from "@traceability/protocol";
import type { SentryEventPayload } from "@traceability/protocol";
import type { Database } from "better-sqlite3";

import { extractIssueFingerprint, payloadToIssueFields } from "../ingest/envelope.js";

export function createIssuesRepo(db: Database) {
  const rowToIssue = (r: Record<string, unknown>): Issue => ({
    id: r.id as string,
    appId: r.app_id as string,
    fingerprint: r.fingerprint as string,
    title: r.title as string,
    type: r.type as Issue["type"],
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    count: r.count as number,
    status: r.status as IssueStatus,
    metadata: JSON.parse(r.metadata as string) as Issue["metadata"],
  });

  return {
    list(opts: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }): {
      items: Issue[];
      nextCursor: string | null;
    } {
      const limit = Math.min(opts.limit ?? 50, 200);
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.appId) {
        where.push("app_id = ?");
        params.push(opts.appId);
      }
      if (opts.status) {
        where.push("status = ?");
        params.push(opts.status);
      }
      if (opts.cursor) {
        where.push("last_seen < ?");
        params.push(opts.cursor);
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM issues ${whereClause} ORDER BY last_seen DESC LIMIT ?`)
        .all(...params, limit + 1) as Array<Record<string, unknown>>;
      const items = rows.slice(0, limit).map(rowToIssue);
      const nextCursor = rows.length > limit ? (rows[limit - 1]!.last_seen as string) : null;
      return { items, nextCursor };
    },

    get(id: string): Issue | undefined {
      const row = db.prepare("SELECT * FROM issues WHERE id = ?").get(id) as
        | Record<string, unknown>
        | undefined;
      return row ? rowToIssue(row) : undefined;
    },

    /**
     * Upsert an issue from an ingested event payload. Returns the issue + whether it was newly created
     * (used to drive WS "issue:created" vs "issue:updated").
     */
    ingestEvent(
      appId: string,
      payload: SentryEventPayload,
      resolvedFrames: SourceLocation[] = [],
    ): { issue: Issue; created: boolean } {
      const fingerprint = extractIssueFingerprint(payload, appId);
      const fields = payloadToIssueFields(payload, resolvedFrames);
      const now = new Date().toISOString();

      const existing = db
        .prepare("SELECT * FROM issues WHERE app_id = ? AND fingerprint = ?")
        .get(appId, fingerprint) as Record<string, unknown> | undefined;

      if (existing) {
        db.prepare(
          `UPDATE issues SET last_seen = ?, count = count + 1, metadata = ? WHERE id = ?`,
        ).run(now, JSON.stringify(fields.metadata), existing.id);
        return { issue: this.get(existing.id as string)!, created: false };
      }

      const issue: Issue = {
        id: randomUUID(),
        appId,
        fingerprint,
        title: fields.title,
        type: fields.type,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        status: "open",
        metadata: fields.metadata,
      };
      db.prepare(
        `INSERT INTO issues (id, app_id, fingerprint, title, type, first_seen, last_seen, count, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        issue.id,
        issue.appId,
        issue.fingerprint,
        issue.title,
        issue.type,
        issue.firstSeen,
        issue.lastSeen,
        issue.count,
        issue.status,
        JSON.stringify(issue.metadata),
      );
      return { issue, created: true };
    },

    appendEvent(issueId: string, envelope: string): Event {
      const event: Event = {
        id: randomUUID(),
        issueId,
        receivedAt: new Date().toISOString(),
        envelope,
      };
      db.prepare(
        "INSERT INTO events (id, issue_id, received_at, envelope) VALUES (?, ?, ?, ?)",
      ).run(event.id, event.issueId, event.receivedAt, event.envelope);
      return event;
    },

    listEvents(issueId: string, limit = 50): Event[] {
      const rows = db
        .prepare("SELECT * FROM events WHERE issue_id = ? ORDER BY received_at DESC LIMIT ?")
        .all(issueId, limit) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as string,
        issueId: r.issue_id as string,
        receivedAt: r.received_at as string,
        envelope: r.envelope as string,
      }));
    },

    setStatus(id: string, status: IssueStatus): Issue | undefined {
      db.prepare("UPDATE issues SET status = ? WHERE id = ?").run(status, id);
      return this.get(id);
    },

    attachPatch(issueId: string, branch: string, filePath: string): Patch {
      const patch: Patch = {
        id: randomUUID(),
        issueId,
        branch,
        filePath,
        attachedAt: new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO patches (id, issue_id, branch, file_path, attached_at) VALUES (?, ?, ?, ?, ?)",
      ).run(patch.id, patch.issueId, patch.branch, patch.filePath, patch.attachedAt);
      db.prepare("UPDATE issues SET status = 'fixing' WHERE id = ?").run(issueId);
      return patch;
    },

    getLatestPatch(issueId: string): Patch | undefined {
      const row = db
        .prepare("SELECT * FROM patches WHERE issue_id = ? ORDER BY attached_at DESC LIMIT 1")
        .get(issueId) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        id: row.id as string,
        issueId: row.issue_id as string,
        branch: row.branch as string,
        filePath: row.file_path as string,
        attachedAt: row.attached_at as string,
      };
    },
  };
}
