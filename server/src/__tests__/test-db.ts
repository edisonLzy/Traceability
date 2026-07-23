import Database from "better-sqlite3";

import { createDbClient } from "../db/client.js";

const DDL = `
  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, repo_url TEXT NOT NULL,
    default_branch TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY, app_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    title TEXT NOT NULL, type TEXT NOT NULL, first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open', metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_issues_app_id ON issues(app_id);
  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_app_fingerprint ON issues(app_id, fingerprint);
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, received_at TEXT NOT NULL,
    envelope TEXT NOT NULL, FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_events_issue_id ON events(issue_id);
  CREATE TABLE IF NOT EXISTS performance_samples (
    id TEXT PRIMARY KEY, app_id TEXT NOT NULL, metric TEXT NOT NULL,
    value REAL NOT NULL, unit TEXT NOT NULL DEFAULT 'millisecond',
    measured_at TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_performance_samples_app_time ON performance_samples(app_id, measured_at DESC);
  CREATE TABLE IF NOT EXISTS source_maps (
    id TEXT PRIMARY KEY, app_id TEXT NOT NULL, release TEXT NOT NULL DEFAULT '',
    file TEXT NOT NULL, source_map TEXT NOT NULL, uploaded_at TEXT NOT NULL,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    UNIQUE(app_id, release, file)
  );
  CREATE INDEX IF NOT EXISTS idx_source_maps_lookup ON source_maps(app_id, release, file);
  CREATE TABLE IF NOT EXISTS replays (
    replay_id TEXT PRIMARY KEY, app_id TEXT NOT NULL, issue_id TEXT,
    first_seen_at TEXT, last_seen_at TEXT, start_at INTEGER, end_at INTEGER,
    segment_count INTEGER NOT NULL DEFAULT 0, size_bytes INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_replays_issue_id ON replays(issue_id);
  CREATE INDEX IF NOT EXISTS idx_replays_app_id ON replays(app_id);
  CREATE TABLE IF NOT EXISTS replay_segments (
    replay_id TEXT NOT NULL, segment_id INTEGER NOT NULL,
    payload BLOB NOT NULL, size_bytes INTEGER NOT NULL, received_at TEXT NOT NULL,
    PRIMARY KEY (replay_id, segment_id),
    FOREIGN KEY (replay_id) REFERENCES replays(replay_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS patches (
    id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, branch TEXT NOT NULL,
    file_path TEXT NOT NULL, attached_at TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  );
`;

/**
 * Initialize an in-memory SQLite database for testing.
 * Must be the FIRST import in any test file that accesses the database.
 * This sets the env var and primes the connection map so domain db.ts
 * modules reuse this connection when they evaluate.
 */
process.env.TRACEABILITY_DB_PATH = ":memory:";
const { sqlite } = createDbClient({}, ":memory:");
sqlite.exec("PRAGMA foreign_keys = OFF");
sqlite.exec(DDL);
