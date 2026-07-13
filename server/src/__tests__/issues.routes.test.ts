import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { CreateAppSchema, createApp } from "../domains/apps/service.js";
import { router as issuesRouter } from "../domains/issues/router.js";
import { ingestEvent } from "../domains/issues/service.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

vi.mock("../ws/broadcaster.js", () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  subscriberCount: vi.fn(),
  resetBroadcaster: vi.fn(),
  attachWebSocket: vi.fn(),
}));

let app: express.Express;
let issueId: string;
beforeEach(() => {
  const created = createApp({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
  const { issue } = ingestEvent(created.id, {
    type: "error",
    exception: { values: [{ type: "TypeError", value: "x" }] },
  } as any);
  issueId = issue.id;
  app = express();
  app.use(express.json());
  app.use(createResponseMiddleware());
  app.use(issuesRouter);
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("issues routes", () => {
  it("GET /api/issues returns envelope with items", async () => {
    const r = await request(app).get("/api/issues");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe(0);
    expect(r.body.data.items).toHaveLength(1);
  });

  it("GET /api/issues/:id 404 envelope", async () => {
    const r = await request(app).get("/api/issues/nope");
    expect(r.status).toBe(404);
  });

  it("POST /api/issues/:id/fix-request", async () => {
    const r = await request(app).post(`/api/issues/${issueId}/fix-request`);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe("fix-manual");
  });

  it("POST /api/issues/:id/attach-patch 400 when missing fields", async () => {
    const r = await request(app).post(`/api/issues/${issueId}/attach-patch`).send({});
    expect(r.status).toBe(400);
  });
});
