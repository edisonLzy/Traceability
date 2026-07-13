import { randomUUID } from "node:crypto";

import type { SourceLocation, SourceMapUpload } from "@traceability/protocol";
import type { Database } from "better-sqlite3";
import { SourceMapConsumer } from "source-map-js";

interface SourceMapRow {
  source_map: string;
}

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

export function createSourceMapsRepo(db: Database) {
  const findMap = (
    appId: string,
    release: string | undefined,
    file: string,
  ): Record<string, unknown> | undefined => {
    const candidates = artifactCandidates(file);
    for (const candidate of candidates) {
      const row = db
        .prepare(
          `SELECT source_map FROM source_maps
         WHERE app_id = ? AND file = ? AND release IN (?, '')
         ORDER BY CASE WHEN release = ? THEN 0 ELSE 1 END
         LIMIT 1`,
        )
        .get(appId, candidate, release ?? "", release ?? "") as SourceMapRow | undefined;
      if (row) return JSON.parse(row.source_map) as Record<string, unknown>;
    }
    return undefined;
  };

  return {
    upsert(appId: string, input: SourceMapUpload): void {
      if (!input.file || !input.sourceMap || typeof input.sourceMap !== "object") {
        throw new Error("file and sourceMap are required");
      }
      const file = normaliseArtifactFile(input.file);
      const release = input.release ?? "";
      db.prepare(
        `INSERT INTO source_maps (id, app_id, release, file, source_map, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(app_id, release, file) DO UPDATE SET source_map = excluded.source_map, uploaded_at = excluded.uploaded_at`,
      ).run(
        randomUUID(),
        appId,
        release,
        file,
        JSON.stringify(input.sourceMap),
        new Date().toISOString(),
      );
    },

    resolveFrames(
      appId: string,
      release: string | undefined,
      frames: StackFrame[],
    ): SourceLocation[] {
      const resolved: SourceLocation[] = [];
      for (const frame of frames) {
        if (!frame.filename || !frame.lineno) continue;
        const map = findMap(appId, release, frame.filename);
        if (!map) continue;
        const location = resolveFrame(map, frame);
        if (location) resolved.push(location);
      }
      return resolved;
    },
  };
}

function resolveFrame(map: Record<string, unknown>, frame: StackFrame): SourceLocation | undefined {
  const consumer = new SourceMapConsumer(map as any);
  const generatedColumn = Math.max(0, (frame.colno ?? 1) - 1);
  const original = consumer.originalPositionFor({ line: frame.lineno!, column: generatedColumn });
  if (!original.source || !original.line) return undefined;

  const content = consumer.sourceContentFor(original.source, true);
  const lines = typeof content === "string" ? content.split(/\r?\n/) : [];
  const startLine = Math.max(1, original.line - 2);
  const endLine = Math.min(lines.length, original.line + 2);
  return {
    file: original.source,
    line: original.line,
    column: (original.column ?? 0) + 1,
    function: original.name ?? frame.function,
    generated: { file: frame.filename ?? "", line: frame.lineno!, column: frame.colno ?? 1 },
    ...(lines.length > 0
      ? {
          context: {
            startLine,
            lines: lines.slice(startLine - 1, endLine),
            errorLine: original.line,
          },
        }
      : {}),
  };
}

function artifactCandidates(file: string): string[] {
  const normalised = normaliseArtifactFile(file);
  const basename = normalised.split("/").pop()!;
  return [...new Set([normalised, basename])];
}

function normaliseArtifactFile(file: string): string {
  try {
    const parsed = new URL(file);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return file.replace(/^\/+/, "").replace(/^\.\//, "");
  }
}
