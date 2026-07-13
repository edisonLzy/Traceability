import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import { AppError } from "../errors/app-error.js";
import { createGlobalErrorHandlerMiddleware } from "../middlewares/error.js";
import { createResponseMiddleware } from "../middlewares/response.js";

function build() {
  const app = express();
  app.use(createResponseMiddleware());
  app.get("/boom", () => {
    throw new AppError("not found", 404, 404);
  });
  app.get("/crash", () => {
    throw new Error("kaboom");
  });
  app.use(createGlobalErrorHandlerMiddleware());
  return app;
}

describe("global error handler", () => {
  it("maps AppError to its statusCode/code/message", async () => {
    const r = await request(build()).get("/boom");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: 404, message: "not found", data: null });
    expect(r.body.timestamp).toEqual(expect.any(String));
  });

  it("maps unknown errors to 500", async () => {
    const r = await request(build()).get("/crash");
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: 500, message: "kaboom", data: null });
  });
});
