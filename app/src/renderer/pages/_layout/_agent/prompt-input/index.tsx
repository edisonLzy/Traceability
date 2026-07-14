import { useSharedPromptEditor } from "@extensions/core/renderer";
import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, CircleStop } from "lucide-react";
import { useEffect, useRef } from "react";

import type { PromptSubmission } from "../prompt-types";
import { useChatEditor } from "../use-chat-editor";
import { ModalSelector } from "./modal-selector";

export type { PromptSubmission } from "../prompt-types";

interface PromptInputProps {
  disabled?: boolean;
  isRunning: boolean;
  model: AvailableModel | null;
  models: AvailableModel[];
  onModelChange: (model: AvailableModel | null) => void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onStop: () => void;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
}

export function PromptInput({
  disabled = false,
  isRunning,
  model,
  models,
  onModelChange,
  onFollowUp,
  onSteer,
  onStop,
  onSubmit,
}: PromptInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sharedPromptEditor = useSharedPromptEditor();
  const { editor, hasContent } = useChatEditor({
    disabled,
    getFloatingReference: () => containerRef.current,
    onCreate: ({ editor: nextEditor }) => {
      sharedPromptEditor.editor = nextEditor;
    },
    onDestroy: () => {
      sharedPromptEditor.editor = null;
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const submit = async (kind: "prompt" | "steering" | "follow-up" = "prompt") => {
    if (!editor || disabled || !model || !hasContent) return;
    const content = editor.getText({ blockSeparator: "\n" }).trim();
    if (!content) return;
    const submission = {
      content,
      jsonContent: editor.getJSON(),
      model,
      skillIds: getSelectedCommandIds(editor),
    };
    if (kind === "steering") await onSteer?.(submission);
    else if (kind === "follow-up") await onFollowUp?.(submission);
    else await onSubmit(submission);
    editor.commands.clearContent();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter" || event.shiftKey)
        return;

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (suggestionState?.active) return;

      event.preventDefault();
      if (!isRunning) void submit("prompt");
      else if (event.metaKey || event.ctrlKey) void submit("follow-up");
      else void submit("steering");
    };
    container.addEventListener("keydown", onKeyDown, { capture: true });
    return () => container.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editor, isRunning, model, hasContent, onFollowUp, onSteer, onSubmit]);

  return (
    <div className="rounded-[11px] border border-hairline-strong bg-white/[0.045] p-1.5 focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_rgba(143,156,255,0.09)]">
      <div ref={containerRef} className="px-1.5 py-1">
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-1 pt-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ModalSelector
            disabled={disabled}
            models={models}
            onChange={onModelChange}
            value={model}
          />
        </div>
        <Button
          aria-label={isRunning ? "Stop response" : "Send prompt"}
          className={cn(
            "size-7 rounded-[8px]",
            isRunning && "border-danger/30 bg-danger/20 text-danger",
          )}
          disabled={isRunning ? false : disabled || !model || !hasContent}
          onClick={() => {
            if (isRunning) onStop();
            else void submit();
          }}
          size="icon-sm"
          type="button"
          variant={isRunning ? "danger" : "primary"}
        >
          {isRunning ? <CircleStop size={14} /> : <ArrowUp size={14} />}
        </Button>
      </div>
      <p className="px-1 pt-1 text-[9px] text-tertiary">
        {isRunning
          ? "Enter to steer · ⌘/Ctrl+Enter to follow up"
          : "Enter to send · Shift+Enter for a newline"}
      </p>
    </div>
  );
}
