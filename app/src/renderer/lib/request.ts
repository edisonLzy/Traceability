import axios from 'axios'
import { getServer, getToken } from '@renderer/store/auth'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Shared axios instance for the renderer.
 *
 * Credentials (server URL + bearer token) live in the auth zustand store and
 * are only known after the user connects, so they are resolved per request in
 * the request interceptor rather than baked in at construction. The server
 * returns bare JSON (no `{ code, data }` envelope), so responses are not
 * unwrapped here -- callers read `response.data`. Errors are normalized into
 * {@link ApiError}; UI toast handling stays at the call site / react-query
 * `onError`, keeping the transport layer free of UI coupling.
 */
export const request = axios.create()

request.interceptors.request.use((config) => {
  const token = getToken()
  const server = getServer()
  if (!token || !server) throw new ApiError(401, 'not authenticated')
  config.baseURL = server.replace(/\/$/, '')
  config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const payload = error.response?.data
      const message = typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : error.message ?? 'request failed'
      return Promise.reject(new ApiError(status, message))
    }
    return Promise.reject(error)
  },
)
