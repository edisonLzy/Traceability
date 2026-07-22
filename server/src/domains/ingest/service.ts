import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import { broadcast } from "../../ws/broadcaster.js";
import { ingestEvent, appendEvent } from "../issues/service.js";
import { attachReplayToIssue } from "../replays/service.js";
import { resolveFrames } from "../source-maps/service.js";
import { parseEnvelope, filterSupportedItems } from "./envelope.js";

function getRrwebReplayId(payload: Record<string, unknown>): string | undefined {
  const contexts = payload.contexts as Record<string, unknown> | undefined;
  const replay = contexts?.replay as { replay_id?: string } | undefined;
  const replayId = replay?.replay_id;
  return typeof replayId === "string" && replayId.length > 0 ? replayId : undefined;
}

export function ingestEnvelope(appId: string, raw: Buffer) {
  if (!Buffer.isBuffer(raw) || raw.length === 0) throw new AppError("empty body", 400, 400);

  let envelope;
  try {
    envelope = parseEnvelope(raw);
  } catch {
    throw new AppError("invalid envelope", 400, 400);
  }

  const supported = filterSupportedItems(envelope);
  for (const { payload } of supported) {
    const frames = (payload as any).exception?.values?.[0]?.stacktrace?.frames ?? [];
    const resolvedFrames = resolveFrames(appId, (payload as any).release, frames);
    const { issue, created } = ingestEvent(appId, payload, resolvedFrames);
    appendEvent(issue.id, raw.toString("utf8"));

    const replayId = getRrwebReplayId(payload as unknown as Record<string, unknown>);
    if (replayId) {
      attachReplayToIssue(replayId, issue.id, appId, (payload as any).event_id);
    }

    broadcast({
      kind: created ? "issue:created" : "issue:updated",
      appId: issue.appId,
      issueId: issue.id,
      payload: issue,
    });
  }

  return { accepted: supported.length };
}
