import { describe, it, expect } from 'vitest'
import { SourceMapGenerator } from 'source-map-js'
import { openDb } from '../store/db.js'
import { createAppsRepo } from '../store/apps.js'
import { createSourceMapsRepo } from '../store/sourceMaps.js'

describe('source map repository', () => {
  it('resolves a generated stack frame to source content', () => {
    const db = openDb(':memory:')
    const app = createAppsRepo(db).create({ name: 'Portal', repoUrl: 'git@x:portal.git', defaultBranch: 'main' })
    const generator = new SourceMapGenerator({ file: 'assets/app-123.js' })
    generator.addMapping({ generated: { line: 1, column: 10 }, source: 'src/demo.ts', original: { line: 7, column: 4 }, name: 'explode' })
    generator.setSourceContent('src/demo.ts', 'one\ntwo\nthree\nfour\nfive\nsix\nthrow explode()\neight\nnine')

    const repo = createSourceMapsRepo(db)
    repo.upsert(app.id, { release: 'preview', file: 'assets/app-123.js', sourceMap: JSON.parse(generator.toString()) })
    const frames = repo.resolveFrames(app.id, 'preview', [{ filename: 'http://localhost:4174/assets/app-123.js', lineno: 1, colno: 11 }])

    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ file: 'src/demo.ts', line: 7, column: 5, function: 'explode' })
    expect(frames[0]!.context?.lines).toContain('throw explode()')
    db.close()
  })
})
