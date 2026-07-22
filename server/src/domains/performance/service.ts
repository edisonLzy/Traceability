import { eq, desc, gte, and } from "drizzle-orm";
import { z } from "zod";

import { getApp } from "../apps/service.js";
import type { SentryEventPayload } from "../ingest/types.js";
import { db, performanceSamples } from "./db.js";

export function recordFromTransaction(
  appId: string,
  payload: SentryEventPayload,
): { accepted: number } {
  const measurements = payload.measurements;
  if (!measurements || Object.keys(measurements).length === 0) {
    return { accepted: 0 };
  }

  const now = new Date().toISOString();
  let accepted = 0;

  for (const [name, m] of Object.entries(measurements)) {
    if (typeof m.value !== "number") continue;
    db.insert(performanceSamples)
      .values({
        id: crypto.randomUUID(),
        appId,
        metric: name.slice(0, 80),
        value: m.value,
        unit: m.unit ?? "millisecond",
        measuredAt:
          typeof payload.timestamp === "number"
            ? new Date(payload.timestamp * 1000).toISOString()
            : now,
        metadata: JSON.stringify({
          transaction: payload.transaction,
          eventId: payload.event_id,
        }),
      })
      .run();
    accepted++;
  }

  return { accepted };
}

export const SummarySchema = z.object({
  appId: z.string().optional(),
  hours: z.coerce.number().min(1).max(720).optional().default(24),
});

export function getPerformanceSummary(raw: unknown) {
  const opts = SummarySchema.parse(raw);
  const hours = Math.max(1, Math.min(opts.hours ?? 24, 24 * 30));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const conditions = [gte(performanceSamples.measuredAt, since)];
  if (opts.appId) conditions.push(eq(performanceSamples.appId, opts.appId));

  const rows = db
    .select()
    .from(performanceSamples)
    .where(and(...conditions))
    .orderBy(desc(performanceSamples.measuredAt))
    .limit(10000)
    .all();

  // Group by app & metric, compute p75 in-memory
  const appMap = new Map<
    string,
    {
      appId: string;
      samples: number;
      values: Map<string, Array<{ value: number; unit: string; measuredAt: string }>>;
    }
  >();

  for (const row of rows) {
    let app = appMap.get(row.appId);
    if (!app) {
      app = { appId: row.appId, samples: 0, values: new Map() };
      appMap.set(row.appId, app);
    }
    app.samples++;
    const vals = app.values.get(row.metric) ?? [];
    vals.push({ value: row.value, unit: row.unit, measuredAt: row.measuredAt });
    app.values.set(row.metric, vals);
  }

  // Include apps that registered recently even without samples in window
  // (The old code queried applications table for this; skipping for now matches basic behavior)

  const apps = [...appMap.values()].map((app) => {
    const metrics: Record<
      string,
      {
        count: number;
        average: number;
        p75: number;
        lastSeen: string;
        unit: string;
      }
    > = {};
    for (const [name, values] of app.values) {
      const sorted = values.map((v) => v.value).sort((a, b) => a - b);
      const count = sorted.length;
      const p75Index = Math.max(0, Math.ceil(count * 0.75) - 1);
      metrics[name] = {
        count,
        average: sorted.reduce((t, v) => t + v, 0) / count,
        p75: sorted[p75Index] ?? 0,
        lastSeen: values[0]!.measuredAt,
        unit: values[0]!.unit,
      };
    }
    return { appId: app.appId, appName: app.appId, samples: app.samples, metrics };
  });

  return { since, apps: apps.sort((a, b) => a.appId.localeCompare(b.appId)) };
}
