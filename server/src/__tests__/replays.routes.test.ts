import "./test-db.js";
import express from "express";
import supertest from "supertest";
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
  const created = createApp({ name: "R", repoUrl: "git@x:r", defaultBranch: "main" });
  appId = created.id;
  const { issue } = ingestEvent(
    appId,
    { event_id: "re", exception: { values: [{ type: "Err", value: "r" }] } },
    [],
  );
  issueId = issue.id;
  app = express();
  app.use(createResponseMiddleware());
  app.use(replaysRouter);
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("replays routes", () => {
  it("GET /api/issues/:id/replays returns 200 for valid issue", async () => {
    const list = await supertest(app).get(`/api/issues/${issueId}/replays`).expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
  });

  it("GET /api/issues/:id/replays/:replayId returns 404 when missing", async () => {
    await supertest(app).get(`/api/issues/${issueId}/replays/nonexistent`).expect(404);
  });
});
