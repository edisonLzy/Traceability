// ===== Server data model (spec §4.7) =====

/** Standard HTTP response envelope returned by the Traceability server. */
export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
  timestamp: string;
  traceId?: string;
}

export type IssueStatus = "open" | "fix-manual" | "fixing" | "fixed" | "ignored";

export interface Application {
  id: string;
  name: string;
  repoUrl: string;
  defaultBranch: string;
  createdAt: string;
}

export interface CreateAppInput {
  name: string;
  repoUrl: string;
  defaultBranch: string;
}

export interface UpdateAppInput {
  name?: string;
  repoUrl?: string;
  defaultBranch?: string;
}

export interface Issue {
  id: string;
  appId: string;
  fingerprint: string;
  title: string;
  type: "error" | "transaction" | "message" | "custom";
  firstSeen: string;
  lastSeen: string;
  count: number;
  status: IssueStatus;
  metadata: {
    stacktrace?: string;
    message?: string;
    context?: Record<string, unknown>;
    /** Source-map resolved location for the frame where the error originated. */
    source?: SourceLocation;
    /** Resolved stack frames, ordered as they appeared in the event. */
    frames?: SourceLocation[];
  };
}

export interface ListIssuesParams {
  appId?: string;
  status?: IssueStatus;
  limit?: number;
  cursor?: string;
}

export interface ListIssuesResponse {
  items: Issue[];
  nextCursor: string | null;
}

export interface AttachPatchInput {
  branch: string;
  patch: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  function?: string;
  /** The bundled file and position that were resolved through a source map. */
  generated?: { file: string; line: number; column: number };
  /** A small, display-ready excerpt when sourcesContent was embedded in the map. */
  context?: { startLine: number; lines: string[]; errorLine: number };
}

export interface SourceMapUpload {
  release?: string;
  /** URL path or emitted asset path of the minified JavaScript file. */
  file: string;
  sourceMap: Record<string, unknown>;
}

export type PerformanceMetricName =
  | "FCP"
  | "LCP"
  | "CLS"
  | "INP"
  | "TTFB"
  | "DOMContentLoaded"
  | string;

export interface PerformanceMetric {
  name: PerformanceMetricName;
  value: number;
  unit?: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export interface RecordPerformanceInput {
  metrics?: PerformanceMetric[];
  name?: PerformanceMetricName;
  value?: number;
}

export interface GetPerformanceSummaryParams {
  appId?: string;
  hours?: number;
}

export interface PerformanceMetricSummary {
  count: number;
  average: number;
  p75: number;
  lastSeen: string;
  unit: string;
}

export interface PerformanceAppSummary {
  appId: string;
  appName: string;
  samples: number;
  metrics: Record<string, PerformanceMetricSummary>;
}

export interface PerformanceSummary {
  since: string;
  apps: PerformanceAppSummary[];
}

export interface Event {
  id: string;
  issueId: string;
  receivedAt: string;
  envelope: string;
}

export interface RrwebReplaySummary {
  id: string;
  appId: string;
  issueId?: string;
  sentryEventId?: string;
  receivedAt: string;
  capturedAt?: string;
  startAt?: number;
  endAt?: number;
  eventCount: number;
  sizeBytes: number;
  metadata: Record<string, unknown>;
}

export interface RrwebReplay extends RrwebReplaySummary {
  events: unknown[];
}

export interface RrwebReplayIngestBody {
  replayId?: string;
  sentryEventId?: string;
  capturedAt?: string;
  startAt?: number;
  endAt?: number;
  events: unknown[];
  metadata?: Record<string, unknown>;
}

export interface Patch {
  id: string;
  issueId: string;
  branch: string;
  filePath: string;
  attachedAt: string;
}

/** Summary returned by GET /api/issues/:issueId/replays */
export interface ReplaySegmentSummary {
  replayId: string;
  appId: string;
  issueId?: string;
  segmentCount: number;
  startAt?: number;
  endAt?: number;
  sizeBytes: number;
}
