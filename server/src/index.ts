import "dotenv/config";
import { createServer } from "node:http";

import cors from "cors";
import express from "express";

import { getConfig } from "./config.js";
import { router as appsRouter } from "./domains/apps/router.js";
import { router as ingestRouter } from "./domains/ingest/router.js";
import { router as issuesRouter } from "./domains/issues/router.js";
import { router as performanceRouter } from "./domains/performance/router.js";
import { router as replaysRouter } from "./domains/replays/router.js";
import { createGlobalErrorHandlerMiddleware } from "./middlewares/error.js";
import { createResponseMiddleware } from "./middlewares/response.js";
import { createSwaggerMiddleware } from "./middlewares/swagger.js";
import { healthRouter } from "./routes/health.js";
import { createLogger, createRequestLoggerMiddleware, isMainModule } from "./shared/index.js";
import { attachWebSocket } from "./ws/broadcaster.js";

const isProduction = process.env.NODE_ENV === "production";
const logger = createLogger("traceability-server");
const DEVELOPMENT_API_PATHS = ["./src/domains/**/router.ts", "./src/routes/**/*.ts"];
const PRODUCTION_API_PATHS = ["./dist/domains/**/router.js", "./dist/routes/**/*.js"];

function main() {
  const config = getConfig();
  const app = express();

  app.use(createRequestLoggerMiddleware(logger));
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: "6mb" }));
  app.use(createResponseMiddleware());

  createSwaggerMiddleware({
    apiPaths: isProduction ? PRODUCTION_API_PATHS : DEVELOPMENT_API_PATHS,
    docsRoute: "/api-docs",
    title: "Traceability Server API",
    version: "1.0.0",
    description: "Sentry-based web monitoring + exception-to-fix loop",
    serverUrl: process.env.SERVER_URL,
  })(app);

  app.use(healthRouter);
  app.use(appsRouter);
  app.use(issuesRouter);
  app.use(replaysRouter);
  app.use(performanceRouter);
  app.use(ingestRouter);

  app.use(createGlobalErrorHandlerMiddleware());

  const server = createServer(app);
  attachWebSocket(server);

  server.listen(config.port, "0.0.0.0", () => {
    logger.info(`traceability server on http://0.0.0.0:${config.port}`);
    logger.info(`Swagger Docs at http://0.0.0.0:${config.port}/api-docs`);
  });
}

if (isMainModule(import.meta.url)) main();
