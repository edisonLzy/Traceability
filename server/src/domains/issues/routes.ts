import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import { createManagementAuth } from "../../infrastructure/auth/management-auth.js";
import { IssueService } from "./service.js";

interface IssueRouteDependencies {
  config: RuntimeConfig;
  database: PostgresDatabase;
}

export async function registerIssueRoutes(
  app: FastifyInstance,
  dependencies: IssueRouteDependencies,
) {
  const service = new IssueService(dependencies.database);
  const authenticated = { preHandler: createManagementAuth(dependencies.config) };

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/issues",
    authenticated,
    async (request) => service.listForProject(request.params.projectId, request.query),
  );
  app.get<{ Params: { issueId: string } }>(
    "/api/v1/issues/:issueId",
    authenticated,
    async (request, reply) => {
      const issue = await service.getIssue(request.params.issueId);
      return issue ? { data: issue } : reply.code(404).send({ code: "not_found" });
    },
  );
  app.get<{ Params: { issueId: string } }>(
    "/api/v1/issues/:issueId/events",
    authenticated,
    async (request, reply) => {
      const issue = await service.getIssue(request.params.issueId);
      if (!issue) return reply.code(404).send({ code: "not_found" });
      return { data: await service.listEvents(request.params.issueId, request.query) };
    },
  );
  app.patch<{ Params: { issueId: string } }>(
    "/api/v1/issues/:issueId",
    authenticated,
    async (request, reply) => {
      const issue = await service.updateIssue(request.params.issueId, request.body);
      return issue ? { data: issue } : reply.code(404).send({ code: "not_found" });
    },
  );
}
