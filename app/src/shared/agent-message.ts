import "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { JSONContent } from "@tiptap/core";

import type { AvailableModel } from "./models-ipc";

/**
 * Traceability-only extension to the divisor AppUserMessage metadata.
 * Carries the page context the renderer used to attach (issue / performance
 * / metric being viewed). Its `appId` MUST match the session's appId before
 * the runtime accepts the message.
 */
export interface MonitoringContext {
  appId: string;
  source: "general" | "issue" | "performance" | "metric";
  issueId?: string;
  metricName?: string;
  hours?: 1 | 24 | 168;
}

declare module "@earendil-works/pi-agent-core" {
  type AppUserMessageKind = "prompt" | "follow-up" | "steering";

  interface AppUserMessage extends UserMessage {
    kind: AppUserMessageKind;
    jsonContent: JSONContent;
    metadata?: {
      model?: Pick<AvailableModel, "modelId" | "providerId">;
      skillIds?: string[];
      monitoringContext?: MonitoringContext;
    };
  }

  interface CustomAgentMessages {
    AppUserMessage: AppUserMessage;
  }
}
