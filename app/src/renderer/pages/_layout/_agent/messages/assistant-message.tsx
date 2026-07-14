import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { assistantText, assistantThinking } from "./types";

interface AssistantMessageProps {
  isStreaming: boolean;
  message: AssistantMessageType;
}

export function AssistantMessage({ isStreaming, message }: AssistantMessageProps) {
  const text = assistantText(message);
  const thinking = assistantThinking(message);
  const error = message.errorMessage?.trim();
  const failed =
    message.stopReason === "error" || message.stopReason === "aborted" || Boolean(error);

  return (
    <article className="mb-3 pr-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-[650] text-tertiary">
        <span className={isStreaming ? "animate-pulse text-primary-hover" : "text-primary-hover"}>
          ✦
        </span>
        Traceability Agent
      </div>
      <AssistantThinkingMessage thinking={thinking} />
      <AssistantResponseMessage text={text} />
      {failed && (
        <p className="mt-2 rounded-md border border-danger/25 bg-danger/10 px-2 py-1.5 text-[10px] text-danger">
          {error || (message.stopReason === "aborted" ? "Response stopped." : "Response failed.")}
        </p>
      )}
    </article>
  );
}
