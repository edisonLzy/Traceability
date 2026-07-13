import axios from 'axios'
import { SERVER_URL } from '@renderer/lib/server'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Shared axios instance for the renderer.
 *
 * The backend address (`SERVER_URL`) is read from `VITE_SERVER_URL` at build
 * time. The server returns bare JSON (no `{ code, data }` envelope), so
 * responses are not unwrapped here -- callers read `response.data`. Errors are
 * normalized into {@link ApiError}; UI toast handling stays at the call site /
 * react-query `onError`, keeping the transport layer free of UI coupling.
 */
export const request = axios.create({ baseURL: SERVER_URL })

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
