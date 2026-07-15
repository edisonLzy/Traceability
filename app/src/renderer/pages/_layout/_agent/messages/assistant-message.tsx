import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { SessionEntry, ToolExecutionState, TokenUsage } from "@renderer/store/agent";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";
import { CopyMessageButton } from "./toolbar/copy-message-button";
import { MessageToolbar } from "./toolbar/message-toolbar";
import { assistantText, assistantThinking } from "./types";

interface AssistantMessageProps {
  completedAt?: number;
  entries: SessionEntry[];
  entryId: string;
  isStreaming: boolean;
  message: AssistantMessageType;
  sessionId: string;
  startedAt: number;
  tokenUsage?: TokenUsage;
  toolStates: Map<string, ToolExecutionState>;
}

export function AssistantMessage({
  completedAt,
  entries,
  entryId,
  isStreaming,
  message,
  sessionId,
  startedAt,
  tokenUsage,
  toolStates,
}: AssistantMessageProps) {
  const contentArray = Array.isArray(message.content) ? message.content : [];
  const errorMessage = message.errorMessage?.trim();
  const hasError =
    message.stopReason === "error" || message.stopReason === "aborted" || Boolean(errorMessage);

  const { processingContent, textContent } = contentArray.reduce<{
    processingContent: (ThinkingContent | ToolCall)[];
    textContent: TextContent[];
  }>(
    (acc, block) => {
      if (block.type === "thinking" || block.type === "toolCall") {
        acc.processingContent.push(block as ThinkingContent | ToolCall);
      } else if (block.type === "text") {
        acc.textContent.push(block as TextContent);
      }
      return acc;
    },
    { processingContent: [], textContent: [] },
  );

  const assistantResponseText = textContent.map((block) => block.text).join("\n");

  const [isProcessingOpen, setIsProcessingOpen] = useState(true);

  useEffect(() => {
    setIsProcessingOpen(textContent.length === 0);
  }, [textContent.length]);

  return (
    <div className="mb-3 grid grid-cols-[32px_minmax(0,1fr)] items-start gap-2.5 pr-2.5">
      <span className="flex size-8 items-center justify-center rounded-sm border-2 border-border bg-signal-cyan font-mono text-[10px] font-bold text-accent-foreground shadow-[var(--hard-shadow-sm)]">
        AI
      </span>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Collapsible open={isProcessingOpen} onOpenChange={(open) => setIsProcessingOpen(open)}>
          <div className="flex flex-col gap-2">
            <CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1.5">
              <ProcessingTip
                completedAt={completedAt}
                hasError={hasError}
                isStreaming={isStreaming}
                startedAt={startedAt}
              />
              <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-90 hover:text-foreground" />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-1.5 flex flex-col gap-2">
            {processingContent.map((block, index) => {
              if (block.type === "thinking") {
                return (
                  <AssistantThinkingMessage key={`thinking-${index}`} thinking={[block.thinking]} />
                );
              }

              if (block.type === "toolCall") {
                return (
                  <AssistantToolMessage
                    key={block.id}
                    sessionId={sessionId}
                    toolState={toolStates.get(block.id)}
                  />
                );
              }

              return null;
            })}
          </CollapsibleContent>
        </Collapsible>

        {textContent.map((block, i) => (
          <AssistantResponseMessage key={`text-${i}`} text={block.text} />
        ))}

        {hasError && textContent.every((block) => block.text.trim().length === 0) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            {errorMessage ||
              "Agent request failed. Please check the model/API configuration and try again."}
          </div>
        ) : null}

        {!hasError && !isStreaming ? (
          <MessageToolbar align="start">
            <CopyMessageButton text={assistantResponseText} />
          </MessageToolbar>
        ) : null}
      </div>
    </div>
  );
}

// ─── ProcessingTip ──────────────────────────────────────────────

interface ProcessingTipProps {
  completedAt?: number;
  hasError: boolean;
  isStreaming: boolean;
  startedAt: number;
}

function ProcessingTip({ completedAt, hasError, isStreaming, startedAt }: ProcessingTipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) return;

    setNow(Date.now());

    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [isStreaming, startedAt]);

  const endTime = isStreaming ? now : (completedAt ?? startedAt);
  const elapsed = Math.max(0, Math.floor((endTime - startedAt) / 1000));

  return (
    <span
      className={cn(
        "text-xs text-muted-foreground",
        hasError && "text-destructive",
        isStreaming && !hasError && "animate-pulse",
      )}
    >
      {`${hasError ? "处理失败" : isStreaming ? "正在处理" : "已处理"} ${elapsed}s`}
    </span>
  );
}

// ─── Local types ────────────────────────────────────────────────

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface ToolCall {
  id: string;
  type: "toolCall";
  name: string;
  arguments: string;
}

interface TextContent {
  type: "text";
  text: string;
}
