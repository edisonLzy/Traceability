import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { createApp, deleteApp, getApp, listApps } from '@renderer/apis/apps'
import type { CreateAppRequest } from '@renderer/apis/apps'

const APPS_KEY = ['apps'] as const
const appKey = (id: string) => ['apps', id] as const

// ── List Apps ────────────────────────────────────────────────────────────────

export function useApps() {
  return useQuery({ queryKey: APPS_KEY, queryFn: () => listApps(), staleTime: 30_000 })
}

// ── Get App ──────────────────────────────────────────────────────────────────

export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: appKey(id ?? ''),
    queryFn: () => getApp(id!),
    enabled: Boolean(id),
  })
}

// ── Create App ───────────────────────────────────────────────────────────────

export function useCreateApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateAppRequest) => createApp(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPS_KEY })
    },
  })
}

// ── Delete App ───────────────────────────────────────────────────────────────

export function useDeleteApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteApp(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPS_KEY })
    },
  })
}

// ── Invalidate ───────────────────────────────────────────────────────────────

export function useInvalidateApps() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: APPS_KEY })
  }, [queryClient])
}
