import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTraceabilityClient, TraceabilityClientError } from "../src/index.js";

type RequestHandler = (config: AxiosRequestConfig) => Promise<AxiosResponse>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Traceability client", () => {
  it("logs in, keeps the token in memory, and unwraps response data", async () => {
    const request = mockHttp(async (config) => {
      if (config.url === "/api/auth/login") return response({ token: "session-token" });
      return response([{ id: "app-1" }]);
    });
    const client = createTraceabilityClient({ baseUrl: "http://monitor.local/" });

    await client.login({ account: "alice", password: "correct horse battery staple" });
    const apps = await client.apps.list();

    expect(axios.create).toHaveBeenCalledWith({ baseURL: "http://monitor.local" });
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: "POST",
      url: "/api/auth/login",
      data: { account: "alice", password: "correct horse battery staple" },
    });
    expect(request.mock.calls[1]?.[0]).toEqual({
      method: "GET",
      url: "/api/apps",
      headers: { Authorization: "Bearer session-token" },
    });
    expect(apps).toEqual([{ id: "app-1" }]);
  });

  it("uses a pre-provisioned token without calling login()", async () => {
    const request = mockHttp(async () => response([{ id: "app-1" }]));
    const client = createTraceabilityClient({
      baseUrl: "http://monitor.local",
      token: "static-token",
    });

    const apps = await client.apps.list();

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: "GET",
      url: "/api/apps",
      headers: { Authorization: "Bearer static-token" },
    });
    expect(apps).toEqual([{ id: "app-1" }]);
  });

  it("deduplicates concurrent login attempts", async () => {
    let resolveLogin: ((result: AxiosResponse) => void) | undefined;
    const request = mockHttp(
      () =>
        new Promise<AxiosResponse>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    const client = createTraceabilityClient({ baseUrl: "http://monitor.local" });

    const first = client.login({ account: "alice", password: "secret" });
    const second = client.login({ account: "bob", password: "other-secret" });

    expect(request).toHaveBeenCalledOnce();
    resolveLogin?.(response({ token: "session-token" }));
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      data: { account: "alice", password: "secret" },
    });
  });

  it("maps every REST endpoint to its method, path, parameters, and body", async () => {
    const request = mockHttp(async (config) => {
      if (config.url === "/api/auth/login") return response({ token: "session-token" });
      if (config.method === "DELETE") return response(undefined, 204);
      return response({});
    });
    const client = createTraceabilityClient({ baseUrl: "http://monitor.local" });
    await client.login({ account: "alice", password: "secret" });

    await client.health.check();
    await client.apps.list();
    await client.apps.get("app/id");
    await client.apps.create({
      name: "Shop",
      repoUrl: "git@example.com:shop.git",
      defaultBranch: "main",
    });
    await client.apps.update("app/id", { name: "Store" });
    await client.apps.remove("app/id");
    await client.apps.uploadSourceMap("app/id", { file: "assets/app.js", sourceMap: {} });
    await client.issues.list({ appId: "app/id", status: "open", limit: 20, cursor: "cursor" });
    await client.issues.get("issue/id");
    await client.issues.getEvents("issue/id", { limit: 50 });
    await client.issues.requestFix("issue/id");
    await client.issues.attachPatch("issue/id", { branch: "fix/issue", patch: "diff" });
    await client.issues.markFixed("issue/id");
    await client.replays.listForIssue("issue/id", { limit: 10 });
    await client.replays.getForIssue("issue/id", "replay/id");
    await client.performance.getSummary({ appId: "app/id", hours: 24 });
    await client.ingest.envelope("app/id", "header\nitem\npayload");

    expect(request.mock.calls.slice(1).map(([config]) => summarize(config))).toEqual([
      authorized("GET", "/health"),
      authorized("GET", "/api/apps"),
      authorized("GET", "/api/apps/app%2Fid"),
      authorized("POST", "/api/apps", {
        data: { name: "Shop", repoUrl: "git@example.com:shop.git", defaultBranch: "main" },
      }),
      authorized("PATCH", "/api/apps/app%2Fid", { data: { name: "Store" } }),
      authorized("DELETE", "/api/apps/app%2Fid"),
      authorized("POST", "/api/apps/app%2Fid/sourcemaps", {
        data: { file: "assets/app.js", sourceMap: {} },
      }),
      authorized("GET", "/api/issues", {
        params: { appId: "app/id", status: "open", limit: 20, cursor: "cursor" },
      }),
      authorized("GET", "/api/issues/issue%2Fid"),
      authorized("GET", "/api/issues/issue%2Fid/events", { params: { limit: 50 } }),
      authorized("POST", "/api/issues/issue%2Fid/fix-request"),
      authorized("POST", "/api/issues/issue%2Fid/attach-patch", {
        data: { branch: "fix/issue", patch: "diff" },
      }),
      authorized("POST", "/api/issues/issue%2Fid/mark-fixed"),
      authorized("GET", "/api/issues/issue%2Fid/replays", { params: { limit: 10 } }),
      authorized("GET", "/api/issues/issue%2Fid/replays/replay%2Fid"),
      authorized("GET", "/api/performance", { params: { appId: "app/id", hours: 24 } }),
      authorized("POST", "/api/ingest/envelope/app%2Fid", {
        data: "header\nitem\npayload",
        headers: { "Content-Type": "text/plain", Authorization: "Bearer session-token" },
      }),
    ]);
  });

  it("normalizes business errors, malformed responses, and unauthorized sessions", async () => {
    const request = mockHttp(async (config) => {
      if (config.url === "/api/auth/login") return response({ token: "session-token" });
      if (config.url === "/api/apps") {
        throw {
          response: {
            status: 403,
            data: envelope(null, { code: 403, message: "forbidden", traceId: "trace-1" }),
          },
        };
      }
      return { data: { unexpected: true }, status: 200 } as AxiosResponse;
    });
    const client = createTraceabilityClient({ baseUrl: "http://monitor.local" });

    await expect(client.apps.list()).rejects.toMatchObject({
      status: 401,
      code: 401,
    } satisfies Partial<TraceabilityClientError>);

    await client.login({ account: "alice", password: "secret" });
    await expect(client.apps.list()).rejects.toMatchObject({
      message: "forbidden",
      status: 403,
      code: 403,
      traceId: "trace-1",
    } satisfies Partial<TraceabilityClientError>);
    await expect(client.apps.get("app-1")).rejects.toMatchObject({
      message: "Unexpected API response",
    } satisfies Partial<TraceabilityClientError>);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("clears the session after a 401 response", async () => {
    const request = mockHttp(async (config) => {
      if (config.url === "/api/auth/login") return response({ token: "session-token" });
      throw {
        response: {
          status: 401,
          data: envelope(null, { code: 401, message: "expired" }),
        },
      };
    });
    const client = createTraceabilityClient({ baseUrl: "http://monitor.local" });

    await client.login({ account: "alice", password: "secret" });
    await expect(client.apps.list()).rejects.toMatchObject({ message: "expired", status: 401 });
    await expect(client.apps.list()).rejects.toMatchObject({
      message: "Authenticate with login() before making this request",
      status: 401,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});

function mockHttp(handler: RequestHandler) {
  const request = vi.fn(handler);
  vi.spyOn(axios, "create").mockReturnValue({ request } as unknown as AxiosInstance);
  return request;
}

function response<T>(data: T, status = 200): AxiosResponse {
  return { data: envelope(data), status } as AxiosResponse;
}

function envelope<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    data,
    timestamp: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function summarize(config: AxiosRequestConfig) {
  return {
    method: config.method,
    url: config.url,
    ...(config.params === undefined ? {} : { params: config.params }),
    ...(config.data === undefined ? {} : { data: config.data }),
    ...(config.headers === undefined ? {} : { headers: config.headers }),
  };
}

function authorized(
  method: string,
  url: string,
  options: {
    data?: unknown;
    params?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const { headers, ...rest } = options;
  return {
    method,
    url,
    ...rest,
    headers: { ...headers, Authorization: "Bearer session-token" },
  };
}
