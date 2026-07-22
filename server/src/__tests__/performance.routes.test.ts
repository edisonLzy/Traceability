import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { router as performanceRouter } from "../domains/performance/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

let app: express.Express;
beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use(createResponseMiddleware());
  app.use(performanceRouter);
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("performance routes", () => {
  it("GET /api/performance returns 200 with empty summary", async () => {
    const s = await request(app).get("/api/performance");
    expect(s.status).toBe(200);
    expect(s.body.data.apps).toEqual([]);
  });
});
