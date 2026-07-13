import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const rrwebReplays = sqliteTable(
  "rrweb_replays",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    issueId: text("issue_id"),
    sentryEventId: text("sentry_event_id"),
    receivedAt: text("received_at").notNull(),
    capturedAt: text("captured_at"),
    startAt: integer("start_at"),
    endAt: integer("end_at"),
    eventCount: integer("event_count").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    payload: text("payload").notNull().default("[]"),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [
    index("idx_rrweb_replays_issue_id").on(table.issueId),
    index("idx_rrweb_replays_app_id").on(table.appId),
    index("idx_rrweb_replays_sentry_event_id").on(table.sentryEventId),
  ],
);

export const { db } = createDbClient({ rrwebReplays });
