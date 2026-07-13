import { describe, it, expect } from 'vitest'
import { AppError } from '../errors/app-error.js'

describe('AppError', () => {
  it('carries statusCode and optional code', () => {
    const err = new AppError('not found', 404, 404)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe(404)
    expect(err.message).toBe('not found')
    expect(err.name).toBe('AppError')
  })

  it('defaults statusCode to 500 and code to undefined', () => {
    const err = new AppError('boom')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBeUndefined()
  })
})
