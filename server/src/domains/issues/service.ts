import type { IssueStatus } from "@traceability/protocol";
import { eq, and, desc, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import { broadcast } from "../../ws/broadcaster.js";
import { extractIssueFingerprint, payloadToIssueFields } from "../ingest/envelope.js";
import { db, issues, events, patches } from "./db.js";

export const ListIssuesSchema = z.object({
  appId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
});

export const AttachPatchSchema = z.object({
  branch: z.string().min(1),
  patch: z.string().min(1),
});

export function listIssues(raw: unknown) {
  const opts = ListIssuesSchema.parse(raw);
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: any[] = [];
  if (opts.appId) conditions.push(eq(issues.appId, opts.appId));
  if (opts.status) conditions.push(eq(issues.status, opts.status as IssueStatus));
  if (opts.cursor) conditions.push(lte(issues.lastSeen, opts.cursor));

  const rows = (
    conditions.length > 0
      ? db
          .select()
          .from(issues)
          .where(and(...conditions))
      : db.select().from(issues)
  )
    .orderBy(desc(issues.lastSeen))
    .limit(limit + 1)
    .all();

  const items = rows.slice(0, limit).map(rowToIssue);
  const nextCursor = rows.length > limit ? (rows[limit - 1]!.lastSeen as string) : null;
  return { items, nextCursor };
}

export function getIssue(id: string) {
  const rows = db.select().from(issues).where(eq(issues.id, id)).limit(1).all();
  if (!rows.length) throw new AppError("not found", 404, 404);
  return rowToIssue(rows[0]!);
}

export function ingestEvent(appId: string, payload: any, resolvedFrames: any[] = []) {
  const fingerprint = extractIssueFingerprint(payload, appId);
  const fields = payloadToIssueFields(payload, resolvedFrames);
  const now = new Date().toISOString();

  const existing = db
    .select()
    .from(issues)
    .where(and(eq(issues.appId, appId), eq(issues.fingerprint, fingerprint)))
    .limit(1)
    .all()[0];

  if (existing) {
    const updatedMeta = JSON.stringify(fields.metadata);
    db.update(issues)
      .set({ lastSeen: now, count: sql`count + 1`, metadata: updatedMeta })
      .where(eq(issues.id, existing.id))
      .run();
    return { issue: getIssue(existing.id), created: false };
  }

  const id = crypto.randomUUID();
  db.insert(issues)
    .values({
      id,
      appId,
      fingerprint,
      title: fields.title,
      type: fields.type,
      firstSeen: now,
      lastSeen: now,
      count: 1,
      status: "open",
      metadata: JSON.stringify(fields.metadata),
    })
    .run();
  return { issue: getIssue(id), created: true };
}

export function appendEvent(issueId: string, envelope: string) {
  const id = crypto.randomUUID();
  db.insert(events).values({ id, issueId, receivedAt: new Date().toISOString(), envelope }).run();
  return { id, issueId, receivedAt: new Date().toISOString(), envelope };
}

export function listIssueEvents(issueId: string, limit = 50) {
  getIssue(issueId);
  return db
    .select()
    .from(events)
    .where(eq(events.issueId, issueId))
    .orderBy(desc(events.receivedAt))
    .limit(limit)
    .all();
}

export function requestFix(id: string) {
  const issue = getIssue(id);
  db.update(issues).set({ status: "fix-manual" }).where(eq(issues.id, id)).run();
  const updated = getIssue(id);
  broadcast({ kind: "issue:status-changed", appId: issue.appId, issueId: id, payload: updated });
  return updated;
}

export function attachPatch(id: string, raw: unknown) {
  const issue = getIssue(id);
  const input = AttachPatchSchema.parse(raw);
  const patchId = crypto.randomUUID();
  const filePath = `patches/${issue.id}-${Date.now()}.diff`;

  db.insert(patches)
    .values({
      id: patchId,
      issueId: id,
      branch: input.branch,
      filePath,
      attachedAt: new Date().toISOString(),
    })
    .run();
  db.update(issues).set({ status: "fixing" }).where(eq(issues.id, id)).run();

  const updated = getIssue(id);
  broadcast({ kind: "issue:updated", appId: issue.appId, issueId: id, payload: updated });
  return updated;
}

export function markFixed(id: string) {
  const issue = getIssue(id);
  db.update(issues).set({ status: "fixed" }).where(eq(issues.id, id)).run();
  const updated = getIssue(id);
  broadcast({ kind: "issue:status-changed", appId: issue.appId, issueId: id, payload: updated });
  return updated;
}

function rowToIssue(row: typeof issues.$inferSelect) {
  return {
    ...row,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}
