import "./test-db.js";
import { describe, it, expect } from "vitest";

import { createDbClient } from "../db/client.js";

describe("schema", () => {
  it("creates core tables", () => {
    const { sqlite } = createDbClient({}, ":memory:");
    const tables = sqlite
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
