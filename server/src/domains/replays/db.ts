import { sqliteTable, text, integer, blob, index, primaryKey } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const replays = sqliteTable(
  "replays",
  {
    replayId: text("replay_id").primaryKey(),
    appId: text("app_id").notNull(),
    issueId: text("issue_id"),
    firstSeenAt: text("first_seen_at"),
    lastSeenAt: text("last_seen_at"),
    startAt: integer("start_at"),
    endAt: integer("end_at"),
    segmentCount: integer("segment_count").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    metadata: text("metadata"),
  },
  (table) => [
    index("idx_replays_issue_id").on(table.issueId),
    index("idx_replays_app_id").on(table.appId),
  ],
);

export const replaySegments = sqliteTable(
  "replay_segments",
  {
    replayId: text("replay_id").notNull(),
    segmentId: integer("segment_id").notNull(),
    payload: blob("payload", { mode: "buffer" }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    receivedAt: text("received_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.replayId, table.segmentId] }),
  }),
);

export const { db } = createDbClient({ replays, replaySegments });
