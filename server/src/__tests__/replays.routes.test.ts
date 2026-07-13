import type { Database } from "better-sqlite3";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { openDb } from "../db.js";
import { createAppsRepo } from "../domains/apps/db.js";
import { createIssuesService } from "../domains/issues/service.js";
import { createReplaysRouter } from "../domains/replays/routes.js";
import { createReplaysService } from "../domains/replays/service.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";
import { createBroadcaster } from "../ws/broadcaster.js";

let app: express.Express;
let appId: string;
let issueId: string;
beforeEach(() => {
  const db: Database = openDb(":memory:");
  const apps = createAppsRepo(db);
  const created = apps.create({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
  appId = created.id;
  const issues = createIssuesService(db, createBroadcaster());
  const { issue } = issues.ingestEvent(created.id, {
    type: "error",
    exception: { values: [{ type: "E", value: "x" }] },
  });
  issueId = issue.id;
  const replaysService = createReplaysService(db, issues);
  app = express();
  app.use(express.json({ limit: "6mb" }));
  app.use(createResponseMiddleware());
  app.use(createReplaysRouter({ replaysService }));
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("replays routes", () => {
  it("POST /api/ingest/rrweb/:appId 400 when events missing", async () => {
    const r = await request(app).post(`/api/ingest/rrweb/${appId}`).send({ events: [] });
    expect(r.status).toBe(400);
  });

  it("POST /api/ingest/rrweb/:appId 201 and GET list", async () => {
    const r = await request(app)
      .post(`/api/ingest/rrweb/${appId}`)
      .send({ events: [{ type: 2 } as any] });
    expect(r.status).toBe(201);
    const list = await request(app).get(`/api/issues/${issueId}/replays`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });

  it("GET /api/issues/:id/replays 404 when issue missing", async () => {
    const r = await request(app).get("/api/issues/nope/replays");
    expect(r.status).toBe(404);
  });
});
