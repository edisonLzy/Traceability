import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { getConfig } from "../config.js";

const connections = new Map<string, Database.Database>();

export function createDbClient<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  dbPath?: string,
) {
  const path = dbPath ?? getConfig().dbPath;
  if (!connections.has(path)) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    connections.set(path, sqlite);
  }
  const sqlite = connections.get(path)!;
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** Reset cached connections — used by tests to isolate between files. */
export function resetConnections() {
  for (const [_key, sqlite] of connections) sqlite.close();
  connections.clear();
}
