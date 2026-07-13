import type {
  RrwebReplay,
  RrwebReplayIngestBody,
  RrwebReplaySummary,
} from "@traceability/protocol";
import type { Database } from "better-sqlite3";

import { AppError } from "../../errors/app-error.js";
import type { IssuesService } from "../issues/service.js";
import { createRrwebReplaysRepo } from "./db.js";

export interface ReplaysService {
  save(appId: string, body: RrwebReplayIngestBody | undefined): RrwebReplay;
  listByIssue(issueId: string, limit?: number): RrwebReplaySummary[];
  getForIssue(issueId: string, replayId: string): RrwebReplay;
  attachToIssue(
    replayId: string,
    issueId: string,
    appId: string,
    sentryEventId?: string,
  ): RrwebReplaySummary;
}

export function createReplaysService(db: Database, issues: IssuesService): ReplaysService {
  const repo = createRrwebReplaysRepo(db);
  return {
    save: (appId, body) => {
      if (!body || !Array.isArray(body.events) || body.events.length === 0) {
        throw new AppError("events required", 400, 400);
      }
      return repo.save(appId, body);
    },
    listByIssue: (issueId, limit) => {
      issues.get(issueId); // throws 404 if missing
      return repo.listByIssue(issueId, limit);
    },
    getForIssue: (issueId, replayId) => {
      issues.get(issueId); // throws 404 if missing
      const replay = repo.getForIssue(issueId, replayId);
      if (!replay) throw new AppError("not found", 404, 404);
      return replay;
    },
    attachToIssue: (replayId, issueId, appId, sentryEventId) =>
      repo.attachToIssue(replayId, issueId, appId, sentryEventId),
  };
}
