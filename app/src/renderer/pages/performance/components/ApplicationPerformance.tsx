import { Button } from '@renderer/components/ui/button'
import { CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import type { PerformanceAppSummary, PerformanceMetricSummary } from '@traceability/protocol'

export function ApplicationPerformance({ app, hours }: { app: PerformanceAppSummary; hours: 1 | 24 | 168 }) {
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
