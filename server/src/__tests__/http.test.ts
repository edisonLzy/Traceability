import request from "supertest";
import { describe, it, expect, vi } from "vitest";

import { openDb } from "../db.js";
import { createApp } from "../index.js";
import { createBroadcaster } from "../ws/broadcaster.js";

// Silence the request logger during these integration tests
vi.hoisted(() => {
  process.env.LOG_LEVEL = "silent";
});
const app = createApp(openDb(":memory:"), createBroadcaster());

describe("http integration", () => {
  it("GET /health returns 200 envelope", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ code: 0, data: "ok" });
  });

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

  it("GET /api-docs serves the swagger UI (200)", async () => {
    const r = await request(app).get("/api-docs/");
    expect(r.status).toBe(200);
  });

  it("GET /api-docs.json exposes openapi paths", async () => {
    const r = await request(app).get("/api-docs.json");
    expect(r.status).toBe(200);
    expect(r.body.paths["/health"]).toBeDefined();
    expect(r.body.paths["/api/apps"]).toBeDefined();
  });
});
