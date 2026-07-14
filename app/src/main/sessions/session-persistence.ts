import { join } from "node:path";

import { app } from "electron";
import type { BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";

import type {
  Entry,
  Session,
  SessionPersistenceIPC,
} from "../../shared/session-persistence-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";
import { LocalDatabase } from "./database.js";
import { toEntry, toSession } from "./session-schema.js";

export class SessionPersistence
  extends AbstractAgentIPCHandler<SessionPersistenceIPC>
  implements SessionPersistenceIPC
{
  private db: LocalDatabase;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.db = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = [
      "createSession",
      "listSessions",
      "getSession",
      "getSessionEntries",
      "renameSession",
      "deleteSession",
      "appendSessionEntries",
    ] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) {
        this.typedIpcMain.removeHandler(channel);
      }
    };
  }

  // ── 7 methods ─────────────────────────────────────────────────────────────

  public createSession: SessionPersistenceIPC["createSession"] = async (appId) => {
    const id = uuidv4();
    const now = Date.now();
    this.db.transaction(() => {
      this.db.db
        .prepare(
          `INSERT INTO agent_sessions (id, app_id, name, title, workspace_id, parent_session_id, leaf_entry_id, is_top, created_at, updated_at)
           VALUES (?, ?, '', '', NULL, NULL, NULL, 0, ?, ?)`,
        )
        .run(id, appId, now, now);
    });
    return toSession(
      this.db.db.prepare("SELECT * FROM agent_sessions WHERE id = ?").get(id) as never,
    );
  };

  public listSessions: SessionPersistenceIPC["listSessions"] = async (appId) => {
    const rows = this.db.db
      .prepare("SELECT * FROM agent_sessions WHERE app_id = ? ORDER BY updated_at DESC")
      .all(appId);
    return (rows as never[]).map(toSession);
  };

  public getSession: SessionPersistenceIPC["getSession"] = async (sessionId) => {
    const row = this.db.db
      .prepare("SELECT * FROM agent_sessions WHERE id = ?")
      .get(sessionId) as never;
    return row ? toSession(row) : null;
  };

  public getSessionEntries: SessionPersistenceIPC["getSessionEntries"] = async (sessionId) => {
    const rows = this.db.db
      .prepare("SELECT * FROM agent_entries WHERE session_id = ? ORDER BY sequence ASC")
      .all(sessionId);
    return (rows as never[]).map(toEntry);
  };

  public renameSession: SessionPersistenceIPC["renameSession"] = async (sessionId, name) => {
    this.db.db
      .prepare("UPDATE agent_sessions SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, Date.now(), sessionId);
  };

  public deleteSession: SessionPersistenceIPC["deleteSession"] = async (sessionId) => {
    this.db.db.prepare("DELETE FROM agent_sessions WHERE id = ?").run(sessionId);
  };

  public appendSessionEntries: SessionPersistenceIPC["appendSessionEntries"] = async (
    sessionId,
    entries,
  ) => {
    const session = this.db.db.prepare("SELECT id FROM agent_sessions WHERE id = ?").get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Collect all known entry ids in this session (existing + the ones we're inserting)
    const existingIds = new Set(
      (
        this.db.db
          .prepare("SELECT id FROM agent_entries WHERE session_id = ?")
          .all(sessionId) as Array<{ id: string }>
      ).map((r) => r.id),
    );
    const insertingIds = new Set(entries.map((e) => e.id));
    for (const entry of entries) {
      if (entry.parentId && !existingIds.has(entry.parentId) && !insertingIds.has(entry.parentId)) {
        throw new Error(
          `Parent entry not found: ${entry.parentId} (session ${sessionId}, entry ${entry.id})`,
        );
      }
    }

    // Get the current max sequence for this session
    const maxSeqRow = this.db.db
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM agent_entries WHERE session_id = ?",
      )
      .get(sessionId) as { max_seq: number };
    let nextSeq = maxSeqRow.max_seq + 1;

    const insertStmt = this.db.db.prepare(
      `INSERT OR IGNORE INTO agent_entries (id, session_id, sequence, parent_id, type, data_json, token_usage_json, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      for (const entry of entries) {
        insertStmt.run(
          entry.id,
          sessionId,
          nextSeq,
          entry.parentId,
          entry.type,
          JSON.stringify(entry.data),
          entry.tokenUsage ? JSON.stringify(entry.tokenUsage) : null,
          entry.timestamp,
          Date.now(),
        );
        nextSeq++;
      }

      // Update leaf_entry_id to the last inserted entry (max sequence)
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        this.db.db
          .prepare("UPDATE agent_sessions SET leaf_entry_id = ?, updated_at = ? WHERE id = ?")
          .run(lastEntry.id, Date.now(), sessionId);
      }
    });
  };

  public destroyAll() {
    this.unbind?.();
    this.db.close();
  }
}
