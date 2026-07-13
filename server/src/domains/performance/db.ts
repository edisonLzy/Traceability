import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";

import { createDbClient } from "../../db/client.js";

export const performanceSamples = sqliteTable(
  "performance_samples",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull().default("millisecond"),
    measuredAt: text("measured_at").notNull(),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [index("idx_performance_samples_app_time").on(table.appId, table.measuredAt)],
);

export const { db } = createDbClient({ performanceSamples });
