import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import { getIssue } from "../issues/service.js";
import { db, rrwebReplays } from "./db.js";

export const SaveReplaySchema = z.object({
  replayId: z.string().optional(),
  sentryEventId: z.string().optional(),
  capturedAt: z.string().optional(),
  startAt: z.number().optional(),
  endAt: z.number().optional(),
  events: z.array(z.unknown()).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function saveReplay(appId: string, raw: unknown) {
  const body = SaveReplaySchema.parse(raw);
  const replayId = body.replayId ?? crypto.randomUUID();
  const payload = JSON.stringify(body.events);
  const now = new Date().toISOString();
  const metadata = JSON.stringify(body.metadata ?? {});

  db.insert(rrwebReplays)
    .values({
      id: replayId,
      appId,
      sentryEventId: body.sentryEventId ?? null,
      receivedAt: now,
      capturedAt: body.capturedAt ?? null,
      startAt: body.startAt ?? null,
      endAt: body.endAt ?? null,
      eventCount: body.events.length,
      sizeBytes: Buffer.byteLength(payload, "utf8"),
      payload,
      metadata,
    })
    .onConflictDoUpdate({
      target: rrwebReplays.id,
      set: {
        appId,
        eventCount: body.events.length,
        sizeBytes: Buffer.byteLength(payload, "utf8"),
        payload,
        metadata,
        sentryEventId: sql`COALESCE(excluded.sentry_event_id, rrweb_replays.sentry_event_id)`,
        receivedAt: now,
        capturedAt: body.capturedAt ?? null,
        startAt: body.startAt ?? null,
        endAt: body.endAt ?? null,
      },
    })
    .run();

  return getReplay(replayId)!;
}

export function attachReplayToIssue(
  replayId: string,
  issueId: string,
  appId: string,
  sentryEventId?: string,
) {
  const now = new Date().toISOString();
  db.insert(rrwebReplays)
    .values({ id: replayId, appId, issueId, sentryEventId: sentryEventId ?? null, receivedAt: now })
    .onConflictDoUpdate({
      target: rrwebReplays.id,
      set: {
        appId,
        issueId,
        sentryEventId: sql`COALESCE(rrweb_replays.sentry_event_id, excluded.sentry_event_id)`,
      },
    })
    .run();
  return getReplaySummary(replayId)!;
}

export function getReplaySummary(id: string) {
  const rows = db.select().from(rrwebReplays).where(eq(rrwebReplays.id, id)).limit(1).all();
  if (!rows.length) return undefined;
  return rowToSummary(rows[0]!);
}

export function getReplay(id: string) {
  const rows = db.select().from(rrwebReplays).where(eq(rrwebReplays.id, id)).limit(1).all();
  if (!rows.length) return undefined;
  return rowToReplay(rows[0]!);
}

export function getReplayForIssue(issueId: string, replayId: string) {
  const rows = db
    .select()
    .from(rrwebReplays)
    .where(and(eq(rrwebReplays.issueId, issueId), eq(rrwebReplays.id, replayId)))
    .limit(1)
    .all();
  if (!rows.length) throw new AppError("not found", 404, 404);
  return rowToReplay(rows[0]!);
}

export function listReplaysByIssue(issueId: string, limit = 20) {
  getIssue(issueId);
  return db
    .select()
    .from(rrwebReplays)
    .where(eq(rrwebReplays.issueId, issueId))
    .orderBy(desc(rrwebReplays.receivedAt))
    .limit(Math.min(limit, 100))
    .all()
    .map(rowToSummary);
}

function rowToSummary(row: typeof rrwebReplays.$inferSelect) {
  return {
    id: row.id,
    appId: row.appId,
    issueId: row.issueId ?? undefined,
    sentryEventId: row.sentryEventId ?? undefined,
    receivedAt: row.receivedAt,
    capturedAt: row.capturedAt ?? undefined,
    startAt: row.startAt ?? undefined,
    endAt: row.endAt ?? undefined,
    eventCount: row.eventCount,
    sizeBytes: row.sizeBytes,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

function rowToReplay(row: typeof rrwebReplays.$inferSelect) {
  return {
    ...rowToSummary(row),
    events: JSON.parse(row.payload) as unknown[],
  };
}
