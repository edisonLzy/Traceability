export const INVALID_BROWSER_URL = "Enter a valid HTTPS URL or loopback HTTP URL.";

export type BrowserUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: typeof INVALID_BROWSER_URL };

export function normalizeBrowserUrl(value: string): BrowserUrlResult {
  const candidate = value.trim();
  if (!candidate) return { ok: false, error: INVALID_BROWSER_URL };

  const withScheme = hasScheme(candidate) ? candidate : `https://${candidate}`;

  try {
    const url = new URL(withScheme);
    if (
      !url.username &&
      !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname)))
    ) {
      return { ok: true, url: url.toString() };
    }
  } catch {
    // Normalize every malformed or unsupported value to the same safe error.
  }

  return { ok: false, error: INVALID_BROWSER_URL };
}

function hasScheme(value: string): boolean {
  return !isHostWithPort(value) && /^[a-z][a-z\d+.-]*:/i.test(value);
}

function isHostWithPort(value: string): boolean {
  return /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d](?:[a-z\d-]*[a-z\d])?|\[[a-f\d:.]+\]):\d{1,5}(?:[/?#].*)?$/i.test(
    value,
  );
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
