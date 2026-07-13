import { Router } from 'express'

export const healthRouter: Router = Router()

/** @openapi /health: get: { tags: [Health], summary: Health check, responses: { 200: { description: ok } } } */
healthRouter.get('/health', (_req, res) => {
  res.success('ok')
})
