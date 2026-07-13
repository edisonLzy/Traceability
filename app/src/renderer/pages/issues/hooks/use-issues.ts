import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { listIssues } from '@renderer/apis/monitor'
import type { ListIssuesParams } from '@renderer/apis/monitor'
import type { IssueStatus } from '@traceability/protocol'

export interface UseIssuesParams {
  appId: string
  status?: IssueStatus
  limit?: number
}

const issuesKey = (params: UseIssuesParams) => ['issues', { appId: params.appId, status: params.status ?? 'all', limit: params.limit ?? 100 }] as const

// ── List Issues ──────────────────────────────────────────────────────────────

export function useIssues(params: UseIssuesParams) {
  return useQuery({
    queryKey: issuesKey(params),
    queryFn: () => listIssues({ appId: params.appId, status: params.status, limit: params.limit ?? 100 }),
    staleTime: 30_000,
  })
}

// ── Invalidate (for WS push refresh) ─────────────────────────────────────────

export function useInvalidateIssues() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['issues'] })
  }, [queryClient])
}
