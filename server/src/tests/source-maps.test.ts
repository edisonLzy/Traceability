import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { SourceMapGenerator } from 'source-map-js'
import { openDb } from '../db.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'
import { AppError } from '../errors/app-error.js'

let db: Database
beforeEach(() => { db = openDb(':memory:') })

// Insert an application row directly so this test stays independent of the
// apps domain (created in a later task). source_maps has an FK to applications.
function seedApp(db: Database, id = 'app-1'): string {
  db.prepare("INSERT INTO applications (id, name, repo_url, default_branch, created_at) VALUES (?, 'A', 'git@x:a', 'main', '2026-01-01T00:00:00Z')").run(id)
  return id
}

describe('source-maps service', () => {
  it('rejects invalid upload with AppError 400', () => {
    const svc = createSourceMapsService(db)
    expect(() => svc.upsert('app', { file: '', sourceMap: {} } as any)).toThrow(AppError)
  })

  it('resolves a frame through an uploaded map', () => {
    const appId = seedApp(db)
    const svc = createSourceMapsService(db)
    const gen = new SourceMapGenerator({ file: 'app.min.js' })
    gen.addMapping({ generated: { line: 1, column: 0 }, original: { line: 10, column: 4 }, source: 'app.ts' })
    gen.setSourceContent('app.ts', 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\n')
    svc.upsert(appId, { file: 'app.min.js', sourceMap: JSON.parse(gen.toString()) })
    const [resolved] = svc.resolveFrames(appId, undefined, [{ filename: 'app.min.js', lineno: 1, colno: 1 }])
    expect(resolved?.file).toBe('app.ts')
    expect(resolved?.line).toBe(10)
  })
})
