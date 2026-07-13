import { getConfig } from './config.js'

export interface ApiOptions {
  json?: boolean
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig()
  const res = await fetch(`${cfg.server.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      // Only send Content-Type: application/json when there is a body.
      // Fastify rejects bodyless POSTs (e.g. fix-request, mark-fixed) with
      // FST_ERR_CTP_EMPTY_JSON_BODY if the header claims JSON.
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  const envelope = (await res.json()) as { code: number; data: T }
  return envelope.data
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
