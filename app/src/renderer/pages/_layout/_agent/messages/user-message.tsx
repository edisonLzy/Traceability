import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { skillNode } from "@renderer/components/richtext/inline/skill-node";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type { SessionEntry } from "@renderer/store/agent";
import type { Virtualizer } from "@tanstack/react-virtual";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

interface UserMessageProps {
  message: AppUserMessage;
  entryId: string;
  sessionId: string;
  isRunning: boolean;
  entries: SessionEntry[];
}

export function UserMessage({ message, entryId, sessionId, isRunning, entries }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <EditableUserMessage
        entryId={entryId}
        message={message}
        sessionId={sessionId}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <ReadonlyUserMessage
      message={message}
      isRunning={isRunning}
      onStartEdit={() => setIsEditing(true)}
    />
  );
}

// ─── ReadonlyUserMessage ────────────────────────────────────────

function ReadonlyUserMessage({
  message,
  isRunning,
  onStartEdit,
}: {
  message: AppUserMessage;
  isRunning: boolean;
  onStartEdit: () => void;
}) {
  const editor = useEditor({
    content: message.jsonContent,
    editable: false,
    extensions: [StarterKit, Mention, skillNode],
    editorProps: {
      attributes: { className: "ProseMirror text-[12px] leading-[1.55] outline-none" },
    },
  });

  return (
    <article className="mb-3 flex justify-end">
      <div className="flex max-w-full flex-col gap-1 rounded-[13px_13px_4px_13px] border border-primary/25 bg-primary/15 px-3 py-2 text-[#e4e7ff]">
        <EditorContent editor={editor} />
        {!isRunning ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="self-end text-[9px] text-primary/60 transition-colors hover:text-primary"
          >
            编辑
          </button>
        ) : null}
      </div>
    </article>
  );
}

// ─── EditableUserMessage ────────────────────────────────────────

function EditableUserMessage({
  message,
  entryId,
  sessionId,
  onCancel,
}: {
  message: AppUserMessage;
  entryId: string;
  sessionId: string;
  onCancel: () => void;
}) {
  const { invoke } = useElectronIPC();
  const [isSaving, setIsSaving] = useState(false);

  const editor = useEditor({
    content: message.jsonContent,
    editable: true,
    extensions: [StarterKit, Mention, skillNode],
    editorProps: {
      attributes: { className: "ProseMirror text-[12px] leading-[1.55] outline-none" },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor) return;

    setIsSaving(true);
    try {
      const updatedContent = editor.getJSON();
      const updatedText = editor.getText({ blockSeparator: "\n" }).trim();

      if (!updatedText) {
        setIsSaving(false);
        return;
      }

      const store = agentStore.getState();
      const entryState = store.getEntryState(sessionId);
      const updatedEntries = entryState.entries.map((entry) => {
        if (entry.id === entryId && entry.type === "message" && entry.data.role === "user") {
          return {
            ...entry,
            data: {
              ...entry.data,
              content: updatedText,
              jsonContent: updatedContent,
            },
          };
        }
        return entry;
      });
      store.setSessionEntries(sessionId, updatedEntries);

      // Sync updated user messages to the agent runtime
      const messages = updatedEntries
        .filter((e): e is Extract<SessionEntry, { type: "message" }> => e.type === "message")
        .map((e) => e.data);
      await invoke("setHistoryMessages", sessionId, messages);

      onCancel();
    } catch (error) {
      console.error("Failed to save edited message", error);
    } finally {
      setIsSaving(false);
    }
  }, [editor, entryId, invoke, onCancel, sessionId]);

  // Handle Enter to save, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, onCancel]);

  return (
    <article className="mb-3 flex justify-end pl-9">
      <div className="flex max-w-full flex-col gap-2 rounded-[13px_13px_4px_13px] border border-primary/25 bg-primary/15 px-3 py-2 text-[#e4e7ff]">
        <EditorContent editor={editor} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="text-[10px] text-primary/60 transition-colors hover:text-primary disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="text-[10px] font-medium text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── StickyUserMessage ──────────────────────────────────────────

const STICKY_TRIGGER_OFFSET = 8;

interface StickyUserMessageProps {
  message: AppUserMessage;
  onJump: () => void;
}

export function StickyUserMessage({ message, onJump }: StickyUserMessageProps) {
  const editor = useEditor({
    content: message.jsonContent,
    editable: false,
    extensions: [StarterKit, Mention, skillNode],
    editorProps: {
      attributes: {
        className:
          "ProseMirror !overflow-hidden !text-ellipsis !whitespace-nowrap text-[14px] leading-6 text-foreground [&_p]:!overflow-hidden [&_p]:!text-ellipsis [&_p]:!whitespace-nowrap",
      },
    },
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2">
      <div className="mx-auto w-full max-w-4xl">
        <div className="pointer-events-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border-2 border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-[var(--hard-shadow)]">
          <div className="pm-readonly min-w-0 overflow-hidden text-[14px] leading-6 text-foreground [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:text-ellipsis [&_.ProseMirror]:!whitespace-nowrap [&_.ProseMirror_p]:overflow-hidden [&_.ProseMirror_p]:text-ellipsis [&_.ProseMirror_p]:!whitespace-nowrap">
            <EditorContent editor={editor} className="prompt-editor max-w-none min-w-0" />
          </div>
          <button
            type="button"
            onClick={onJump}
            className="rounded-md border-2 border-border px-2.5 py-1 text-xs text-foreground shadow-[var(--hard-shadow-sm)] transition-all hover:translate-x-px hover:translate-y-px hover:bg-accent hover:shadow-none"
          >
            跳转
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── useStickyUserMessage ───────────────────────────────────────

interface UseStickyUserMessageOptions {
  messageEntries: Array<{ id: string; data: { role: string } }>;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string;
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
}

export function useStickyUserMessage({
  messageEntries,
  scrollRef,
  sessionId,
  virtualizer,
}: UseStickyUserMessageOptions) {
  const [activeStickyMessage, setActiveStickyMessage] = useState<AppUserMessage | null>(null);

  const userMessages = useMemo(() => {
    return messageEntries.filter(
      (entry): entry is { id: string; data: AppUserMessage } => entry.data.role === "user",
    );
  }, [messageEntries]);

  const handleStickyScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const lastUser = userMessages[userMessages.length - 1];
    if (!lastUser) return;

    const lastIndex = messageEntries.findIndex((e) => e.id === lastUser.id);
    if (lastIndex < 0) return;

    const offsetResult = virtualizer.getOffsetForIndex(lastIndex);
    if (offsetResult == null) return;
    const offset: number | null = Array.isArray(offsetResult)
      ? offsetResult[0]
      : (offsetResult as unknown as number | null);
    if (offset === null) return;

    const stickyTriggerPoint = offset + STICKY_TRIGGER_OFFSET;
    if (scrollTop >= stickyTriggerPoint) {
      setActiveStickyMessage(lastUser.data as AppUserMessage);
    } else {
      setActiveStickyMessage(null);
    }
  }, [messageEntries, scrollRef, userMessages, virtualizer]);

  const handleStickyJump = useCallback(() => {
    const lastUser = userMessages[userMessages.length - 1];
    if (!lastUser) return;

    const lastIndex = messageEntries.findIndex((e) => e.id === lastUser.id);
    if (lastIndex < 0) return;

    virtualizer.scrollToIndex(lastIndex, { align: "end" });
    setActiveStickyMessage(null);
  }, [messageEntries, userMessages, virtualizer]);

  return { activeStickyMessage, handleStickyJump, handleStickyScroll };
}
