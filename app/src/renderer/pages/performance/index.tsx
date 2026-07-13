import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { usePerformanceSummary } from '@renderer/hooks/use-performance'
import { Button } from '@renderer/components/ui/button'
import { Card, CardHeader, CardTitle } from '@renderer/components/ui/card'
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
import type { PerformanceAppSummary, PerformanceMetricSummary } from '@traceability/protocol'

const RANGE_ITEMS: Record<string, string> = {
  '1': 'Last hour',
  '24': 'Last 24 hours',
  '168': 'Last 7 days',
}

export function PerformancePage() {
  const [params, setParams] = useSearchParams()
  const hours = params.get('hours') ?? '24'
  const appId = params.get('appId') ?? ''
  const selectedHours = toHours(hours)

  const { data: summary, error } = usePerformanceSummary({ appId, hours: selectedHours })

  useEffect(() => {
    if (error) toast(String(error))
  }, [error])

  const totals = useMemo(() => {
    const apps = summary?.apps ?? []
    return {
      apps: apps.length,
      samples: apps.reduce((total, app) => total + app.samples, 0),
      metricKinds: new Set(apps.flatMap((app) => Object.keys(app.metrics))).size,
    }
  }, [summary])

  const update = (next: Record<string, string>) => setParams(next)

  return (
    <div className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1 className={pageTitleClass}>Performance</h1>
          <p className={pageSubtitleClass}>Web Vitals and application-defined performance measurements, grouped by application.</p>
        </div>
        {appId && (
          <Button variant="primary" onClick={() => {
            window.dispatchEvent(new CustomEvent('traceability:agent-context', {
              detail: { appId, source: 'performance', hours: selectedHours },
            }))
            toast('Performance context attached to Traceability Agent')
          }}>Analyze with Agent</Button>
        )}
      </div>
      <div className={metricsGridClass}>
        <div className={metricClass}><div className="text-xs text-subtle">Monitored applications</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.apps}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Metric samples</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.samples}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Metric types</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.metricKinds}</div></div>
        <div className={metricClass}><div className="text-xs text-subtle">Since</div><div className="mt-1.5 pt-2 font-semibold text-[13px] tracking-normal">{summary ? new Date(summary.since).toLocaleString() : '-'}</div></div>
      </div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <Select
          value={hours}
          onValueChange={(v) => update({ ...(appId ? { appId } : {}), hours: String(v ?? '24') })}
          items={RANGE_ITEMS}
        >
          <SelectTrigger className="w-auto"><SelectValue placeholder="Last 24 hours" /></SelectTrigger>
          <SelectContent>
            {Object.entries(RANGE_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {appId && <Button size="sm" onClick={() => update({ hours })}>Clear application filter</Button>}
      </div>
      {!summary && <div className={emptyClass}>Loading performance data…</div>}
      {summary && summary.apps.length === 0 && <div className={emptyClass}>No performance samples in this time range. The SDK reports FCP, LCP, CLS, INP, TTFB and DOMContentLoaded automatically.</div>}
      <div className="grid gap-3.5">
        {summary?.apps.map((app) => <ApplicationPerformance key={app.appId} app={app} hours={selectedHours} />)}
      </div>
    </div>
  )
}

function ApplicationPerformance({ app, hours }: { app: PerformanceAppSummary; hours: 1 | 24 | 168 }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
      <CardHeader className="min-h-0 items-start px-4 py-3">
        <div>
          <CardTitle>{app.appName}</CardTitle>
          <div className="mt-0.5 text-xs text-tertiary">{app.appId.slice(0, 8)} · {app.samples} samples</div>
        </div>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Metric</TableHead>
            <TableHead>Average</TableHead>
            <TableHead>p75</TableHead>
            <TableHead>Samples</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(app.metrics).sort(([a], [b]) => a.localeCompare(b)).map(([name, metric]) => (
            <TableRow key={name}>
              <TableCell><span className="font-mono text-xs text-[#aeb7ff]">{name}</span></TableCell>
              <TableCell>{formatMetric(metric, metric.average)}</TableCell>
              <TableCell>{formatMetric(metric, metric.p75)}</TableCell>
              <TableCell className="text-subtle">{metric.count}</TableCell>
              <TableCell className="text-subtle">{new Date(metric.lastSeen).toLocaleString()}</TableCell>
              <TableCell>
                <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent('traceability:agent-context', {
                  detail: { appId: app.appId, source: 'metric', metricName: name, hours },
                }))}>Ask Agent</Button>
              </TableCell>
            </TableRow>
          ))}
          {Object.keys(app.metrics).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-subtle">No performance samples received yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  )
}

function formatMetric(metric: PerformanceMetricSummary, value: number): string {
  if (metric.unit === 'score') return value.toFixed(3)
  if (metric.unit === 'percent') return `${value.toFixed(1)}%`
  if (metric.unit === 'byte') return `${(value / 1024).toFixed(1)} KB`
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
}

function toHours(value: string): 1 | 24 | 168 {
  return value === '1' ? 1 : value === '168' ? 168 : 24
}
