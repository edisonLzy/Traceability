import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
    count: integer("count").notNull().default(1),
    status: text("status").notNull().default("open"),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [
    index("idx_issues_app_id").on(table.appId),
    index("idx_issues_status").on(table.status),
    uniqueIndex("idx_issues_app_fingerprint").on(table.appId, table.fingerprint),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id").notNull(),
    receivedAt: text("received_at").notNull(),
    envelope: text("envelope").notNull(),
  },
  (table) => [index("idx_events_issue_id").on(table.issueId)],
);

export const patches = sqliteTable("patches", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  branch: text("branch").notNull(),
  filePath: text("file_path").notNull(),
  attachedAt: text("attached_at").notNull(),
});

export const { db } = createDbClient({ issues, events, patches });
