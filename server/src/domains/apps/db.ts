import { randomUUID } from "node:crypto";

import type { Application } from "@traceability/protocol";
import type { Database } from "better-sqlite3";

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

export function createAppsRepo(db: Database) {
  const rowToApp = (r: Record<string, unknown>): Application => ({
    id: r.id as string,
    name: r.name as string,
    repoUrl: r.repo_url as string,
    defaultBranch: r.default_branch as string,
    createdAt: r.created_at as string,
  });

  return {
    list(): Application[] {
      const rows = db.prepare("SELECT * FROM applications ORDER BY created_at DESC").all() as Array<
        Record<string, unknown>
      >;
      return rows.map(rowToApp);
    },
    get(id: string): Application | undefined {
      const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as
        | Record<string, unknown>
        | undefined;
      return row ? rowToApp(row) : undefined;
    },
    create(input: CreateAppInput): Application {
      const app: Application = {
        id: randomUUID(),
        name: input.name,
        repoUrl: input.repoUrl,
        defaultBranch: input.defaultBranch,
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO applications (id, name, repo_url, default_branch, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(app.id, app.name, app.repoUrl, app.defaultBranch, app.createdAt);
      return app;
    },
    update(id: string, input: UpdateAppInput): Application | undefined {
      const existing = this.get(id);
      if (!existing) return undefined;
      const updated: Application = {
        ...existing,
        name: input.name ?? existing.name,
        repoUrl: input.repoUrl ?? existing.repoUrl,
        defaultBranch: input.defaultBranch ?? existing.defaultBranch,
      };
      db.prepare(
        "UPDATE applications SET name = ?, repo_url = ?, default_branch = ? WHERE id = ?",
      ).run(updated.name, updated.repoUrl, updated.defaultBranch, id);
      return updated;
    },
    remove(id: string): boolean {
      const res = db.prepare("DELETE FROM applications WHERE id = ?").run(id);
      return res.changes > 0;
    },
  };
}
