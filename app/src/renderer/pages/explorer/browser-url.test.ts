import { describe, expect, it } from "vitest";

import { INVALID_BROWSER_URL, normalizeBrowserUrl } from "./browser-url";

describe("normalizeBrowserUrl", () => {
  it("prefixes a missing scheme with HTTPS", () => {
    expect(normalizeBrowserUrl("example.com/path")).toEqual({
      ok: true,
      url: "https://example.com/path",
    });
  });

  it.each([
    ["localhost:4173", "https://localhost:4173/"],
    ["example.com:8443/path", "https://example.com:8443/path"],
  ])("prefixes a missing scheme for host-with-port input %j", (value, url) => {
    expect(normalizeBrowserUrl(value)).toEqual({
      ok: true,
      url,
    });
  });

  it("accepts HTTP only for loopback hosts", () => {
    expect(normalizeBrowserUrl("http://localhost:4173/fixture")).toEqual({
      ok: true,
      url: "http://localhost:4173/fixture",
    });
    expect(normalizeBrowserUrl("http://127.0.0.1:4173")).toEqual({
      ok: true,
      url: "http://127.0.0.1:4173/",
    });
    expect(normalizeBrowserUrl("http://[::1]:4173")).toEqual({
      ok: true,
      url: "http://[::1]:4173/",
    });
  });

  it.each([
    "",
    "https://",
    "file:///tmp/page.html",
    "ftp://example.com",
    "javascript:alert(1)",
    "http://example.com",
  ])("rejects unsupported browser input %j with a stable error", (value) => {
    expect(normalizeBrowserUrl(value)).toEqual({ ok: false, error: INVALID_BROWSER_URL });
  });
});
