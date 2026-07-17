import type { Request } from "express";

import { AppError } from "../errors/app-error.js";

/** Return a required route parameter with a useful error if a route is misconfigured. */
export function requirePathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (!value) {
    throw new AppError(`Missing required path parameter: ${name}`, 400, 400);
  }
  return value;
}
