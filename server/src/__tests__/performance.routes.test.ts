import type { Database } from "better-sqlite3";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { openDb } from "../db.js";
import { createAppsService } from "../domains/apps/service.js";
import { createPerformanceRouter } from "../domains/performance/routes.js";
import { createPerformanceService } from "../domains/performance/service.js";
import { createSourceMapsService } from "../domains/source-maps/service.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

let app: express.Express;
let appId: string;
beforeEach(() => {
  const db: Database = openDb(":memory:");
  const appsService = createAppsService(db, createSourceMapsService(db));
  appId = appsService.create({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" }).id;
  const performanceService = createPerformanceService(db, appsService);
  app = express();
  app.use(express.json());
  app.use(createResponseMiddleware());
  app.use(createPerformanceRouter({ performanceService }));
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("performance routes", () => {
  it("POST /api/ingest/performance/:appId 404 when app missing", async () => {
    const r = await request(app)
      .post("/api/ingest/performance/nope")
      .send({ name: "LCP", value: 1 });
    expect(r.status).toBe(404);
  });

  it("POST /api/ingest/performance/:appId 202 and GET summary", async () => {
    const r = await request(app)
      .post(`/api/ingest/performance/${appId}`)
      .send({ name: "LCP", value: 1200 });
    expect(r.status).toBe(202);
    expect(r.body.data).toEqual({ accepted: 1 });
    const s = await request(app).get(`/api/performance?appId=${appId}`);
    expect(s.status).toBe(200);
    expect(s.body.data.apps[0].metrics.LCP.count).toBe(1);
  });
});
