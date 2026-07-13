import type { Application, SourceMapUpload } from "@traceability/protocol";
import type { Database } from "better-sqlite3";

import { AppError } from "../../errors/app-error.js";
import { createAppsRepo } from "./db.js";

interface CreateAppInput {
  name: string;
  repoUrl: string;
  defaultBranch: string;
}
interface UpdateAppInput {
  name?: string;
  repoUrl?: string;
  defaultBranch?: string;
}

export interface AppsService {
  list(): Application[];
  get(id: string): Application;
  create(input: CreateAppInput): Application;
  update(id: string, input: UpdateAppInput): Application;
  remove(id: string): void;
  uploadSourceMap(appId: string, input: SourceMapUpload): void;
}

export function createAppsService(
  db: Database,
  sourceMaps: { upsert(appId: string, input: SourceMapUpload): void },
): AppsService {
  const repo = createAppsRepo(db);
  return {
    list: () => repo.list(),
    get: (id) => {
      const found = repo.get(id);
      if (!found) throw new AppError("not found", 404, 404);
      return found;
    },
    create: (input) => {
      if (!input.name || !input.repoUrl || !input.defaultBranch) {
        throw new AppError("name, repoUrl, defaultBranch required", 400, 400);
      }
      return repo.create(input);
    },
    update: (id, input) => {
      const updated = repo.update(id, input);
      if (!updated) throw new AppError("not found", 404, 404);
      return updated;
    },
    remove: (id) => {
      if (!repo.remove(id)) throw new AppError("not found", 404, 404);
    },
    uploadSourceMap: (appId, input) => {
      if (!repo.get(appId)) throw new AppError("application not found", 404, 404);
      sourceMaps.upsert(appId, input);
    },
  };
}
