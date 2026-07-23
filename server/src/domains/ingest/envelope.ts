import type { Issue, SourceLocation } from "@traceability/protocol";

import type { ParsedEnvelope, EnvelopeHeader, EnvelopeItem, SentryEventPayload } from "./types.js";

/**
 * Sentry envelope v7 wire format: a newline-delimited JSON array.
 * First line = envelope header object; subsequent lines alternate
 * [itemHeader, itemPayload, itemHeader, itemPayload, ...].
 */
export function parseEnvelope(body: Buffer): ParsedEnvelope {
  if (body.length === 0) throw new Error("empty envelope");

  const firstNewline = body.indexOf(0x0a);
  if (firstNewline < 0) throw new Error("invalid envelope: no header line");

  const header = JSON.parse(body.subarray(0, firstNewline).toString("utf8")) as EnvelopeHeader;
  const items: EnvelopeItem[] = [];

  let offset = firstNewline + 1;
  while (offset < body.length) {
    if (body[offset] === 0x0a) {
      offset++;
      continue;
    }

    const itemNewline = body.indexOf(0x0a, offset);
    if (itemNewline < 0) break;
    const itemHeader = JSON.parse(
      body.subarray(offset, itemNewline).toString("utf8"),
    ) as EnvelopeItem[0];
    offset = itemNewline + 1;

    if (typeof itemHeader.length === "number" && itemHeader.length > 0) {
      const payload = body.subarray(offset, offset + itemHeader.length);
      items.push([itemHeader, payload as unknown as Buffer]);
      offset += itemHeader.length;
      if (body[offset] === 0x0a) offset++;
    } else {
      // JSON payload: ends at next newline or end of body
      const payloadNewline = body.indexOf(0x0a, offset);
      const payloadEnd = payloadNewline >= 0 ? payloadNewline : body.length;
      const payloadText = body.subarray(offset, payloadEnd).toString("utf8");
      if (payloadText.length > 0) {
        const payload = JSON.parse(payloadText);
        items.push([itemHeader, payload]);
      }
      offset = payloadEnd + 1;
    }
  }

  return { header, items };
}

/**
 * Filter to v1-supported item types: only event/transaction/message payloads.
 */
export function filterSupportedItems(envelope: ParsedEnvelope): Array<{
  header: EnvelopeItem[0];
  payload: object | Buffer;
}> {
  const allowed = new Set(["event", "transaction", "replay_event", "replay_recording"]);
  return envelope.items
    .filter(([h]) => allowed.has(h.type))
    .map(([h, p]) => ({ header: h, payload: p }));
}

/**
 * Stable fingerprint: appName tag + exception type+value, or message, or transaction name.
 */
export function extractIssueFingerprint(payload: SentryEventPayload, appId: string): string {
  const base = appId;
  const exc = payload.exception?.values?.[0];
  if (exc) {
    return `${base}::error::${exc.type ?? "unknown"}::${exc.value ?? ""}`;
  }
  if (payload.transaction) {
    return `${base}::transaction::${payload.transaction}`;
  }
  if (payload.message) {
    return `${base}::message::${payload.message.slice(0, 200)}`;
  }
  return `${base}::${payload.type ?? "unknown"}::${payload.event_id ?? "no-id"}`;
}

export function payloadToIssueFields(
  payload: SentryEventPayload,
  resolvedFrames: SourceLocation[] = [],
): {
  title: string;
  type: "error" | "transaction" | "message" | "custom";
  metadata: Issue["metadata"];
} {
  const exc = payload.exception?.values?.[0];
  if (exc) {
    return {
      title: `${exc.type ?? "Error"}: ${exc.value ?? ""}`.slice(0, 500),
      type: "error",
      metadata: {
        stacktrace: JSON.stringify(exc.stacktrace ?? null),
        message: exc.value,
        context: payload.extra,
        ...(resolvedFrames.length > 0
          ? { frames: resolvedFrames, source: resolvedFrames[resolvedFrames.length - 1] }
          : {}),
      },
    };
  }
  if (payload.transaction) {
    return {
      title: `transaction: ${payload.transaction}`.slice(0, 500),
      type: "transaction",
      metadata: { context: payload.contexts },
    };
  }
  if (payload.message) {
    return {
      title: payload.message.slice(0, 500),
      type: "message",
      metadata: { message: payload.message, context: payload.extra },
    };
  }
  return {
    title: `${payload.type ?? "event"} ${payload.event_id ?? ""}`.slice(0, 500),
    type: "custom",
    metadata: { context: payload.extra },
  };
}
