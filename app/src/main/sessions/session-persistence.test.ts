import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mock electron ────────────────────────────────────────────────────
const mockUserDataPath = "/tmp/session-persistence-test-unused";

vi.mock("electron", () => ({
  app: { getPath: () => mockUserDataPath },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

// ── Mock LocalDatabase with an in-memory implementation ──────────────
// We cannot load better-sqlite3 in vitest (it's compiled against Electron's
// Node.js ABI). Instead we mock the database layer with plain objects.
interface DbSession {
  id: string;
  app_id: string;
  name: string;
  title: string;
  cwd: string | null;
  workspace_id: string | null;
  parent_session_id: string | null;
  leaf_entry_id: string | null;
  is_top: number;
  created_at: number;
  updated_at: number;
}

interface DbEntry {
  id: string;
  session_id: string;
  sequence: number;
  parent_id: string | null;
  type: string;
  data_json: string;
  token_usage_json: string | null;
  timestamp: number;
  created_at: number;
}

function createMockDatabase() {
  const sessions = new Map<string, DbSession>();
  const entries = new Map<string, DbEntry>();
  let nextSeq = 1;

  return {
    db: {
      prepare: (sql: string) => {
        const stmt: Record<string, any> = {};

        if (sql.startsWith("INSERT INTO agent_sessions")) {
          stmt.run = (...params: any[]) => {
            const [id, appId, createdAt, updatedAt] = params;
            sessions.set(id, {
              id,
              app_id: appId,
              name: "",
              title: "",
              cwd: null,
              workspace_id: null,
              parent_session_id: null,
              leaf_entry_id: null,
              is_top: 0,
              created_at: createdAt,
              updated_at: updatedAt,
            });
          };
        }

        if (sql.startsWith("SELECT leaf_entry_id FROM agent_sessions")) {
          stmt.get = () => {
            const session = sessions.get((stmt as any)._sessionId);
            if (!session) return undefined;
            return { leaf_entry_id: session.leaf_entry_id };
          };
          stmt._sessionId = "";
          // Capture the sessionId from the first param at runtime
          const origRun = stmt.run;
          stmt.get = (...params: any[]) => {
            const session = sessions.get(params[0] as string);
            if (!session) return undefined;
            return { leaf_entry_id: session.leaf_entry_id };
          };
        }

        if (sql === "SELECT id FROM agent_sessions WHERE id = ?") {
          stmt.get = (id: string) => {
            const s = sessions.get(id);
            return s ? { id: s.id } : undefined;
          };
        }

        if (sql === "SELECT id, session_id FROM agent_entries WHERE id = ?") {
          stmt.get = (id: string) => {
            const e = entries.get(id);
            return e ? { id: e.id, session_id: e.session_id } : undefined;
          };
        }

        if (sql.startsWith("SELECT id FROM agent_entries WHERE session_id = ?")) {
          stmt.all = (sessionId: string) => {
            return Array.from(entries.values())
              .filter((e) => e.session_id === sessionId)
              .map((e) => ({ id: e.id }));
          };
        }

        if (sql.startsWith("SELECT COALESCE(MAX(sequence)")) {
          stmt.get = (sessionId: string) => {
            const sessionEntries = Array.from(entries.values()).filter(
              (e) => e.session_id === sessionId,
            );
            const maxSeq =
              sessionEntries.length > 0 ? Math.max(...sessionEntries.map((e) => e.sequence)) : 0;
            return { max_seq: maxSeq };
          };
        }

        if (sql.startsWith("INSERT OR IGNORE INTO agent_entries")) {
          stmt.run = (
            id: string,
            sessionId: string,
            sequence: number,
            parentId: string | null,
            type: string,
            dataJson: string,
            tokenUsageJson: string | null,
            timestamp: number,
            createdAt: number,
          ) => {
            if (!entries.has(id)) {
              entries.set(id, {
                id,
                session_id: sessionId,
                sequence,
                parent_id: parentId,
                type,
                data_json: dataJson,
                token_usage_json: tokenUsageJson,
                timestamp,
                created_at: createdAt,
              });
            }
          };
        }

        if (sql.startsWith("UPDATE agent_sessions SET name")) {
          stmt.run = (name: string, updatedAt: number, id: string) => {
            const s = sessions.get(id);
            if (s) {
              s.name = name;
              s.updated_at = updatedAt;
            }
          };
        }

        if (sql.startsWith("UPDATE agent_sessions SET leaf_entry_id")) {
          stmt.run = (leafEntryId: string, updatedAt: number, id: string) => {
            const s = sessions.get(id);
            if (s) {
              s.leaf_entry_id = leafEntryId;
              s.updated_at = updatedAt;
            }
          };
        }

        if (sql.startsWith("DELETE FROM agent_sessions")) {
          stmt.run = (id: string) => {
            // Delete entries for this session
            for (const [eid, entry] of entries) {
              if (entry.session_id === id) entries.delete(eid);
            }
            sessions.delete(id);
          };
        }

        if (sql.startsWith("SELECT * FROM agent_sessions WHERE id = ?")) {
          stmt.get = (id: string) => {
            return sessions.get(id) ?? null;
          };
        }

        if (sql.startsWith("SELECT * FROM agent_sessions WHERE app_id")) {
          stmt.all = (appId: string) => {
            return Array.from(sessions.values()).filter((s) => s.app_id === appId);
          };
        }

        if (sql.startsWith("SELECT * FROM agent_entries WHERE session_id = ?")) {
          stmt.all = (sessionId: string) => {
            return Array.from(entries.values())
              .filter((e) => e.session_id === sessionId)
              .sort((a, b) => a.sequence - b.sequence);
          };
        }

        return stmt;
      },
    },
    close: () => {},
    transaction: (fn: () => void) => fn(),
  };
}

vi.mock("./database.js", () => ({
  LocalDatabase: class {
    readonly db: any;

    constructor() {
      const mock = createMockDatabase();
      this.db = mock.db;
    }

    close() {}

    transaction<T>(operation: () => T): T {
      return operation();
    }
  },
}));

// Import AFTER mocks
const { SessionPersistence } = await import("./session-persistence.js");

function createFakeBrowserWindow() {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  } as any;
}

describe("SessionPersistence", () => {
  let persistence: SessionPersistence;

  beforeAll(() => {
    persistence = new SessionPersistence(createFakeBrowserWindow());
  });

  afterAll(() => {
    persistence.destroyAll();
  });

  // ── createSession ───────────────────────────────────────────────────────────

  it("should create a session and return it with fields", async () => {
    const session = await persistence.createSession("test-app");

    expect(session.id).toBeDefined();
    expect(session.appId).toBe("test-app");
    expect(session.name).toBe("");
    expect(session.leafEntryId).toBeNull();
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBeGreaterThan(0);
  });

  it("should list sessions for an app", async () => {
    await persistence.createSession("list-app");
    const sessions = await persistence.listSessions("list-app");
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("should get a session by id", async () => {
    const created = await persistence.createSession("test-app");
    const fetched = await persistence.getSession(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  // ── appendSessionEntries ────────────────────────────────────────────────────

  it("should append entries and set leaf_entry_id", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "e1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "hello" },
      },
      {
        id: "e2",
        sessionId: session.id,
        parentId: "e1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "hi there" },
      },
    ]);

    const updated = await persistence.getSession(session.id);
    expect(updated!.leafEntryId).toBe("e2");
  });

  it("should throw when appending to a non-existent session", async () => {
    await expect(persistence.appendSessionEntries("non-existent", [])).rejects.toThrow(
      "Session not found",
    );
  });

  it("should throw when parent entry does not exist", async () => {
    const session = await persistence.createSession("test-app");

    await expect(
      persistence.appendSessionEntries(session.id, [
        {
          id: "orphan",
          sessionId: session.id,
          parentId: "missing-parent",
          type: "message",
          timestamp: Date.now(),
          data: { role: "user", content: "orphan" },
        },
      ]),
    ).rejects.toThrow("Parent entry not found");
  });

  // ── getSessionEntries ──────────────────────────────────────────────────────

  it("should return all entries ordered by sequence", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "seq-1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "a" },
      },
      {
        id: "seq-2",
        sessionId: session.id,
        parentId: "seq-1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "b" },
      },
    ]);

    const allEntries = await persistence.getSessionEntries(session.id);
    expect(allEntries).toHaveLength(2);
    expect(allEntries[0]!.id).toBe("seq-1");
    expect(allEntries[1]!.id).toBe("seq-2");
  });

  // ── getBranch ───────────────────────────────────────────────────────────────

  it("should return empty branch when session has no leaf_entry_id", async () => {
    const session = await persistence.createSession("test-app");
    const branch = await persistence.getBranch(session.id);
    expect(branch).toEqual([]);
  });

  it("should follow parentId chain from leaf_entry_id", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "b1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "first" },
      },
      {
        id: "b2",
        sessionId: session.id,
        parentId: "b1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "second" },
      },
      {
        id: "b3",
        sessionId: session.id,
        parentId: "b2",
        type: "message",
        timestamp: now + 2,
        data: { role: "user", content: "third" },
      },
    ]);

    const branch = await persistence.getBranch(session.id);
    expect(branch.map((e) => e.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("should follow a custom leafId instead of session leaf_entry_id", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "c1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "a" },
      },
      {
        id: "c2",
        sessionId: session.id,
        parentId: "c1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "b" },
      },
      {
        id: "c3",
        sessionId: session.id,
        parentId: "c2",
        type: "message",
        timestamp: now + 2,
        data: { role: "user", content: "c" },
      },
    ]);

    const branch = await persistence.getBranch(session.id, "c2");
    expect(branch).toHaveLength(2);
    expect(branch.map((e) => e.id)).toEqual(["c1", "c2"]);
  });

  // ── setLeaf ─────────────────────────────────────────────────────────────────

  it("should update leaf_entry_id on a session", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "s1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "a" },
      },
      {
        id: "s2",
        sessionId: session.id,
        parentId: "s1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "b" },
      },
      {
        id: "s3",
        sessionId: session.id,
        parentId: "s2",
        type: "message",
        timestamp: now + 2,
        data: { role: "user", content: "c" },
      },
    ]);

    await persistence.setLeaf(session.id, "s2");

    const updated = await persistence.getSession(session.id);
    expect(updated!.leafEntryId).toBe("s2");

    const branch = await persistence.getBranch(session.id);
    expect(branch.map((e) => e.id)).toEqual(["s1", "s2"]);
  });

  it("should throw setLeaf when entry belongs to a different session", async () => {
    const sessionA = await persistence.createSession("test-app");
    const sessionB = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(sessionA.id, [
      {
        id: "cross-1",
        sessionId: sessionA.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "x" },
      },
    ]);

    await expect(persistence.setLeaf(sessionB.id, "cross-1")).rejects.toThrow(
      "does not belong to session",
    );
  });

  it("should throw setLeaf when entry does not exist", async () => {
    const session = await persistence.createSession("test-app");
    await expect(persistence.setLeaf(session.id, "non-existent")).rejects.toThrow(
      "Entry not found",
    );
  });

  // ── buildContext ────────────────────────────────────────────────────────────

  it("should build context from branch entries", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "ctx1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "hello" },
      },
      {
        id: "ctx2",
        sessionId: session.id,
        parentId: "ctx1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "hi" },
      },
      {
        id: "ctx3",
        sessionId: session.id,
        parentId: "ctx2",
        type: "model_change",
        timestamp: now + 0.5,
        data: { providerId: "test", modelId: "gpt-4" },
      },
    ]);

    const context = await persistence.buildContext(session.id);
    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]!.role).toBe("user");
    expect(context.messages[0]!.content).toBe("hello");
    expect(context.messages[1]!.role).toBe("assistant");
    expect(context.messages[1]!.content).toBe("hi");
    expect(context.model).toEqual({ providerId: "test", modelId: "gpt-4" });
  });

  // ── renameSession ───────────────────────────────────────────────────────────

  it("should rename a session", async () => {
    const session = await persistence.createSession("test-app");
    await persistence.renameSession(session.id, "My Session");

    const updated = await persistence.getSession(session.id);
    expect(updated!.name).toBe("My Session");
  });

  // ── deleteSession ───────────────────────────────────────────────────────────

  it("should delete a session and cascade delete entries", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    await persistence.appendSessionEntries(session.id, [
      {
        id: "del1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "to-delete" },
      },
    ]);

    await persistence.deleteSession(session.id);

    expect(await persistence.getSession(session.id)).toBeNull();
    expect(await persistence.getSessionEntries(session.id)).toHaveLength(0);
  });

  // ── Rewind simulation (full edit flow) ──────────────────────────────────────

  it("should simulate edit flow: setLeaf + append new branch", async () => {
    const session = await persistence.createSession("test-app");
    const now = Date.now();

    // 1. Initial conversation: 3 entries
    await persistence.appendSessionEntries(session.id, [
      {
        id: "r1",
        sessionId: session.id,
        parentId: null,
        type: "message",
        timestamp: now,
        data: { role: "user", content: "original" },
      },
      {
        id: "r2",
        sessionId: session.id,
        parentId: "r1",
        type: "message",
        timestamp: now + 1,
        data: { role: "assistant", content: "reply" },
      },
      {
        id: "r3",
        sessionId: session.id,
        parentId: "r2",
        type: "message",
        timestamp: now + 2,
        data: { role: "user", content: "edited version" },
      },
    ]);

    expect((await persistence.getBranch(session.id)).map((e) => e.id)).toEqual(["r1", "r2", "r3"]);

    // 2. Rewind to r2 (simulating user editing r3)
    await persistence.setLeaf(session.id, "r2");

    // 3. Append new branch
    await persistence.appendSessionEntries(session.id, [
      {
        id: "r4",
        sessionId: session.id,
        parentId: "r2",
        type: "message",
        timestamp: now + 3,
        data: { role: "user", content: "edited text" },
      },
      {
        id: "r5",
        sessionId: session.id,
        parentId: "r4",
        type: "message",
        timestamp: now + 4,
        data: { role: "assistant", content: "new reply" },
      },
    ]);

    // 4. Branch should only contain the new chain
    const branch = await persistence.getBranch(session.id);
    expect(branch.map((e) => e.id)).toEqual(["r1", "r2", "r4", "r5"]);
    expect(branch[2]!.data).toMatchObject({ content: "edited text" });
    expect(branch[3]!.data).toMatchObject({ content: "new reply" });

    // 5. All entries still exist in the database (including the old r3)
    const allEntries = await persistence.getSessionEntries(session.id);
    expect(allEntries.map((e) => e.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
  });
});
