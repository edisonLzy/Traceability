import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import { createManagementAuth } from "../../infrastructure/auth/management-auth.js";
import { ProjectService } from "./service.js";

interface ProjectRouteDependencies {
  config: RuntimeConfig;
  database: PostgresDatabase;
}

export async function registerProjectRoutes(
  app: FastifyInstance,
  dependencies: ProjectRouteDependencies,
) {
  const service = new ProjectService(dependencies.database, dependencies.config);
  const authenticate = createManagementAuth(dependencies.config);
  const authenticated = { preHandler: authenticate };

  app.get("/api/v1/projects", authenticated, async () => ({ data: await service.listProjects() }));
  app.post("/api/v1/projects", authenticated, async (request, reply) => {
    const created = await service.createProject(request.body);
    return reply.code(201).send({ data: created });
  });
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId",
    authenticated,
    async (request, reply) => {
      const project = await service.getProject(request.params.projectId);
      return project ? { data: project } : reply.code(404).send({ code: "not_found" });
    },
  );
  app.patch<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId",
    authenticated,
    async (request, reply) => {
      const project = await service.updateProject(request.params.projectId, request.body);
      return project ? { data: project } : reply.code(404).send({ code: "not_found" });
    },
  );
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/keys",
    authenticated,
    async (request) => ({ data: await service.listKeys(request.params.projectId) }),
  );
  app.post<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/keys",
    authenticated,
    async (request, reply) => {
      const created = await service.createKey(request.params.projectId);
      return created
        ? reply.code(201).send({ data: created })
        : reply.code(404).send({ code: "not_found" });
    },
  );
  app.delete<{ Params: { projectId: string; keyId: string } }>(
    "/api/v1/projects/:projectId/keys/:keyId",
    authenticated,
    async (request, reply) => {
      const key = await service.revokeKey(request.params.projectId, request.params.keyId);
      return key ? { data: key } : reply.code(404).send({ code: "not_found" });
    },
  );
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/policy",
    authenticated,
    async (request, reply) => {
      const policy = await service.getPolicy(request.params.projectId);
      return policy ? { data: policy } : reply.code(404).send({ code: "not_found" });
    },
  );
  app.patch<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/policy",
    authenticated,
    async (request, reply) => {
      const policy = await service.updatePolicy(request.params.projectId, request.body);
      return policy ? { data: policy } : reply.code(404).send({ code: "not_found" });
    },
  );
}
