import { eq, desc, and, sql } from "drizzle-orm";

import { AppError } from "../../errors/app-error.js";
import type { ReplayEventPayload } from "../ingest/types.js";
import { getIssue } from "../issues/service.js";
import { db, replays, replaySegments } from "./db.js";

export function appendSegment(input: {
  appId: string;
  replayEvent: ReplayEventPayload;
  recording: Buffer;
}): void {
  const evt = input.replayEvent;
  const now = new Date().toISOString();
  const sizeBytes = input.recording.length;

  db.insert(replays)
    .values({
      replayId: evt.replay_id,
      appId: input.appId,
      firstSeenAt: now,
      lastSeenAt: now,
      startAt: evt.timestamp,
      endAt: evt.timestamp,
      segmentCount: 1,
      sizeBytes,
    })
    .onConflictDoUpdate({
      target: replays.replayId,
      set: {
        lastSeenAt: now,
        segmentCount: sql`${replays.segmentCount} + 1`,
        sizeBytes: sql`${replays.sizeBytes} + ${sizeBytes}`,
        endAt: evt.timestamp,
      },
    })
    .run();

  db.insert(replaySegments)
    .values({
      replayId: evt.replay_id,
      segmentId: evt.segment_id,
      payload: input.recording,
      sizeBytes,
      receivedAt: now,
    })
    .run();
}

export function attachReplayToIssue(replayId: string, issueId: string): void {
  db.update(replays).set({ issueId }).where(eq(replays.replayId, replayId)).run();
}

export function getReplayForIssue(
  issueId: string,
  replayId: string,
): { replayId: string; segments: Array<{ segmentId: number; events: unknown[] }> } {
  const replay = db
    .select()
    .from(replays)
    .where(and(eq(replays.replayId, replayId), eq(replays.issueId, issueId)))
    .get();
  if (!replay) throw new AppError("not found", 404, 404);

  const segmentRows = db
    .select()
    .from(replaySegments)
    .where(eq(replaySegments.replayId, replayId))
    .orderBy(replaySegments.segmentId)
    .all();

  const segments = segmentRows.map((row) => {
    const buf = row.payload;
    const events = JSON.parse(
      typeof buf === "string" ? buf : new TextDecoder().decode(buf),
    ) as unknown[];
    return { segmentId: row.segmentId, events };
  });

  return { replayId, segments };
}

export function listReplaysByIssue(
  issueId: string,
  limit = 20,
): Array<{
  replayId: string;
  appId: string;
  issueId?: string;
  segmentCount: number;
  startAt?: number;
  endAt?: number;
  sizeBytes: number;
}> {
  getIssue(issueId);
  return db
    .select({
      replayId: replays.replayId,
      appId: replays.appId,
      issueId: replays.issueId,
      segmentCount: replays.segmentCount,
      startAt: replays.startAt,
      endAt: replays.endAt,
      sizeBytes: replays.sizeBytes,
    })
    .from(replays)
    .where(eq(replays.issueId, issueId))
    .orderBy(desc(replays.lastSeenAt))
    .limit(Math.min(limit, 100))
    .all() as Array<{
    replayId: string;
    appId: string;
    issueId?: string;
    segmentCount: number;
    startAt?: number;
    endAt?: number;
    sizeBytes: number;
  }>;
}
