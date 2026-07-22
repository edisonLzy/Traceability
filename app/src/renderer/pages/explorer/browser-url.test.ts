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
    ["127.0.0.1:4173", "https://127.0.0.1:4173/"],
    ["[::1]:4173", "https://[::1]:4173/"],
  ])("prefixes a missing scheme for recognizable host-with-port input %j", (value, url) => {
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
    // A numeric suffix must not cause an explicit non-HTTP(S) scheme to be treated as a hostname.
    "ftp:21",
    "javascript:80",
    "file:80",
    "mailto:25",
    "https://alice:password@example.com/account",
  ])("rejects unsupported browser input %j with a stable error", (value) => {
    expect(normalizeBrowserUrl(value)).toEqual({ ok: false, error: INVALID_BROWSER_URL });
  });
});
