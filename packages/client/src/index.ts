import type {
  ApiResponse,
  Application,
  AttachPatchInput,
  CreateAppInput,
  Event,
  GetPerformanceSummaryParams,
  Issue,
  ListIssuesParams,
  ListIssuesResponse,
  PerformanceSummary,
  RecordPerformanceInput,
  RrwebReplay,
  RrwebReplayIngestBody,
  RrwebReplaySummary,
  SourceMapUpload,
  UpdateAppInput,
} from "@traceability/protocol";
import axios from "axios";
import type { AxiosInstance, AxiosResponse } from "axios";

export type {
  ApiResponse,
  Application,
  AttachPatchInput,
  CreateAppInput,
  Event,
  GetPerformanceSummaryParams,
  Issue,
  ListIssuesParams,
  ListIssuesResponse,
  PerformanceSummary,
  RecordPerformanceInput,
  RrwebReplay,
  RrwebReplayIngestBody,
  RrwebReplaySummary,
  SourceMapUpload,
  UpdateAppInput,
} from "@traceability/protocol";

export interface TraceabilityClientOptions {
  baseUrl: string;
  /**
   * A pre-provisioned bearer token. When set, the client uses it for every
   * authenticated request without needing to call `login()`. Useful for the
   * CLI, which stores a static token in its config. If omitted, call `login()`
   * before making authenticated requests.
   */
  token?: string;
}

export interface LoginInput {
  account: string;
  password: string;
}

export interface TraceabilityClientErrorOptions {
  status?: number;
  code?: number;
  traceId?: string;
}

/** An HTTP, server-business, or client protocol error. */
export class TraceabilityClientError extends Error {
  readonly status: number | undefined;
  readonly code: number | undefined;
  readonly traceId: string | undefined;

  constructor(message: string, options: TraceabilityClientErrorOptions = {}) {
    super(message);
    this.name = "TraceabilityClientError";
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
  }
}

export interface TraceabilityClient {
  login(input: LoginInput): Promise<void>;
  health: {
    check(): Promise<"ok">;
  };
  apps: {
    list(): Promise<Application[]>;
    get(appId: string): Promise<Application>;
    create(input: CreateAppInput): Promise<Application>;
    update(appId: string, input: UpdateAppInput): Promise<Application>;
    remove(appId: string): Promise<void>;
    uploadSourceMap(appId: string, input: SourceMapUpload): Promise<{ ok: true }>;
  };
  issues: {
    list(input?: ListIssuesParams): Promise<ListIssuesResponse>;
    get(issueId: string): Promise<Issue>;
    getEvents(issueId: string, input?: { limit?: number }): Promise<Event[]>;
    requestFix(issueId: string): Promise<Issue>;
    attachPatch(issueId: string, input: AttachPatchInput): Promise<Issue>;
    markFixed(issueId: string): Promise<Issue>;
  };
  replays: {
    save(appId: string, input: RrwebReplayIngestBody): Promise<RrwebReplay>;
    listForIssue(issueId: string, input?: { limit?: number }): Promise<RrwebReplaySummary[]>;
    getForIssue(issueId: string, replayId: string): Promise<RrwebReplay>;
  };
  performance: {
    record(appId: string, input: RecordPerformanceInput): Promise<{ accepted: number }>;
    getSummary(input?: GetPerformanceSummaryParams): Promise<PerformanceSummary>;
  };
  ingest: {
    envelope(appId: string, envelope: string): Promise<{ accepted: number }>;
  };
}

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";
type QueryParams = Record<string, number | string | undefined>;

interface RequestOptions {
  method: HttpMethod;
  url: string;
  data?: unknown;
  params?: QueryParams;
  headers?: Record<string, string>;
}

interface LoginResponse {
  token: string;
}

class TraceabilityClientImpl implements TraceabilityClient {
  private token: string | undefined;
  private loginInFlight: Promise<void> | undefined;
  private readonly http: AxiosInstance;

