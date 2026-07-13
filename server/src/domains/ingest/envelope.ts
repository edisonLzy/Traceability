import type {
  ParsedEnvelope,
  EnvelopeHeader,
  EnvelopeItem,
  SentryEventPayload,
  Issue,
  SourceLocation,
} from "@traceability/protocol";

/**
 * Sentry envelope v7 wire format: a newline-delimited JSON array.
 * First line = envelope header object; subsequent lines alternate
 * [itemHeader, itemPayload, itemHeader, itemPayload, ...].
 */
export function parseEnvelope(body: Buffer | string): ParsedEnvelope {
  const text = typeof body === "string" ? body : body.toString("utf8");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 1) {
    throw new Error("empty envelope");
  }
  const header = JSON.parse(lines[0]!) as EnvelopeHeader;
  const items: EnvelopeItem[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    const itemHeader = JSON.parse(lines[i]!) as EnvelopeItem[0];
    const itemPayload = JSON.parse(lines[i + 1]!);
    items.push([itemHeader, itemPayload]);
  }
  return { header, items };
}

/**
 * Filter to v1-supported item types: only event/transaction/message payloads.
 */
export function filterSupportedItems(envelope: ParsedEnvelope): Array<{
  header: EnvelopeItem[0];
  payload: SentryEventPayload;
}> {
  const supported: Array<{ header: EnvelopeItem[0]; payload: SentryEventPayload }> = [];
  for (const [header, payload] of envelope.items) {
    if (header.type === "event" || header.type === "transaction") {
      supported.push({ header, payload: payload as SentryEventPayload });
    } else if (header.type === "client_report" && isMessagePayload(payload)) {
      // client_report is not a message; skip. Kept branch explicit for clarity.
      continue;
    }
  }
  return supported;
}

function isMessagePayload(p: unknown): p is SentryEventPayload {
  return typeof p === "object" && p !== null;
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
