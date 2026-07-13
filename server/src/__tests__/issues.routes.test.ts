import type { Database } from "better-sqlite3";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { openDb } from "../db.js";
import { createAppsRepo } from "../domains/apps/db.js";
import { createIssuesRouter } from "../domains/issues/routes.js";
import { createIssuesService } from "../domains/issues/service.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";
import { createBroadcaster, type Broadcaster } from "../ws/broadcaster.js";

let app: express.Express;
let bc: Broadcaster;
let issueId: string;
beforeEach(async () => {
  const db: Database = openDb(":memory:");
  bc = createBroadcaster();
  bc.broadcast = vi.fn();
  const apps = createAppsRepo(db);
  const created = apps.create({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
  const issuesService = createIssuesService(db, bc);
  const { issue } = issuesService.ingestEvent(created.id, {
    type: "error",
    exception: { values: [{ type: "TypeError", value: "x" }] },
  });
  issueId = issue.id;
  app = express();
  app.use(express.json());
  app.use(createResponseMiddleware());
  app.use(createIssuesRouter({ issuesService }));
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

  it("POST /api/issues/:id/fix-request broadcasts status-changed", async () => {
    const r = await request(app).post(`/api/issues/${issueId}/fix-request`);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe("fix-manual");
    expect(bc.broadcast).toHaveBeenCalled();
  });

  it("POST /api/issues/:id/attach-patch 400 when missing fields", async () => {
    const r = await request(app).post(`/api/issues/${issueId}/attach-patch`).send({});
    expect(r.status).toBe(400);
  });
});
