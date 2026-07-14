import type { Entry, Session, TokenUsage } from "../../shared/session-persistence-ipc.js";

// id=2: divisor-compatible session/entry schema. Adds the columns the new
// Session/Entry shapes need, backfills them from legacy data, and leaves
// legacy runs/artifacts/HIL tables + columns untouched (no longer read/written).
export const SESSION_MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 2,
    sql: `
      ALTER TABLE agent_sessions ADD COLUMN name TEXT NOT NULL DEFAULT '';
      ALTER TABLE agent_sessions ADD COLUMN cwd TEXT;
      ALTER TABLE agent_sessions ADD COLUMN workspace_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN leaf_entry_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN is_top INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE agent_entries ADD COLUMN parent_id TEXT;
      ALTER TABLE agent_entries ADD COLUMN timestamp INTEGER;

      -- name <- title
      UPDATE agent_sessions SET name = title WHERE name = '' AND title IS NOT NULL;

      -- entries: linear chain by sequence, parent_id + timestamp backfill
      UPDATE agent_entries
      SET parent_id = (
        SELECT e2.id FROM agent_entries e2
        WHERE e2.session_id = agent_entries.session_id
          AND e2.sequence < agent_entries.sequence
        ORDER BY e2.sequence DESC LIMIT 1
      ),
      timestamp = created_at
      WHERE parent_id IS NULL;

      -- sessions: leaf_entry_id = max-sequence entry
      UPDATE agent_sessions
      SET leaf_entry_id = (
        SELECT e.id FROM agent_entries e
        WHERE e.session_id = agent_sessions.id
        ORDER BY e.sequence DESC LIMIT 1
      )
      WHERE leaf_entry_id IS NULL;
    `,
  },
];

export interface SessionRow {
  id: string;
  app_id: string;
  name: string;
  title: string | null;
  cwd: string | null;
  workspace_id: string | null;
  parent_session_id: string | null;
  leaf_entry_id: string | null;
  is_top: number;
  created_at: number;
  updated_at: number;
}

export interface EntryRow {
  id: string;
  session_id: string;
  sequence: number;
  parent_id: string | null;
  type: Entry["type"];
  data_json: string;
  token_usage_json: string | null;
  timestamp: number | null;
  created_at: number;
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name || row.title || "",
    cwd: row.cwd ?? "",
    workspaceId: row.workspace_id,
    parentSessionId: row.parent_session_id,
    leafEntryId: row.leaf_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isTop: row.is_top === 1,
  };
}

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    type: row.type,
    timestamp: row.timestamp ?? row.created_at,
    data: parseObject(row.data_json),
    tokenUsage: row.token_usage_json ? parseTokenUsage(row.token_usage_json) : null,
  };
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTokenUsage(value: string): TokenUsage | null {
  const parsed = parseObject(value);
  return "turn" in parsed && "latestCall" in parsed ? (parsed as unknown as TokenUsage) : null;
}
