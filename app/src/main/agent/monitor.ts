import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { TSchema } from "@earendil-works/pi-ai";
import axios, { type AxiosInstance } from "axios";
import { z } from "zod";

export type MonitorToolMethod =
  | "listIssues"
  | "getIssue"
  | "getIssueEvents"
  | "getIssueReplays"
  | "getReplay"
  | "getPerformanceSummary";

/**
 * Self-contained monitor data access for the agent.
 *
 * The agent runs in the main process and fetches monitoring data directly from
 * the server (address from `VITE_SERVER_URL`) -- no IPC detour through the
 * renderer. The session's `appId` is pinned at construction; every response is
 * zod-validated and checked for `appId` ownership so an LLM cannot smuggle
 * another application's data through a tool call.
 */
export class MonitorClient {
  constructor(
    private readonly http: AxiosInstance,
    private readonly appId: string,
  ) {}

  async listIssues(args: { status?: string; limit?: number }): Promise<unknown> {
    const query = new URLSearchParams({ appId: this.appId, limit: String(asLimit(args.limit)) });
    if (typeof args.status === "string") query.set("status", args.status);
    const result = await this.http.get(`/api/issues?${query}`).then((r) => r.data);
    const parsed = monitorResultSchemas.listIssues.parse(result);
    if (!parsed.items.every(belongsTo(this.appId))) {
      throw new Error("Monitoring service returned an Issue outside this session application");
    }
    return parsed;
  }

  async getIssue(issueId: string): Promise<unknown> {
    const result = await this.http
      .get(`/api/issues/${requiredId(issueId, "issueId")}`)
      .then((r) => r.data);
    const parsed = monitorResultSchemas.getIssue.parse(result);
    if (!belongsTo(this.appId)(parsed)) {
      throw new Error("Monitoring service returned an Issue outside this session application");
    }
    return parsed;
  }

  async getIssueEvents(issueId: string): Promise<unknown> {
    await this.assertIssueScope(issueId);
    const result = await this.http
      .get(`/api/issues/${requiredId(issueId, "issueId")}/events`)
      .then((r) => r.data);
    return monitorResultSchemas.getIssueEvents.parse(result);
  }

  async getIssueReplays(issueId: string): Promise<unknown> {
    await this.assertIssueScope(issueId);
    const result = await this.http
      .get(`/api/issues/${requiredId(issueId, "issueId")}/replays`)
      .then((r) => r.data);
    const parsed = monitorResultSchemas.getIssueReplays.parse(result);
    if (!parsed.every(belongsTo(this.appId))) {
      throw new Error("Monitoring service returned replay data outside this session application");
    }
    return parsed;
  }

  async getReplay(issueId: string, replayId: string): Promise<unknown> {
    await this.assertIssueScope(issueId);
    const issue = requiredId(issueId, "issueId");
    const replay = requiredId(replayId, "replayId");
    const result = await this.http
      .get(`/api/issues/${issue}/replays/${replay}`)
      .then((r) => r.data);
    const parsed = monitorResultSchemas.getReplay.parse(result);
    if (!belongsTo(this.appId)(parsed)) {
      throw new Error("Monitoring service returned replay data outside this session application");
    }
    return parsed;
  }

  async getPerformanceSummary(args: { hours: number }): Promise<unknown> {
    const query = new URLSearchParams({ appId: this.appId, hours: String(asHours(args.hours)) });
    const result = await this.http.get(`/api/performance?${query}`).then((r) => r.data);
    const parsed = monitorResultSchemas.getPerformanceSummary.parse(result);
    if (!parsed.apps.every(belongsTo(this.appId))) {
      throw new Error(
        "Monitoring service returned Performance data outside this session application",
      );
    }
    return parsed;
  }

  /**
   * Events carry no `appId`, so ownership cannot be checked after the fact --
   * verify the parent Issue belongs to this session before fetching its nested
   * resources. Replays already carry `appId` (checked above) but we keep this
   * guard for them too as defense in depth.
   */
  private async assertIssueScope(issueId: string): Promise<void> {
    const result = await this.http
      .get(`/api/issues/${requiredId(issueId, "issueId")}`)
      .then((r) => r.data);
    const issue = monitorResultSchemas.getIssue.parse(result);
    if (!belongsTo(this.appId)(issue)) {
      throw new Error("Requested Issue belongs to another application");
    }
  }
}

