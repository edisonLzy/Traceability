import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import type { MonitoringContext } from "@renderer/store/agent";

import type { PromptSubmission } from "./prompt-types";

export function createAppUserMessage(
  submission: PromptSubmission,
  kind: AppUserMessage["kind"],
  monitoringContext: MonitoringContext,
): AppUserMessage {
  const metadata = {
    model: { providerId: submission.model.providerId, modelId: submission.model.modelId },
    monitoringContext,
    skillIds: submission.skillIds,
  };
  return {
    role: "user",
    content: submission.content,
    timestamp: Date.now(),
    kind,
    jsonContent: submission.jsonContent,
    metadata,
  } as AppUserMessage;
}
