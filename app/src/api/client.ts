import { getToken, getServer } from '../auth/token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const server = getServer()
  if (!token || !server) throw new ApiError(401, 'not authenticated')
  const res = await fetch(`${server.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
