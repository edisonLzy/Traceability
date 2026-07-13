import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createResponseMiddleware } from '../middlewares/response.js'

describe('response middleware', () => {
  it('wraps data in {code:0, data, timestamp} with 200 by default', async () => {
    const app = express()
    app.use(createResponseMiddleware())
    app.get('/x', (req, res) => res.success({ id: 1 }))
    const r = await request(app).get('/x')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ code: 0, data: { id: 1 }, timestamp: expect.any(String) })
  })

  it('honours a custom status (201)', async () => {
    const app = express()
    app.use(createResponseMiddleware())
    app.post('/x', (req, res) => res.success({ ok: true }, 201))
    const r = await request(app).post('/x')
    expect(r.status).toBe(201)
    expect(r.body.code).toBe(0)
    expect(r.body.data).toEqual({ ok: true })
  })
})
