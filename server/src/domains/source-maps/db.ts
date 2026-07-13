import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const sourceMaps = sqliteTable(
  "source_maps",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    release: text("release").notNull().default(""),
    file: text("file").notNull(),
    sourceMap: text("source_map").notNull(),
    uploadedAt: text("uploaded_at").notNull(),
  },
  (table) => [uniqueIndex("idx_source_maps_lookup").on(table.appId, table.release, table.file)],
);

export const { db } = createDbClient({ sourceMaps });
