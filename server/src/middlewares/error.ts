import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

import { AppError } from "../errors/app-error.js";
import { getTraceId } from "../shared/index.js";
import type { ApiResponse } from "../types/index.js";

/**
 * Wraps an async route handler so rejected promises are forwarded
 * to the global error handler via `next()`.
 *
 * Express 4 does not catch async handler rejections natively;
 * Express 5 does, and this helper bridges the gap.
 *
 * Usage:
 * ```ts
 * router.get('/path', asyncHandler(async (req, res) => {
 *   res.success(await someService())
 * }))
 * ```
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result instanceof Promise) result.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

export function createGlobalErrorHandlerMiddleware() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let statusCode = 500;
    let code = 500;
    let message = "Internal Server Error";

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      message = err.message;
      code = err.code ?? err.statusCode;
    } else if (err instanceof ZodError) {
      statusCode = 400;
      code = 400;
      message = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    } else if (err instanceof Error) {
      message = err.message;
    }

    const response: ApiResponse<null> = {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      traceId: getTraceId(),
    };
    res.status(statusCode).json(response);
  };
}
