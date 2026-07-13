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
 * The backend wraps every success response in `{code, data, timestamp}`; this
 * interceptor unwraps it so callers read the inner `data` via `response.data`.
 * 204 responses carry no body and are left untouched. Errors are normalized into
 * {@link ApiError}; the server error envelope carries `message`, which the
 * interceptor reads directly.
 */
export const request = axios.create({ baseURL: SERVER_URL })

request.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      response.data = body.data
    }
    return response
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const payload = error.response?.data
      const message = typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : error.message ?? 'request failed'
      return Promise.reject(new ApiError(status, message))
    }
    return Promise.reject(error)
  },
)