  readonly health = {
    check: () => this.request<"ok">({ method: "GET", url: "/health" }),
  };

  readonly apps = {
    list: () => this.request<Application[]>({ method: "GET", url: "/api/apps" }),
    get: (appId: string) =>
      this.request<Application>({ method: "GET", url: `/api/apps/${pathParam(appId)}` }),
    create: (input: CreateAppInput) =>
      this.request<Application>({ method: "POST", url: "/api/apps", data: input }),
    update: (appId: string, input: UpdateAppInput) =>
      this.request<Application>({
        method: "PATCH",
        url: `/api/apps/${pathParam(appId)}`,
        data: input,
      }),
    remove: async (appId: string) => {
      await this.request<void>({ method: "DELETE", url: `/api/apps/${pathParam(appId)}` });
    },
    uploadSourceMap: (appId: string, input: SourceMapUpload) =>
      this.request<{ ok: true }>({
        method: "POST",
        url: `/api/apps/${pathParam(appId)}/sourcemaps`,
        data: input,
      }),
  };

  readonly issues = {
    list: (input: ListIssuesParams = {}) =>
      this.request<ListIssuesResponse>({
        method: "GET",
        url: "/api/issues",
        params: definedParams(input),
      }),
    get: (issueId: string) =>
      this.request<Issue>({ method: "GET", url: `/api/issues/${pathParam(issueId)}` }),
    getEvents: (issueId: string, input: { limit?: number } = {}) =>
      this.request<Event[]>({
        method: "GET",
        url: `/api/issues/${pathParam(issueId)}/events`,
        params: definedParams(input),
      }),
    requestFix: (issueId: string) =>
      this.request<Issue>({
        method: "POST",
        url: `/api/issues/${pathParam(issueId)}/fix-request`,
      }),
    attachPatch: (issueId: string, input: AttachPatchInput) =>
      this.request<Issue>({
        method: "POST",
        url: `/api/issues/${pathParam(issueId)}/attach-patch`,
        data: input,
      }),
    markFixed: (issueId: string) =>
      this.request<Issue>({
        method: "POST",
        url: `/api/issues/${pathParam(issueId)}/mark-fixed`,
      }),
  };

  readonly replays = {
    save: (appId: string, input: RrwebReplayIngestBody) =>
      this.request<RrwebReplay>({
        method: "POST",
        url: `/api/ingest/rrweb/${pathParam(appId)}`,
        data: input,
      }),
    listForIssue: (issueId: string, input: { limit?: number } = {}) =>
      this.request<RrwebReplaySummary[]>({
        method: "GET",
        url: `/api/issues/${pathParam(issueId)}/replays`,
        params: definedParams(input),
      }),
    getForIssue: (issueId: string, replayId: string) =>
      this.request<RrwebReplay>({
        method: "GET",
        url: `/api/issues/${pathParam(issueId)}/replays/${pathParam(replayId)}`,
      }),
  };

  readonly performance = {
    record: (appId: string, input: RecordPerformanceInput) =>
      this.request<{ accepted: number }>({
        method: "POST",
        url: `/api/ingest/performance/${pathParam(appId)}`,
        data: input,
      }),
    getSummary: (input: GetPerformanceSummaryParams = {}) =>
      this.request<PerformanceSummary>({
        method: "GET",
        url: "/api/performance",
        params: definedParams(input),
      }),
  };

  readonly ingest = {
    envelope: (appId: string, envelope: string) =>
      this.request<{ accepted: number }>({
        method: "POST",
        url: `/api/ingest/envelope/${pathParam(appId)}`,
        data: envelope,
        headers: { "Content-Type": "text/plain" },
      }),
  };

  constructor(options: TraceabilityClientOptions) {
    if (!options.baseUrl.trim()) throw new Error("baseUrl is required");
    this.http = axios.create({ baseURL: options.baseUrl.replace(/\/+$/, "") });
    this.token = options.token;
  }

