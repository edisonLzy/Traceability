import { AppError } from "../../errors/app-error.js";
import { broadcast } from "../../ws/broadcaster.js";
import { ingestEvent, appendEvent } from "../issues/service.js";
import { recordFromTransaction } from "../performance/service.js";
import { attachReplayToIssue, appendSegment } from "../replays/service.js";
import { resolveFrames } from "../source-maps/service.js";
import { parseEnvelope, filterSupportedItems } from "./envelope.js";
import type { SentryEventPayload, ReplayEventPayload } from "./types.js";

export function ingestEnvelope(appId: string, raw: Buffer) {
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    throw new AppError("empty body", 400, 400);
  }

  let envelope;
  try {
    envelope = parseEnvelope(raw);
  } catch {
    throw new AppError("invalid envelope", 400, 400);
  }

  const items = filterSupportedItems(envelope);
  let accepted = 0;
  let i = 0;

  while (i < items.length) {
    const { header, payload } = items[i]!;

    if (header.type === "event") {
      handleEventItem(appId, raw, payload as SentryEventPayload);
      accepted++;
      i++;
    } else if (header.type === "transaction") {
      handleTransactionItem(appId, payload as SentryEventPayload);
      accepted++;
      i++;
    } else if (header.type === "replay_event") {
      // Paired: replay_event must be followed by replay_recording in same envelope
      if (i + 1 < items.length && items[i + 1]!.header.type === "replay_recording") {
        const replayEvent = payload as ReplayEventPayload;
        const recording = items[i + 1]!.payload as Buffer;
        appendSegment({ appId, replayEvent, recording });
        accepted += 2;
        i += 2;
      } else {
        i++; // orphaned replay_event, skip
      }
    } else if (header.type === "replay_recording") {
      i++; // orphaned recording, skip
    } else {
      i++;
    }
  }

  return { accepted };
}

function handleEventItem(appId: string, raw: Buffer, payload: SentryEventPayload): void {
  const frames = payload.exception?.values?.[0]?.stacktrace?.frames ?? [];
  const resolvedFrames = resolveFrames(appId, payload.release, frames as any);
  const { issue, created } = ingestEvent(appId, payload, resolvedFrames);
  appendEvent(issue.id, raw.toString("utf8"));

  // Link replay via contexts.replay.replay_id (Sentry official format)
  const replayId = getRrwebReplayId(payload);
  if (replayId) {
    attachReplayToIssue(replayId, issue.id);
  }

  broadcast({
    kind: created ? "issue:created" : "issue:updated",
    appId: issue.appId,
    issueId: issue.id,
    payload: issue,
  });
}

function handleTransactionItem(appId: string, payload: SentryEventPayload): void {
  // R1: transactions do NOT create issues
  recordFromTransaction(appId, payload);
}

function getRrwebReplayId(payload: SentryEventPayload): string | undefined {
  const replayId = payload.contexts?.replay?.replay_id;
  return typeof replayId === "string" && replayId.length > 0 ? replayId : undefined;
}
