import type { PerformanceMetric, PerformanceSummary } from "@traceability/protocol";
import type { Database } from "better-sqlite3";

import { AppError } from "../../errors/app-error.js";
import type { AppsService } from "../apps/service.js";
import { createPerformanceRepo } from "./db.js";

export interface PerformanceService {
  record(
    appId: string,
    body: PerformanceMetric | { metrics?: PerformanceMetric[] },
  ): { accepted: number };
  summary(opts: { appId?: string; hours?: number }): PerformanceSummary;
}

export function createPerformanceService(db: Database, apps: AppsService): PerformanceService {
  const repo = createPerformanceRepo(db);
  return {
    record: (appId, body) => {
      apps.get(appId); // throws 404 if missing
      const metrics: PerformanceMetric[] =
        body && typeof body === "object" && "metrics" in body
          ? (body.metrics ?? [])
          : [body as PerformanceMetric];
      return { accepted: repo.record(appId, metrics) };
    },
    summary: (opts) => repo.summary(opts),
  };
}
