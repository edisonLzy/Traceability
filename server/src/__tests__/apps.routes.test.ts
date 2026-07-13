import "./test-db.js";
import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import { router as appsRouter } from "../domains/apps/router.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

const app = express();
app.use(express.json());
app.use(createResponseMiddleware());
app.use(appsRouter);
app.use(createGlobalErrorHandlerMiddleware());

describe("apps routes", () => {
  it("POST /api/apps validates and returns 201 envelope", async () => {
    const r = await request(app)
      .post("/api/apps")
      .send({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      code: 0,
      data: { name: "A", repoUrl: "git@x:a", defaultBranch: "main" },
    });
    expect(r.body.data.id).toEqual(expect.any(String));
  });

  it("POST /api/apps 400 when fields missing", async () => {
    const r = await request(app).post("/api/apps").send({ name: "A" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 400, data: null });
  });

  it("GET /api/apps/:id returns 200 when found", async () => {
    const created = await request(app)
      .post("/api/apps")
      .send({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
    const r = await request(app).get(`/api/apps/${created.body.data.id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.name).toBe("A");
  });

  it("GET /api/apps/:id returns 404 envelope", async () => {
    const r = await request(app).get("/api/apps/nope");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: 404, data: null });
  });

  it("DELETE /api/apps/:id returns 204 with no body", async () => {
    const created = await request(app)
      .post("/api/apps")
      .send({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
    const r = await request(app).delete(`/api/apps/${created.body.data.id}`);
    expect(r.status).toBe(204);
    expect(r.text).toBe("");
  });

  it("POST /api/apps/:id/sourcemaps 404 when app missing", async () => {
    const r = await request(app)
      .post("/api/apps/nope/sourcemaps")
      .send({ file: "a.js", sourceMap: {} });
    expect(r.status).toBe(404);
  });
});
