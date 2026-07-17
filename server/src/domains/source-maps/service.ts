import { sql } from "drizzle-orm";
import { SourceMapConsumer } from "source-map-js";
import { z } from "zod";

import { db, sourceMaps } from "./db.js";

export const UpsertSourceMapSchema = z.object({
  file: z.string().min(1),
  sourceMap: z.record(z.string(), z.unknown()),
  release: z.string().optional(),
});
export type UpsertSourceMapInput = z.infer<typeof UpsertSourceMapSchema>;

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

function findMap(appId: string, release: string | undefined, file: string) {
  const candidates = artifactCandidates(file);
  for (const candidate of candidates) {
    const rows = db
      .select({ sourceMap: sourceMaps.sourceMap })
      .from(sourceMaps)
      .where(
        sql`${sourceMaps.appId} = ${appId} AND ${sourceMaps.file} = ${candidate} AND ${sourceMaps.release} IN (${release ?? ""}, '')`,
      )
      .orderBy(sql`CASE WHEN ${sourceMaps.release} = ${release ?? ""} THEN 0 ELSE 1 END`)
      .limit(1)
      .all();
    if (rows.length) return JSON.parse(rows[0]!.sourceMap) as Record<string, unknown>;
  }
  return undefined;
}

export function upsertSourceMap(appId: string, raw: unknown) {
  const input = UpsertSourceMapSchema.parse(raw);
  const file = normaliseArtifactFile(input.file);
  const release = input.release ?? "";

  db.insert(sourceMaps)
    .values({
      id: crypto.randomUUID(),
      appId,
      release,
      file,
      sourceMap: JSON.stringify(input.sourceMap),
      uploadedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [sourceMaps.appId, sourceMaps.release, sourceMaps.file],
      set: { sourceMap: JSON.stringify(input.sourceMap), uploadedAt: new Date().toISOString() },
    })
    .run();
}

export function resolveFrames(appId: string, release: string | undefined, frames: StackFrame[]) {
  const resolved: Array<{
    file: string;
    line: number;
    column: number;
    function?: string;
    generated?: { file: string; line: number; column: number };
    context?: { startLine: number; lines: string[]; errorLine: number };
  }> = [];
  for (const frame of frames) {
    if (!frame.filename || !frame.lineno) continue;
    const map = findMap(appId, release, frame.filename);
    if (!map) continue;
    const location = resolveFrame(map, frame);
    if (location) resolved.push(location);
  }
  return resolved;
}

function resolveFrame(map: Record<string, unknown>, frame: StackFrame) {
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
