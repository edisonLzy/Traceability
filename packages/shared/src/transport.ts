import type { Transport, TransportMakeRequestResponse } from "@sentry/core";

export function createBearerTransport(url: string, token: string): Transport {
  return {
    async send(envelope: any): Promise<TransportMakeRequestResponse> {
      // Manually serialize: Sentry envelope wire format is newline-delimited JSON
      const [header, ...items] = envelope;
      const lines = [JSON.stringify(header)];
      for (const item of items) {
        lines.push(JSON.stringify(item[0])); // item header
        lines.push(JSON.stringify(item[1])); // item payload
      }
      const body = lines.join("\n");
      const useKeepalive = body.length <= 60_000;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-sentry-envelope",
            Authorization: `Bearer ${token}`,
          },
          body,
          ...(useKeepalive ? { keepalive: true } : {}),
        });
        return { statusCode: res.status };
      } catch {
        return { statusCode: 0 };
      }
    },
    flush: () => Promise.resolve(true),
  };
}
