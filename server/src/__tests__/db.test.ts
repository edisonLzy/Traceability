import type { Database } from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";

import { openDb } from "../db.js";

let db: Database;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("openDb", () => {
  it("runs migrations and creates core tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("applications");
    expect(names).toContain("issues");
    expect(names).toContain("events");
    expect(names).toContain("rrweb_replays");
    expect(names).toContain("performance_samples");
    expect(names).toContain("source_maps");
    expect(names).toContain("patches");
  });
});
