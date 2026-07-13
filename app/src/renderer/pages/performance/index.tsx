import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { usePerformanceSummary } from '@renderer/pages/performance/hooks/use-performance'
import { ApplicationPerformance } from '@renderer/pages/performance/components/ApplicationPerformance'
import { Button } from '@renderer/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'

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
    <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
      <div className="mb-7 flex items-start justify-between gap-3.5">
        <div>
          <h1 className="m-0 text-2xl leading-tight font-semibold tracking-[-0.7px] tablet:text-[28px]">Performance</h1>
          <p className="mt-1.5 text-subtle">Web Vitals and application-defined performance measurements, grouped by application.</p>
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
      <div className="mb-6 grid grid-cols-1 overflow-hidden rounded-xl border border-hairline bg-surface-1 tablet:grid-cols-2 desktop:grid-cols-4">
        <div className="px-5 py-4.5 border-hairline border-b last:border-b-0 tablet:[&:nth-child(3)]:border-b-0 desktop:border-b-0 tablet:[&:nth-child(odd)]:border-r desktop:[&:nth-child(2)]:border-r"><div className="text-xs text-subtle">Monitored applications</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.apps}</div></div>
        <div className="px-5 py-4.5 border-hairline border-b last:border-b-0 tablet:[&:nth-child(3)]:border-b-0 desktop:border-b-0 tablet:[&:nth-child(odd)]:border-r desktop:[&:nth-child(2)]:border-r"><div className="text-xs text-subtle">Metric samples</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.samples}</div></div>
        <div className="px-5 py-4.5 border-hairline border-b last:border-b-0 tablet:[&:nth-child(3)]:border-b-0 desktop:border-b-0 tablet:[&:nth-child(odd)]:border-r desktop:[&:nth-child(2)]:border-r"><div className="text-xs text-subtle">Metric types</div><div className="mt-1.5 text-[22px] font-semibold tracking-[-0.5px]">{totals.metricKinds}</div></div>
        <div className="px-5 py-4.5 border-hairline border-b last:border-b-0 tablet:[&:nth-child(3)]:border-b-0 desktop:border-b-0 tablet:[&:nth-child(odd)]:border-r desktop:[&:nth-child(2)]:border-r"><div className="text-xs text-subtle">Since</div><div className="mt-1.5 pt-2 font-semibold text-[13px] tracking-normal">{summary ? new Date(summary.since).toLocaleString() : '-'}</div></div>
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
      {!summary && <div className="px-5 py-13.5 text-center text-subtle">Loading performance data…</div>}
      {summary && summary.apps.length === 0 && <div className="px-5 py-13.5 text-center text-subtle">No performance samples in this time range. The SDK reports FCP, LCP, CLS, INP, TTFB and DOMContentLoaded automatically.</div>}
      <div className="grid gap-3.5">
        {summary?.apps.map((app) => <ApplicationPerformance key={app.appId} app={app} hours={selectedHours} />)}
      </div>
    </div>
  )
}

function toHours(value: string): 1 | 24 | 168 {
  return value === '1' ? 1 : value === '168' ? 168 : 24
}
