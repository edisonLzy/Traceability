import "./test-db.js";
import { SourceMapGenerator } from "source-map-js";
import { describe, it, expect } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { upsertSourceMap, resolveFrames } from "../domains/source-maps/service.js";

describe("source-maps service", () => {
  it("rejects invalid upload with AppError 400", () => {
    expect(() => upsertSourceMap("app", { file: "", sourceMap: {} })).toThrow();
  });

  it("resolves a frame through an uploaded map", () => {
    const app = createApp({ name: "A", repoUrl: "git@x:a", defaultBranch: "main" });
    const gen = new SourceMapGenerator({ file: "app.min.js" });
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 10, column: 4 },
      source: "app.ts",
    });
    gen.setSourceContent("app.ts", Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n"));
    upsertSourceMap(app.id, { file: "app.min.js", sourceMap: JSON.parse(gen.toString()) });
    const [resolved] = resolveFrames(app.id, undefined, [
      { filename: "app.min.js", lineno: 1, colno: 1 },
    ]);
    expect(resolved?.file).toBe("app.ts");
    expect(resolved?.line).toBe(10);
  });
});
