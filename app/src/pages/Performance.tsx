import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import type { PerformanceAppSummary, PerformanceMetricSummary, PerformanceSummary } from '@traceability/protocol'

const rangeOptions = [
  { value: '1', label: 'Last hour' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
]

export function Performance() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const [summary, setSummary] = useState<PerformanceSummary | null>(null)
  const hours = params.get('hours') ?? '24'
  const appId = params.get('appId') ?? ''

  useEffect(() => {
    const query = new URLSearchParams({ hours })
    if (appId) query.set('appId', appId)
    apiFetch<PerformanceSummary>(`/api/performance?${query}`).then(setSummary).catch((error) => toast(String(error)))
  }, [hours, appId])

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
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-subtitle">Web Vitals and application-defined performance measurements, grouped by application.</p>
        </div>
      </div>
      <div className="metrics">
        <div className="metric"><div className="metric-label">Monitored applications</div><div className="metric-value">{totals.apps}</div></div>
        <div className="metric"><div className="metric-label">Metric samples</div><div className="metric-value">{totals.samples}</div></div>
        <div className="metric"><div className="metric-label">Metric types</div><div className="metric-value">{totals.metricKinds}</div></div>
        <div className="metric"><div className="metric-label">Since</div><div className="metric-value metric-date">{summary ? new Date(summary.since).toLocaleString() : '—'}</div></div>
      </div>
      <div className="toolbar">
        <select className="select" value={hours} onChange={(event) => update({ ...(appId ? { appId } : {}), hours: event.target.value })}>
          {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {appId && <button className="btn btn-sm" onClick={() => update({ hours })}>Clear application filter</button>}
      </div>
      {!summary && <div className="empty">Loading performance data…</div>}
      {summary && summary.apps.length === 0 && <div className="empty">No performance samples in this time range. The SDK reports FCP, LCP, CLS, INP, TTFB and DOMContentLoaded automatically.</div>}
      <div className="performance-grid">
        {summary?.apps.map((app) => <ApplicationPerformance key={app.appId} app={app} />)}
      </div>
    </div>
  )
}

function ApplicationPerformance({ app }: { app: PerformanceAppSummary }) {
  return (
    <section className="panel performance-card">
      <div className="panel-head">
        <div>
          <div className="panel-title">{app.appName}</div>
          <div className="panel-meta panel-meta-static">{app.appId.slice(0, 8)} · {app.samples} samples</div>
        </div>
      </div>
      <table className="data-table">
        <thead><tr><th>Metric</th><th>Average</th><th>p75</th><th>Samples</th><th>Last seen</th></tr></thead>
        <tbody>
          {Object.entries(app.metrics).sort(([a], [b]) => a.localeCompare(b)).map(([name, metric]) => (
            <tr key={name}>
              <td><span className="metric-name">{name}</span></td>
              <td>{formatMetric(metric, metric.average)}</td>
              <td>{formatMetric(metric, metric.p75)}</td>
              <td className="muted">{metric.count}</td>
              <td className="muted">{new Date(metric.lastSeen).toLocaleString()}</td>
            </tr>
          ))}
          {Object.keys(app.metrics).length === 0 && <tr><td colSpan={5} className="muted">No performance samples received yet.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

function formatMetric(metric: PerformanceMetricSummary, value: number): string {
  if (metric.unit === 'score') return value.toFixed(3)
  if (metric.unit === 'percent') return `${value.toFixed(1)}%`
  if (metric.unit === 'byte') return `${(value / 1024).toFixed(1)} KB`
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
}
