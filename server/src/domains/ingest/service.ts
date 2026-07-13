import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import { broadcast } from "../../ws/broadcaster.js";
import { ingestEvent, appendEvent } from "../issues/service.js";
import { attachReplayToIssue } from "../replays/service.js";
import { resolveFrames } from "../source-maps/service.js";
import { parseEnvelope, filterSupportedItems } from "./envelope.js";

function getRrwebReplayId(extra: Record<string, unknown> | undefined): string | undefined {
  const replayId = extra?.rrwebReplayId;
  return typeof replayId === "string" && replayId.length > 0 ? replayId : undefined;
}

export function ingestEnvelope(appId: string, raw: unknown) {
  if (typeof raw !== "string" || !raw) throw new AppError("empty body", 400, 400);

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
    appendEvent(issue.id, raw);

    const replayId = getRrwebReplayId((payload as any).extra);
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
