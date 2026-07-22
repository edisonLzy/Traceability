import { describe, it, expect, vi, beforeEach } from "vitest";

import { createBearerTransport } from "../src/transport.js";

describe("createBearerTransport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends envelope with Authorization Bearer header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const transport = createBearerTransport("http://test/api/ingest/envelope/app1", "tok-123");
    const envelope = [{ event_id: "abc" }, [{ type: "event" }, { event_id: "e1" }]] as any;

    const result = await transport.send(envelope);
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test/api/ingest/envelope/app1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
      }),
    );
  });

  it("uses keepalive for small payloads", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const transport = createBearerTransport("http://test/", "t");
    await transport.send([{ event_id: "ec" }, [{ type: "event" }, { event_id: "small" }]] as any);

    const callArgs = mockFetch.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs.keepalive).toBe(true);
  });

  it("returns statusCode 0 on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));
    const transport = createBearerTransport("http://test/", "t");
    const result = await transport.send([
      { event_id: "ec2" },
      [{ type: "event" }, { event_id: "e" }],
    ] as any);
    expect(result.statusCode).toBe(0);
  });
});
