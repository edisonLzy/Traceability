import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";

import { router as appsRouter } from "../domains/apps/router.js";
import { router as ingestRouter } from "../domains/ingest/router.js";
import { router as issuesRouter } from "../domains/issues/router.js";
import { router as performanceRouter } from "../domains/performance/router.js";
import { router as replaysRouter } from "../domains/replays/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "silent";
});

const app = express();
app.use(express.json({ limit: "6mb" }));
app.use(createResponseMiddleware());
app.use(appsRouter);
app.use(issuesRouter);
app.use(replaysRouter);
app.use(performanceRouter);
app.use(ingestRouter);
app.use(createGlobalErrorHandlerMiddleware());

describe("http integration", () => {
  it("GET /api/apps returns 200 envelope with array data", async () => {
    const r = await request(app).get("/api/apps");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe(0);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it("GET /api/apps/nope returns 404 envelope", async () => {
    const r = await request(app).get("/api/apps/nope");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: 404, data: null });
  });
});
