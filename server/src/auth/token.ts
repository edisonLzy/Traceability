import type { FastifyReply, FastifyRequest } from 'fastify'

export function createAuthPlugin(expectedToken: string) {
  return function authHook(req: FastifyRequest, reply: FastifyReply, done: () => void) {
    // Bearer token from Authorization header, or `?token=` query (for WS upgrade)
    const header = req.headers.authorization
    let token: string | undefined
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7)
    } else if (typeof req.query === 'object' && req.query !== null && 'token' in req.query) {
      token = String((req.query as Record<string, unknown>).token)
    }
    if (token !== expectedToken) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    done()
  }
}
