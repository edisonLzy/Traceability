import { describe, it, expect, vi } from "vitest";

import { createServerTransport } from "../src/transport/serverTransport.js";

describe("createServerTransport", () => {
  it("POSTs the serialized envelope body to the ingest URL with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    const transport = createServerTransport({
      url: "http://localhost:3000/api/ingest/envelope/app1",
      token: "tok",
    });
    await transport.send({ body: "header\nitem\npayload" } as any);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/ingest/envelope/app1");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.body).toBe("header\nitem\npayload");

    vi.unstubAllGlobals();
  });

  it("returns the response status code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createServerTransport({ url: "http://x", token: "t" });
    const res = await transport.send({ body: "x" } as any);
    expect(res.statusCode).toBe(202);
    vi.unstubAllGlobals();
  });
});
