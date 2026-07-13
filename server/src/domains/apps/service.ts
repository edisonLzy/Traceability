import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import { upsertSourceMap } from "../source-maps/service.js";
import { db, applications } from "./db.js";

export const CreateAppSchema = z.object({
  name: z.string().min(1).max(200),
  repoUrl: z.string(),
  defaultBranch: z.string().min(1),
});
export type CreateAppInput = z.infer<typeof CreateAppSchema>;

export const UpdateAppSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  repoUrl: z.string().optional(),
  defaultBranch: z.string().min(1).optional(),
});
export type UpdateAppInput = z.infer<typeof UpdateAppSchema>;

export function listApps() {
  return db.select().from(applications).orderBy(desc(applications.createdAt)).all();
}

export function getApp(id: string) {
  const rows = db.select().from(applications).where(eq(applications.id, id)).limit(1).all();
  if (!rows.length) throw new AppError("not found", 404, 404);
  return rows[0]!;
}

export function createApp(raw: unknown) {
  const input = CreateAppSchema.parse(raw);
  const id = crypto.randomUUID();
  db.insert(applications)
    .values({
      id,
      ...input,
      createdAt: new Date().toISOString(),
    })
    .run();
  return getApp(id);
}

export function updateApp(id: string, raw: unknown) {
  getApp(id);
  const input = UpdateAppSchema.parse(raw);
  db.update(applications).set(input).where(eq(applications.id, id)).run();
  return getApp(id);
}

export function removeApp(id: string) {
  getApp(id);
  db.delete(applications).where(eq(applications.id, id)).run();
}

export function uploadSourceMap(appId: string, raw: unknown) {
  getApp(appId);
  upsertSourceMap(appId, raw);
}
