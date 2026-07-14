import type { MessageEntry, SessionEntry } from "@renderer/store/agent";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { AssistantMessage } from "./assistant-message";
import { isAssistantMessage, isMessageEntry, isUserMessage } from "./types";
import { UserMessage } from "./user-message";

interface ChatMessagesProps {
  entries: SessionEntry[];
  streamingEntryId?: string;
  toolStates: Map<string, import("@renderer/store/agent").ToolExecutionState>;
  sessionId: string;
}

export function ChatMessages({
  entries,
  streamingEntryId,
  toolStates,
  sessionId,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageEntries = entries.filter(isMessageEntry);
  const virtualizer = useVirtualizer({
    count: messageEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    gap: 10,
    overscan: 6,
  });

  useEffect(() => {
    if (messageEntries.length > 0)
      virtualizer.scrollToIndex(messageEntries.length - 1, { align: "end" });
  }, [entries, messageEntries.length, streamingEntryId, virtualizer]);

  if (messageEntries.length === 0) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-[11px] leading-5 text-tertiary">
        Start a conversation to investigate this application's monitoring data.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-x-hidden overflow-y-auto px-2.5 py-3">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const entry = messageEntries[row.index];
          if (!entry) return null;
          return (
            <div
              key={entry.id}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              data-index={row.index}
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <MessageEntryView
                entry={entry}
                isStreaming={entry.id === streamingEntryId}
                toolStates={toolStates}
                sessionId={sessionId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageEntryView({
  entry,
  isStreaming,
  toolStates,
  sessionId,
}: {
  entry: MessageEntry;
  isStreaming: boolean;
  toolStates: Map<string, import("@renderer/store/agent").ToolExecutionState>;
  sessionId: string;
}) {
  if (isUserMessage(entry.data)) return <UserMessage message={entry.data} />;
  if (isAssistantMessage(entry.data))
    return (
      <AssistantMessage
        isStreaming={isStreaming}
        message={entry.data}
        toolStates={toolStates}
        sessionId={sessionId}
      />
    );
  return null;
}
