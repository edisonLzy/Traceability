import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { router as performanceRouter } from "../domains/performance/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

let app: express.Express;
let appId: string;
beforeEach(() => {
  appId = createApp({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" }).id;
  app = express();
  app.use(express.json());
  app.use(createResponseMiddleware());
  app.use(performanceRouter);
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
