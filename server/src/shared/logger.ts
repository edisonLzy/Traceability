import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";

const isDev = process.env.NODE_ENV !== "production";
// pino-pretty spawns a worker-thread transport; avoid it under vitest so the
// test process can exit cleanly.
const isTest = process.env.NODE_ENV === "test";

const TRACE_HEADER_KEY = "x-request-id";

interface LoggerContext {
  traceId?: string;
  [key: string]: unknown;
}

const asyncLocalStorage = new AsyncLocalStorage<LoggerContext>();

export interface LoggerOptions {
  serviceName: string;
}

export function createLogger(serviceName: string) {
  return pino({
    level: process.env.LOG_LEVEL || "info",
    mixin() {
      const traceId = getTraceId();
      return traceId ? { traceId } : {};
    },
    redact: {
      paths: ["req.headers.authorization", "password", "token", "secret"],
      censor: "***",
    },
    transport:
      isDev && !isTest
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
              messageFormat: `[${serviceName}] {msg}`,
            },
          }
        : undefined,
    base: { service: serviceName, pid: process.pid },
  });
}

export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId;
}

export function getLoggerTraceIdHeader(): Record<string, string> {
  const traceId = getTraceId();
  return traceId ? { [TRACE_HEADER_KEY]: traceId } : {};
}

export function createRequestLoggerMiddleware(logger: pino.Logger) {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => (req.headers[TRACE_HEADER_KEY] as string) || randomUUID(),
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customAttributeKeys: { req: "req", res: "res", err: "err", responseTime: "responseTime" },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    httpLogger(req, res, () => {
      const traceId = req.id as string;
      res.setHeader(TRACE_HEADER_KEY, traceId);
      asyncLocalStorage.run({ traceId }, () => next());
    });
  };
}
