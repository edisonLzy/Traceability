import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { router as ingestRouter } from "../domains/ingest/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

let app: express.Express;
let appId: string;

function envelope(): string {
  const header = JSON.stringify({ event_id: "e1", sent_at: new Date().toISOString() });
  const itemHeader = JSON.stringify({ type: "event" });
  const itemPayload = JSON.stringify({
    event_id: "e1",
    type: "error",
    exception: { values: [{ type: "TypeError", value: "boom" }] },
  });
  return [header, itemHeader, itemPayload].join("\n");
}

beforeEach(() => {
  appId = createApp({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" }).id;
  app = express();
  app.use(createResponseMiddleware());
  app.use(ingestRouter);
  app.use(createGlobalErrorHandlerMiddleware());
});

describe("ingest routes", () => {
  it("POST /api/ingest/envelope/:appId 400 on invalid envelope", async () => {
    const r = await request(app)
      .post(`/api/ingest/envelope/${appId}`)
      .set("Content-Type", "application/octet-stream")
      .send("not-json");
    expect(r.status).toBe(400);
  });

  it("POST /api/ingest/envelope/:appId 202 and creates an issue", async () => {
    const r = await request(app)
      .post(`/api/ingest/envelope/${appId}`)
      .set("Content-Type", "application/octet-stream")
      .send(envelope());
    expect(r.status).toBe(202);
    expect(r.body.data).toEqual({ accepted: 1 });
  });

  it("rejects empty body with 400", async () => {
    const r = await request(app)
      .post(`/api/ingest/envelope/${appId}`)
      .set("Content-Type", "application/octet-stream")
      .send("");
    expect(r.status).toBe(400);
  });
});
