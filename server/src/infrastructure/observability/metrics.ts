import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

export class ServerMetrics {
  public readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "traceability_http_requests_total",
    help: "Completed HTTP requests by route and status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: "traceability_http_request_duration_seconds",
    help: "HTTP request duration by route and status.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "traceability_process_" });
  }

  observeRequest(input: { method: string; route: string; statusCode: number; durationMs: number }) {
    const labels = {
      method: input.method,
      route: input.route,
      status: String(input.statusCode),
    };
    this.requests.inc(labels);
    this.duration.observe(labels, input.durationMs / 1_000);
  }
}
