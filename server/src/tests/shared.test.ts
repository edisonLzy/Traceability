import { describe, it, expect } from 'vitest'
import { getTraceId, isMainModule } from '../shared/index.js'

describe('shared utils', () => {
  it('getTraceId returns undefined outside a request context', () => {
    expect(getTraceId()).toBeUndefined()
  })

  it('isMainModule returns false for a non-entry url', () => {
    expect(isMainModule('file:///not/the/entry.ts')).toBe(false)
  })
})
