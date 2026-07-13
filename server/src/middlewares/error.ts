import type { Request, Response, NextFunction } from 'express'
import { getTraceId } from '../shared/index.js'
import { AppError } from '../errors/app-error.js'
import type { ApiResponse } from '../types/index.js'

export function createGlobalErrorHandlerMiddleware() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let statusCode = 500
    let code = 500
    let message = 'Internal Server Error'

    if (err instanceof AppError) {
      statusCode = err.statusCode
      message = err.message
      code = err.code ?? err.statusCode
    } else if (err instanceof Error) {
      message = err.message
    }

    const response: ApiResponse<null> = {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      traceId: getTraceId(),
    }
    res.status(statusCode).json(response)
  }
}
