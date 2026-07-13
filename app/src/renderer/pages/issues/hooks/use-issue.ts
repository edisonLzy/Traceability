import { useQuery } from '@tanstack/react-query'
import { getIssue, getIssueEvents, getIssueReplays, getReplay } from '@renderer/apis/monitor'

// ── Get Issue ────────────────────────────────────────────────────────────────

export function useIssue(issueId: string | undefined) {
  return useQuery({
    queryKey: ['issue', issueId ?? ''],
    queryFn: () => getIssue(issueId!),
    enabled: Boolean(issueId),
  })
}

// ── Get Issue Events ─────────────────────────────────────────────────────────

export function useIssueEvents(issueId: string | undefined) {
  return useQuery({
    queryKey: ['issue', issueId ?? '', 'events'],
    queryFn: () => getIssueEvents(issueId!),
    enabled: Boolean(issueId),
  })
}

// ── Get Issue Replays ────────────────────────────────────────────────────────

export function useIssueReplays(issueId: string | undefined) {
  return useQuery({
    queryKey: ['issue', issueId ?? '', 'replays'],
    queryFn: () => getIssueReplays(issueId!),
    enabled: Boolean(issueId),
  })
}

// ── Get Replay (lazy: only when the replay tab is active) ────────────────────

export function useReplay(issueId: string | undefined, replayId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['replay', issueId ?? '', replayId ?? ''],
    queryFn: () => getReplay(issueId!, replayId!),
    enabled: Boolean(issueId && replayId && enabled),
  })
}
