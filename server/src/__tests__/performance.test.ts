import { describe, it, expect } from 'vitest'
import { openDb } from '../db.js'
import { createAppsRepo } from '../domains/apps/db.js'
import { createPerformanceRepo } from '../domains/performance/db.js'

describe('performance repo', () => {
  it('aggregates metric samples by application with average and p75', () => {
    const db = openDb(':memory:')
    const app = createAppsRepo(db).create({ name: 'Portal', repoUrl: 'git@x:portal.git', defaultBranch: 'main' })
    createAppsRepo(db).create({ name: 'No samples', repoUrl: 'git@x:empty.git', defaultBranch: 'main' })
    const repo = createPerformanceRepo(db)
    expect(repo.record(app.id, [
      { name: 'FCP', value: 100, unit: 'millisecond' },
      { name: 'FCP', value: 200, unit: 'millisecond' },
      { name: 'FCP', value: 300, unit: 'millisecond' },
      { name: 'CLS', value: 0.1, unit: 'score' },
    ])).toBe(4)

    const summary = repo.summary({ hours: 1 })
    expect(summary.apps).toHaveLength(2)
    const portal = summary.apps.find((item) => item.appName === 'Portal')!
    const noSamples = summary.apps.find((item) => item.appName === 'No samples')!
    expect(portal.metrics.FCP).toMatchObject({ count: 3, average: 200, p75: 300, unit: 'millisecond' })
    expect(noSamples).toMatchObject({ samples: 0, metrics: {} })
    db.close()
  })
})
