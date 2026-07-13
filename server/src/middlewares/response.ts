import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse } from '../types/index.js'

export function createResponseMiddleware() {
  return (_: Request, res: Response, next: NextFunction) => {
    res.success = function <T>(data: T, status = 200) {
      const response: ApiResponse<T> = {
        code: 0,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(status).json(response)
    }
    next()
  }
}
