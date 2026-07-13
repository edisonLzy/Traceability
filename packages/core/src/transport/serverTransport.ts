import type { Transport, TransportMakeRequestResponse, Envelope } from "@sentry/core";
import { serializeEnvelope } from "@sentry/core";

export interface ServerTransportOptions {
  /** Full ingest URL, including appId, e.g. http://host/api/ingest/envelope/<appId> */
  url: string;
  token: string;
}

/**
 * Minimal transport: serializes the Sentry envelope (the wire format is a
 * newline-delimited JSON of [header, itemHeader, item, ...]) and POSTs it to
 * our self-hosted server. On failure, drops (v1: no retry queue).
 *
 * Sentry v8 calls `send(envelope)` with a structured Envelope tuple, which we
 * serialize via `serializeEnvelope`. Callers that already hold a serialized
 * body (e.g. tests, or a pre-serialized request) may pass `{ body }` directly
 * and we forward it verbatim.
 */
export function createServerTransport(opts: ServerTransportOptions): Transport {
  return {
    async send(request: Envelope): Promise<TransportMakeRequestResponse> {
      const maybeBody = (request as unknown as { body?: unknown }).body;
      let body: string;
      if (typeof maybeBody === "string") {
        body = maybeBody;
      } else if (maybeBody instanceof Uint8Array) {
        body = new TextDecoder().decode(maybeBody);
      } else {
        // Real Sentry path: request is a structured Envelope tuple. serializeEnvelope
        // returns the newline-delimited JSON wire format (string | Uint8Array).
        const serialized = serializeEnvelope(request);
        body = typeof serialized === "string" ? serialized : new TextDecoder().decode(serialized);
      }

      try {
        const res = await fetch(opts.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: `Bearer ${opts.token}`,
          },
          body,
        });
        // v1: no retry queue. 4xx client errors are permanent -> drop silently.
        return { statusCode: res.status };
      } catch {
        // network failure: drop (v1 contract - no retry queue)
        return { statusCode: 0 };
      }
    },
    flush(): Promise<boolean> {
      return Promise.resolve(true);
    },
  } satisfies Transport;
}
