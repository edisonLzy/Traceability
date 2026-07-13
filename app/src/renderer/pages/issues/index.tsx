import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { onIssueEvent } from '@renderer/lib/ws'
import { useIssues, useInvalidateIssues } from '@renderer/hooks/use-issues'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardHeader, CardMeta, CardTitle } from '@renderer/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  emptyClass,
  metricClass,
  metricsGridClass,
  pageClass,
  pageHeaderClass,
  pageTitleClass,
  pageSubtitleClass,
} from '@renderer/components/ui/styles'
import { cn } from '@renderer/lib/utils'
import type { IssueStatus } from '@traceability/protocol'

const STATUS_ITEMS: Record<string, string> = {
  all: 'All statuses',
  open: 'Open',
  'fix-manual': 'Fix requested',
  fixing: 'Fixing',
  fixed: 'Fixed',
}

export function IssuesPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const appId = params.get('appId') ?? ''
  const status = (params.get('status') ?? 'all') as 'all' | IssueStatus
  const [q, setQ] = useState('')

  const invalidateIssues = useInvalidateIssues()
  const { data, isLoading } = useIssues({ appId, limit: 100 })
  const issues = data?.items ?? []

  useEffect(() => {
    return onIssueEvent(() => { void invalidateIssues() })
  }, [invalidateIssues])

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (q && !`${i.title} ${i.id} ${i.metadata.message ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [issues, status, q])

  const open = issues.filter((i) => i.status === 'open').length
  const fixing = issues.filter((i) => i.status === 'fix-manual' || i.status === 'fixing').length
  const fixed = issues.filter((i) => i.status === 'fixed').length
  const events24h = issues.reduce((n, i) => n + i.count, 0)

  return (
    <div className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1 className={pageTitleClass}>Issues</h1>
          <p className={pageSubtitleClass}>Triage errors across all monitored applications.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => nav('/apps')}>Manage applications</Button>
        </div>
      </div>
      <div className={metricsGridClass}>
        <div className={metricClass}><div className="text-xs text-subtle">Open issues</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{open}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Events · total</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{events24h}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Fixing</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{fixing}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Resolved</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{fixed}</div></div>
      </div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative max-w-none basis-full flex-1 tablet:max-w-100">
          <span className="absolute left-3 top-2 text-tertiary">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search issues…"
            className="h-9 w-full rounded-lg border border-hairline bg-surface-1 px-3 pl-8.5 text-ink outline-none focus:border-primary"
          />
        </div>
        <Select
          value={appId || null}
          onValueChange={(v) => setParams(v ? { appId: v } : {})}
          items={{ '': 'All applications' }}
        >
          <SelectTrigger className="w-auto"><SelectValue placeholder="All applications" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All applications</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => setParams({ ...(appId ? { appId } : {}), status: String(v ?? 'all') })}
          items={STATUS_ITEMS}
        >
          <SelectTrigger className="w-auto"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All issues</CardTitle>
          <CardMeta>{filtered.length} issue{filtered.length === 1 ? '' : 's'}</CardMeta>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Issue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden tablet:table-cell">Events</TableHead>
              <TableHead className="hidden tablet:table-cell">Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => nav(`/issues/${i.id}`)}>
                <TableCell>
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.type === 'error' ? 'bg-danger' : 'bg-warning')} />
                    <div>
                      <div className="font-medium text-muted hover:text-ink">{i.title}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-tertiary">{i.id.slice(0, 8)} · {i.appId.slice(0, 8)}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={i.status === 'open' ? 'open' : i.status === 'fixed' ? 'fixed' : 'fixing'}>
                    {i.status === 'open' ? 'Open' : i.status === 'fixed' ? 'Fixed' : 'Fix requested'}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-subtle tablet:table-cell">{i.count}</TableCell>
                <TableCell className="hidden text-subtle tablet:table-cell">{new Date(i.lastSeen).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <div className={emptyClass}>{isLoading ? 'Loading issues…' : 'No issues match these filters.'}</div>}
      </Card>
    </div>
  )
}
