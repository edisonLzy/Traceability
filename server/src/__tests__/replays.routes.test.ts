import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { ingestEvent } from "../domains/issues/service.js";
import { router as replaysRouter } from "../domains/replays/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

let app: express.Express;
let appId: string;
let issueId: string;
beforeEach(() => {
  const created = createApp({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
  appId = created.id;
  const { issue } = ingestEvent(created.id, {
    type: "error",
    exception: { values: [{ type: "E", value: "x" }] },
  } as any);
  issueId = issue.id;
  app = express();
  app.use(express.json({ limit: "6mb" }));
  app.use(createResponseMiddleware());
  app.use(replaysRouter);
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
      .send({ events: [{ type: 2 }] });
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
