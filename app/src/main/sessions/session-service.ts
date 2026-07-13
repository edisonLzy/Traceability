import { randomUUID } from "node:crypto";

import type { Entry, Session } from "../../shared/session-ipc.js";
import { LocalDatabase } from "../db/database.js";

interface SessionRow {
  id: string;
  app_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface EntryRow {
  id: string;
  session_id: string;
  sequence: number;
  type: Entry["type"];
  data_json: string;
  token_usage_json: string | null;
  created_at: number;
}

/**
 * Durable session history for the read-only Agent.
 *
 * The renderer owns optimistic entry state while a reply is streaming and
 * flushes completed entries through `appendEntries`. This service deliberately
 * stores only messages and model selections; artifacts, runs, and permissions
 * are not part of the Traceability Agent contract.
 */
export class SessionService {
  constructor(private readonly db: LocalDatabase) {}

  public create(appId: string): Session {
    const now = Date.now();
    const row: SessionRow = {
      id: randomUUID(),
      app_id: appId,
      title: "",
      created_at: now,
      updated_at: now,
    };

    this.db.raw
      .prepare(`
        INSERT INTO agent_sessions (id, app_id, title, status, created_at, updated_at)
        VALUES (?, ?, ?, 'idle', ?, ?)
      `)
      .run(row.id, row.app_id, row.title, row.created_at, row.updated_at);

    return toSession(row, null);
  }

  public list(appId: string): Session[] {
    const rows = this.db.raw
      .prepare(`
        SELECT id, app_id, title, created_at, updated_at
        FROM agent_sessions
        WHERE app_id = ?
        ORDER BY updated_at DESC
      `)
      .all(appId) as unknown as SessionRow[];

    return rows.map((row) => toSession(row, null));
  }

  public get(sessionId: string): Session | null {
    const row = this.db.raw
      .prepare(`
        SELECT id, app_id, title, created_at, updated_at
        FROM agent_sessions
        WHERE id = ?
      `)
      .get(sessionId) as SessionRow | undefined;
    if (!row) return null;

    return toSession(row, this.getLeafEntryId(sessionId));
  }

  public getEntries(sessionId: string): Entry[] {
    this.assertSession(sessionId);
    const rows = this.db.raw
      .prepare(`
        SELECT id, session_id, sequence, type, data_json, token_usage_json, created_at
        FROM agent_entries
        WHERE session_id = ?
        ORDER BY sequence ASC
      `)
      .all(sessionId) as unknown as EntryRow[];

    let parentId: string | null = null;
    return rows.map((row) => {
      const entry = {
        id: row.id,
        sessionId: row.session_id,
        parentId,
        type: row.type,
        timestamp: row.created_at,
        data: parseRecord(row.data_json),
        tokenUsage: row.token_usage_json
          ? (JSON.parse(row.token_usage_json) as Entry["tokenUsage"])
          : null,
      } satisfies Entry;
      parentId = row.id;
      return entry;
    });
  }

  public rename(sessionId: string, name: string): void {
    const normalized = name.trim();
    if (!normalized) throw new Error("Session name cannot be empty");

    const result = this.db.raw
      .prepare("UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(normalized, Date.now(), sessionId);
    if (result.changes === 0) throw new Error("Conversation not found");
  }

  public delete(sessionId: string): void {
    this.db.raw.prepare("DELETE FROM agent_sessions WHERE id = ?").run(sessionId);
  }

  public appendEntries(sessionId: string, entries: Entry[]): void {
    this.assertSession(sessionId);

    this.db.transaction(() => {
      const nextSequence = this.db.raw
        .prepare(
          "SELECT COALESCE(MAX(sequence) + 1, 0) AS sequence FROM agent_entries WHERE session_id = ?",
        )
        .get(sessionId) as { sequence: number };
      let sequence = nextSequence.sequence;
      const hasEntry = this.db.raw.prepare("SELECT 1 FROM agent_entries WHERE id = ?");
      const insert = this.db.raw.prepare(`
        INSERT INTO agent_entries (id, session_id, sequence, type, data_json, token_usage_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entry of entries) {
        if (entry.sessionId !== sessionId) {
          throw new Error("Cannot append an entry to a different conversation");
        }
        if (entry.type !== "message" && entry.type !== "model_change") {
          throw new Error(`Unsupported Agent entry type: ${entry.type}`);
        }
        if (hasEntry.get(entry.id)) continue;

        insert.run(
          entry.id,
          sessionId,
          sequence,
          entry.type,
          JSON.stringify(entry.data),
          entry.tokenUsage ? JSON.stringify(entry.tokenUsage) : null,
          entry.timestamp,
        );
        sequence += 1;
      }

      this.db.raw
        .prepare("UPDATE agent_sessions SET updated_at = ? WHERE id = ?")
        .run(Date.now(), sessionId);
    });
  }

  private assertSession(sessionId: string): void {
    const row = this.db.raw.prepare("SELECT 1 FROM agent_sessions WHERE id = ?").get(sessionId);
    if (!row) throw new Error("Conversation not found");
  }

  private getLeafEntryId(sessionId: string): string | null {
    const row = this.db.raw
      .prepare(`
        SELECT id FROM agent_entries
        WHERE session_id = ?
        ORDER BY sequence DESC
        LIMIT 1
      `)
      .get(sessionId) as { id: string } | undefined;
    return row?.id ?? null;
  }
}

function toSession(row: SessionRow, leafEntryId: string | null): Session {
  return {
    id: row.id,
    name: row.title,
    cwd: process.cwd(),
    workspaceId: null,
    parentSessionId: null,
    leafEntryId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isTop: true,
    appId: row.app_id,
  };
}

function parseRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored Agent entry data is invalid");
  }
  return parsed as Record<string, unknown>;
}