export function createMonitorTools(client: MonitorClient): AgentTool[] {
  return [
    createTool(
      "monitor.listIssues",
      "List Issues",
      "List runtime issues for the current application.",
      "listIssues",
      Type.Object({
        status: Type.Optional(Type.String({ description: "Optional issue status filter" })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      }),
    ),
    createTool(
      "monitor.getIssue",
      "Get Issue",
      "Get one issue and its current metadata.",
      "getIssue",
      Type.Object({
        issueId: Type.String({ description: "Issue ID" }),
      }),
    ),
    createTool(
      "monitor.getIssueEvents",
      "Get Issue Events",
      "Get recent events that belong to an issue.",
      "getIssueEvents",
      Type.Object({
        issueId: Type.String({ description: "Issue ID" }),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
      }),
    ),
    createTool(
      "monitor.getIssueReplays",
      "Get Issue Replays",
      "List rrweb replay summaries for an issue.",
      "getIssueReplays",
      Type.Object({
        issueId: Type.String({ description: "Issue ID" }),
      }),
    ),
    createTool(
      "monitor.getReplay",
      "Get Replay",
      "Get a complete rrweb replay for an issue.",
      "getReplay",
      Type.Object({
        issueId: Type.String({ description: "Issue ID" }),
        replayId: Type.String({ description: "Replay ID" }),
      }),
    ),
    createTool(
      "monitor.getPerformanceSummary",
      "Get Performance Summary",
      "Get performance metric summaries for the current application.",
      "getPerformanceSummary",
      Type.Object({
        hours: Type.Number({ minimum: 1, maximum: 168, description: "Time range in hours" }),
      }),
    ),
  ];

  function createTool(
    name: string,
    label: string,
    description: string,
    method: MonitorToolMethod,
    parameters: TSchema,
  ): AgentTool {
    return {
      name,
      label,
      description,
      parameters,
      async execute(_toolCallId, args) {
        const a = args as Record<string, unknown>;
        const result =
          method === "listIssues"
            ? await client.listIssues({ status: asString(a.status), limit: asNumber(a.limit) })
            : method === "getIssue"
              ? await client.getIssue(requiredString(a.issueId, "issueId"))
              : method === "getIssueEvents"
                ? await client.getIssueEvents(requiredString(a.issueId, "issueId"))
                : method === "getIssueReplays"
                  ? await client.getIssueReplays(requiredString(a.issueId, "issueId"))
                  : method === "getReplay"
                    ? await client.getReplay(
                        requiredString(a.issueId, "issueId"),
                        requiredString(a.replayId, "replayId"),
                      )
                    : await client.getPerformanceSummary({ hours: asHours(a.hours) });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    };
  }
}

/**
 * Builds an axios instance pointed at the monitoring server. The server address
 * is a build-time constant from `VITE_SERVER_URL` (no auth in the MVP), so it is
 * baked in at construction. If unset, `baseURL` is `''` and tool calls fail fast.
 */
export function createMonitorHttp(): AxiosInstance {
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "");
  const http = axios.create({ baseURL: serverUrl });
  // The server wraps success responses in {code, data, timestamp}; unwrap so
  // `.then(r => r.data)` yields the inner data for zod validation.
  http.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === "object" && "code" in body && "data" in body) {
      response.data = body.data;
    }
    return response;
  });
  return http;
}

function belongsTo(appId: string): (candidate: { appId: string }) => boolean {
  return (candidate) => candidate.appId === appId;
}

function asLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(1, value))
    : 20;
}

function asHours(value: unknown): number {
  return value === 1 || value === 168 ? value : 24;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  return value;
}

function requiredId(value: string, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  return encodeURIComponent(value);
}

// ── Response validation ──────────────────────────────────────────────────────

const issueSchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    title: z.string(),
  })
  .passthrough();

const replaySchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    issueId: z.string().optional(),
    eventCount: z.number(),
    sizeBytes: z.number(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const performanceMetricSchema = z.object({
  count: z.number(),
  average: z.number(),
  p75: z.number(),
  lastSeen: z.string(),
  unit: z.string(),
});

const monitorResultSchemas = {
  listIssues: z
    .object({
      items: z.array(issueSchema),
      nextCursor: z.string().nullable(),
    })
    .passthrough(),
  getIssue: issueSchema,
  getIssueEvents: z.array(z.object({ id: z.string(), issueId: z.string() }).passthrough()),
  getIssueReplays: z.array(replaySchema),
  getReplay: replaySchema.extend({ events: z.array(z.unknown()) }),
  getPerformanceSummary: z
    .object({
      since: z.string(),
      apps: z.array(
        z
          .object({
            appId: z.string(),
            appName: z.string(),
            samples: z.number(),
            metrics: z.record(z.string(), performanceMetricSchema),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
} satisfies Record<MonitorToolMethod, z.ZodType>;
