import { randomUUID } from "node:crypto";

import type {
  PerformanceAppSummary,
  PerformanceMetric,
  PerformanceMetricSummary,
  PerformanceSummary,
} from "@traceability/protocol";
import type { Database } from "better-sqlite3";

interface PerformanceRow {
  app_id: string;
  app_name: string;
  metric: string;
  value: number;
  unit: string;
  measured_at: string;
}

interface ApplicationRow {
  id: string;
  name: string;
}

export function createPerformanceRepo(db: Database) {
  return {
    record(appId: string, metrics: PerformanceMetric[]): number {
      const statement = db.prepare(
        `INSERT INTO performance_samples (id, app_id, metric, value, unit, measured_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const write = db.transaction((items: PerformanceMetric[]) => {
        let accepted = 0;
        for (const item of items) {
          if (
            !item ||
            typeof item.name !== "string" ||
            !item.name.trim() ||
            !Number.isFinite(item.value)
          )
            continue;
          statement.run(
            randomUUID(),
            appId,
            item.name.trim().slice(0, 80),
            item.value,
            item.unit ?? "millisecond",
            item.timestamp ?? new Date().toISOString(),
            JSON.stringify(item.context ?? {}),
          );
          accepted += 1;
        }
        return accepted;
      });
      return write(metrics);
    },

    summary(opts: { appId?: string; hours?: number }): PerformanceSummary {
      const hours = Math.max(1, Math.min(opts.hours ?? 24, 24 * 30));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const where = opts.appId
        ? "WHERE p.measured_at >= ? AND p.app_id = ?"
        : "WHERE p.measured_at >= ?";
      const params = opts.appId ? [since, opts.appId] : [since];
      const rows = db
        .prepare(
          `SELECT p.app_id, a.name AS app_name, p.metric, p.value, p.unit, p.measured_at
         FROM performance_samples p
         JOIN applications a ON a.id = p.app_id
         ${where}
         ORDER BY p.measured_at DESC
         LIMIT 10000`,
        )
        .all(...params) as PerformanceRow[];

      const apps = new Map<
        string,
        { appId: string; appName: string; samples: number; values: Map<string, PerformanceRow[]> }
      >();
      for (const row of rows) {
        let app = apps.get(row.app_id);
        if (!app) {
          app = { appId: row.app_id, appName: row.app_name, samples: 0, values: new Map() };
          apps.set(row.app_id, app);
        }
        app.samples += 1;
        const values = app.values.get(row.metric) ?? [];
        values.push(row);
        app.values.set(row.metric, values);
      }

      const applicationRows = db
        .prepare(
          opts.appId
            ? "SELECT id, name FROM applications WHERE id = ?"
            : "SELECT id, name FROM applications",
        )
        .all(...(opts.appId ? [opts.appId] : [])) as ApplicationRow[];
      for (const application of applicationRows) {
        if (!apps.has(application.id)) {
          apps.set(application.id, {
            appId: application.id,
            appName: application.name,
            samples: 0,
            values: new Map(),
          });
        }
      }

      const result: PerformanceAppSummary[] = [...apps.values()].map((app) => {
        const metrics: Record<string, PerformanceMetricSummary> = {};
        for (const [name, rowsForMetric] of app.values) {
          const values = rowsForMetric.map((row) => row.value).sort((a, b) => a - b);
          const count = values.length;
          const p75Index = Math.max(0, Math.ceil(count * 0.75) - 1);
          metrics[name] = {
            count,
            average: values.reduce((total, value) => total + value, 0) / count,
            p75: values[p75Index] ?? 0,
            lastSeen: rowsForMetric[0]!.measured_at,
            unit: rowsForMetric[0]!.unit,
          };
        }
        return { appId: app.appId, appName: app.appName, samples: app.samples, metrics };
      });

      return { since, apps: result.sort((a, b) => a.appName.localeCompare(b.appName)) };
    },
  };
}
