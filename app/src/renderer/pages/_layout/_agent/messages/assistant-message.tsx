import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import type { ToolExecutionState } from "@renderer/store/agent";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";
import { assistantText, assistantThinking } from "./types";

interface AssistantMessageProps {
  isStreaming: boolean;
  message: AssistantMessageType;
  toolStates: Map<string, ToolExecutionState>;
  sessionId: string;
}

export function AssistantMessage({
  isStreaming,
  message,
  toolStates,
  sessionId,
}: AssistantMessageProps) {
  const text = assistantText(message);
  const thinking = assistantThinking(message);
  const toolCallBlocks = Array.isArray(message.content)
    ? message.content.filter(
        (block): block is Extract<(typeof message.content)[number], { type: "toolCall" }> =>
          block.type === "toolCall",
      )
    : [];
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
      {toolCallBlocks.map((block) => (
        <AssistantToolMessage
          key={block.id}
          sessionId={sessionId}
          toolState={toolStates.get(block.id)}
        />
      ))}
      <AssistantResponseMessage text={text} />
      {failed && (
        <p className="mt-2 rounded-md border border-danger/25 bg-danger/10 px-2 py-1.5 text-[10px] text-danger">
          {error || (message.stopReason === "aborted" ? "Response stopped." : "Response failed.")}
        </p>
      )}
    </article>
  );
}
