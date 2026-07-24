import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export interface PostgresDatabase {
  db: NodePgDatabase<typeof schema>;
  close(): Promise<void>;
  ping(): Promise<void>;
}

export interface CreatePostgresDatabaseOptions {
  connectionString: string;
  maxConnections: number;
}

export function createPostgresDatabase(options: CreatePostgresDatabaseOptions): PostgresDatabase {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections,
  });

  return {
    db: drizzle({ client: pool, schema }),
    async close() {
      await pool.end();
    },
    async ping() {
      await pool.query("select 1");
    },
  };
}
