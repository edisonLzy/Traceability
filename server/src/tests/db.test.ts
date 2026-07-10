import { describe, it, expect } from 'vitest'
import { openDb } from '../store/db.js'

describe('openDb', () => {
  it('creates all tables on a fresh in-memory db', () => {
    const db = openDb(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain('applications')
    expect(names).toContain('issues')
    expect(names).toContain('events')
    expect(names).toContain('performance_samples')
    expect(names).toContain('source_maps')
    expect(names).toContain('rrweb_replays')
    expect(names).toContain('patches')
    db.close()
  })

  it('enforces unique (app_id, fingerprint) on issues', () => {
    const db = openDb(':memory:')
    // Parent application row required: better-sqlite3 enables foreign_keys by
    // default, so an issues row referencing a missing app_id fails the FK
    // constraint before the unique index can be exercised.
    db.prepare(
      `INSERT INTO applications (id, name, repo_url, default_branch, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('app1', 'App One', 'https://example.com/repo.git', 'main', '2026-01-01T00:00:00Z')
    const insert = db.prepare(
      `INSERT INTO issues (id, app_id, fingerprint, title, type, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run('i1', 'app1', 'fp1', 't', 'error', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
    expect(() =>
      insert.run('i2', 'app1', 'fp1', 't', 'error', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ).toThrowError(/UNIQUE/i)
    db.close()
  })
})