  async login(input: LoginInput): Promise<void> {
    if (this.loginInFlight) return this.loginInFlight;

    const attempt = this.request<LoginResponse>(
      { method: "POST", url: "/api/auth/login", data: input },
      false,
    ).then((session) => {
      if (!session || typeof session.token !== "string" || !session.token) {
        throw new TraceabilityClientError("Login response did not contain a token");
      }
      this.token = session.token;
    });

    this.loginInFlight = attempt;
    try {
      await attempt;
    } finally {
      this.loginInFlight = undefined;
    }
  }

  private async request<T>(options: RequestOptions, requiresAuth = true): Promise<T> {
    if (requiresAuth && !this.token) {
      throw new TraceabilityClientError("Authenticate with login() before making this request", {
        status: 401,
        code: 401,
      });
    }

    const headers = {
      ...options.headers,
      ...(requiresAuth ? { Authorization: `Bearer ${this.token}` } : {}),
    };
    const request = {
      method: options.method,
      url: options.url,
      ...(options.data === undefined ? {} : { data: options.data }),
      ...(options.params && Object.keys(options.params).length > 0
        ? { params: options.params }
        : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };

    try {
      const response = await this.http.request<ApiResponse<T>>(request);
      return unwrapResponse(response);
    } catch (error) {
      const clientError = toClientError(error);
      if (clientError.status === 401) this.token = undefined;
      throw clientError;
    }
  }
}

/** Creates a client whose session is held only in this instance's memory. */
export function createTraceabilityClient(options: TraceabilityClientOptions): TraceabilityClient {
  return new TraceabilityClientImpl(options);
}

function pathParam(value: string): string {
  return encodeURIComponent(value);
}

function definedParams(params: object): QueryParams {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => typeof value === "number" || typeof value === "string",
    ),
  );
}

function unwrapResponse<T>(response: AxiosResponse<ApiResponse<T>>): T {
  if (response.status === 204) return undefined as T;
  const body = readApiResponse(response.data);
  if (body.code !== 0) {
    throw new TraceabilityClientError(body.message ?? `Request failed (code: ${body.code})`, {
      status: response.status,
      code: body.code,
      traceId: body.traceId,
    });
  }
  return body.data as T;
}

function toClientError(error: unknown): TraceabilityClientError {
  if (error instanceof TraceabilityClientError) return error;

  const response = responseFromError(error);
  if (response) {
    const body = tryReadApiResponse(response.data);
    if (body) {
      return new TraceabilityClientError(body.message ?? `Request failed (code: ${body.code})`, {
        status: response.status,
        code: body.code,
        traceId: body.traceId,
      });
    }
    return new TraceabilityClientError(`HTTP ${response.status}`, { status: response.status });
  }

  return new TraceabilityClientError(error instanceof Error ? error.message : "Request failed");
}

function responseFromError(error: unknown): { data: unknown; status: number } | undefined {
  if (!error || typeof error !== "object" || !("response" in error)) return undefined;
  const response = error.response;
  if (!response || typeof response !== "object") return undefined;
  if (!("status" in response) || typeof response.status !== "number") return undefined;
  return {
    status: response.status,
    data: "data" in response ? response.data : undefined,
  };
}

function readApiResponse(value: unknown): ApiResponse<unknown> {
  const response = tryReadApiResponse(value);
  if (!response) throw new TraceabilityClientError("Unexpected API response");
  return response;
}

function tryReadApiResponse(value: unknown): ApiResponse<unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!("code" in value) || typeof value.code !== "number") return undefined;
  if (!("data" in value) || !("timestamp" in value) || typeof value.timestamp !== "string") {
    return undefined;
  }
  if ("message" in value && value.message !== undefined && typeof value.message !== "string") {
    return undefined;
  }
  if ("traceId" in value && value.traceId !== undefined && typeof value.traceId !== "string") {
    return undefined;
  }
  return value as ApiResponse<unknown>;
}
