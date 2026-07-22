const REDACTED_QUERY_VALUE = "<redacted>";
const SAFE_FALLBACK_URL = "about:blank";

/**
 * Produces a URL safe to include in local diagnostic evidence. Invalid input is
 * replaced rather than echoed so unparsed raw values cannot leak into output.
 */
export function sanitizeBrowserEvidenceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    const redactedQuery = new URLSearchParams();
    for (const [key] of url.searchParams) redactedQuery.append(key, REDACTED_QUERY_VALUE);
    url.search = redactedQuery.toString();
    return url.toString();
  } catch {
    return SAFE_FALLBACK_URL;
  }
}
