import { request } from '@renderer/lib/request'
import type { Application } from '@traceability/protocol'

// ── List Apps ────────────────────────────────────────────────────────────────

export async function listApps(): Promise<Application[]> {
  const { data } = await request.get<Application[]>('/api/apps')
  return data
}

// ── Get App ──────────────────────────────────────────────────────────────────

export async function getApp(id: string): Promise<Application> {
  const { data } = await request.get<Application>(`/api/apps/${id}`)
  return data
}

// ── Create App ───────────────────────────────────────────────────────────────

export interface CreateAppRequest {
  name: string
  repoUrl: string
  defaultBranch: string
}

export async function createApp(req: CreateAppRequest): Promise<Application> {
  const { data } = await request.post<Application>('/api/apps', req)
  return data
}

// ── Delete App ───────────────────────────────────────────────────────────────

export async function deleteApp(id: string): Promise<void> {
  await request.delete(`/api/apps/${id}`)
}
