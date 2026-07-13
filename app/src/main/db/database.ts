import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        model_provider_id TEXT,
        model_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_agent_sessions_app_updated ON agent_sessions(app_id, updated_at DESC);

      CREATE TABLE agent_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        token_usage_json TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(session_id, sequence)
      );
      CREATE INDEX idx_agent_entries_session_sequence ON agent_entries(session_id, sequence);

      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        user_entry_id TEXT NOT NULL REFERENCES agent_entries(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        partial_message_json TEXT,
        error_json TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX idx_agent_runs_session_started ON agent_runs(session_id, started_at DESC);

      CREATE TABLE agent_artifacts (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        content_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(session_id, id)
      );

      CREATE TABLE agent_hil_requests (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        request_json TEXT NOT NULL,
        resolution_json TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );

      CREATE TABLE desktop_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

export class LocalDatabase {
  readonly raw: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA journal_mode = WAL");
    this.raw.exec("PRAGMA foreign_keys = ON");
    this.raw.exec("PRAGMA busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.raw.close();
  }

  getSetting(key: string): string | null {
    const row = this.raw.prepare("SELECT value FROM desktop_settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.raw
      .prepare(`
      INSERT INTO desktop_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
      .run(key, value, Date.now());
  }

  deleteSetting(key: string): void {
    this.raw.prepare("DELETE FROM desktop_settings WHERE key = ?").run(key);
  }

  transaction<T>(operation: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    this.raw.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    const applied = new Set(
      (this.raw.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: number }>).map(
        (row) => row.id,
      ),
    );

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      this.transaction(() => {
        this.raw.exec(migration.sql);
        this.raw
          .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
          .run(migration.id, Date.now());
      });
    }
  }
}
