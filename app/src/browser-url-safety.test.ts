import { describe, expect, it } from "vitest";

import { sanitizeBrowserEvidenceUrl } from "./browser-url-safety";

describe("sanitizeBrowserEvidenceUrl", () => {
  it("removes userinfo and fragments while redacting every query value", () => {
    expect(
      sanitizeBrowserEvidenceUrl(
        "https://alice:password@example.com/search?q=private&empty=&flag#account",
      ),
    ).toBe("https://example.com/search?q=%3Credacted%3E&empty=%3Credacted%3E&flag=%3Credacted%3E");
  });

  it("does not expose invalid raw URL values", () => {
    expect(sanitizeBrowserEvidenceUrl("not a URL?secret=value#fragment")).toBe("about:blank");
  });

  it("redacts every duplicate query value without collapsing entries", () => {
    expect(sanitizeBrowserEvidenceUrl("https://example.com/?tag=first&tag=second")).toBe(
      "https://example.com/?tag=%3Credacted%3E&tag=%3Credacted%3E",
    );
  });
});
