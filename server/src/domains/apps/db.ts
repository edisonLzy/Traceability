import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url").notNull(),
  defaultBranch: text("default_branch").notNull(),
  createdAt: text("created_at").notNull(),
});

export const { db } = createDbClient({ applications });
