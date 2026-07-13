import type { Express } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

export interface SwaggerMiddlewareOptions {
  apiPaths: string[];
  docsRoute: string;
  title: string;
  version: string;
  description: string;
  serverUrl?: string;
}

export function createSwaggerMiddleware(options: SwaggerMiddlewareOptions) {
  return (app: Express) => {
    const { apiPaths, docsRoute, title, version, description, serverUrl } = options;
    const servers = serverUrl ? [{ url: serverUrl }] : [{ url: "/" }];
    const swaggerDocs = swaggerJsdoc({
      definition: { openapi: "3.0.0", info: { title, version, description }, servers },
      apis: apiPaths,
    });
    app.get(`${docsRoute}.json`, (_req, res) => res.json(swaggerDocs));
    app.use(
      docsRoute,
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocs, { swaggerOptions: { persistAuthorization: true } }),
    );
  };
}
