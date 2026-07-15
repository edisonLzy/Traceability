import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@renderer/components/ui/hover-card";
import { Progress } from "@renderer/components/ui/progress";
import { formatTokenCount } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { TokenUsage } from "@renderer/store/agent";
import type { AvailableModel } from "@shared/models-ipc";
import { Editor, EditorContent } from "@tiptap/react";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { PromptSubmission } from "../prompt-types";
import { useChatEditor, type UseChatEditorOptions } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";

export interface PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy"> {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
  tokenUsage?: TokenUsage;
}

export function PromptInput({
  disabled = false,
  initialModel = null,
  isRunning = false,
  onSubmit,
  onSteer,
  onFollowUp,
  onStop,
  onCreate,
  onDestroy,
  sessionId,
  tokenUsage,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent } = useChatEditor({
    disabled,
    getFloatingReference: () => editorContainerRef.current,
    onCreate,
    onDestroy,
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const hasModel = modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(
    async (kind: "prompt" | "steering" | "follow-up" = "prompt") => {
      if (disabled || !hasContent || !hasModel || !editor) {
        return;
      }

      const jsonContent = editor.getJSON();
      const submissionText = editor.getText({ blockSeparator: "\n" }).trim();
      if (!submissionText) {
        return;
      }

      const submission: PromptSubmission = {
        content: submissionText,
        jsonContent,
        model: modelSelectorProps.value!,
        skillIds: getSelectedCommandIds(editor),
      };

      if (kind === "steering") {
        onSteer?.(submission);
      } else if (kind === "follow-up" && onFollowUp) {
        onFollowUp(submission);
      } else {
        onSubmit(submission);
      }

      editor.commands.clearContent();
    },
    [
      disabled,
      editor,
      hasContent,
      hasModel,
      modelSelectorProps.value,
      onFollowUp,
      onSteer,
      onSubmit,
    ],
  );

  // Listen for Enter / Mod+Enter on the editor container with `capture: true`
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (suggestionState?.active) {
        return;
      }

      if (isRunning) {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          void handleSubmit("follow-up");
          return;
        }

        if (!event.shiftKey) {
          event.preventDefault();
          void handleSubmit("steering");
        }
        return;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        void handleSubmit("prompt");
      }
    };

    container.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      container.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [editor, handleSubmit, isRunning, onFollowUp]);

  const canSubmit = !disabled && !isRunning && hasContent && hasModel;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col rounded-lg border-2 border-border bg-card shadow-[var(--hard-shadow)] transition-all duration-200 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <div ref={editorContainerRef} className="relative min-h-14 px-3.5 py-2.5">
        <EditorContent editor={editor} className="prompt-editor max-w-none" />
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* reserved for future: permission selector, etc. */}
        </div>

        <div className="flex items-center justify-end gap-2">
          {tokenUsage ? (
            <ContextUsageControl model={modelSelectorProps.value} tokenUsage={tokenUsage} />
          ) : null}

          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            onClick={() => {
              if (isRunning) {
                if (isStopEnabled) void onStop?.();
                return;
              }

              void handleSubmit();
            }}
            disabled={isRunning ? !isStopEnabled : !canSubmit}
            size="icon-sm"
            className={cn(
              "size-7 rounded-md border-2 border-border shadow-[var(--hard-shadow-sm)] transition-all disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none",
              isRunning
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-accent text-accent-foreground hover:translate-x-px hover:translate-y-px hover:bg-accent hover:shadow-none",
            )}
            aria-label={isRunning ? "Stop response" : "Send prompt"}
          >
            {isRunning ? (
              <Square className="size-3" fill="currentColor" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ContextUsageControlProps {
  model: AvailableModel | null;
  tokenUsage: TokenUsage;
}

function ContextUsageControl({ model, tokenUsage }: ContextUsageControlProps) {
  if (!model) return null;

  const measuredTokens =
    tokenUsage.latestCall.input +
    tokenUsage.latestCall.cacheRead +
    tokenUsage.latestCall.cacheWrite +
    tokenUsage.latestCall.output;
  const contextWindow = model.contextWindow || 128_000;
  const usedTokens = Math.min(contextWindow, measuredTokens);
  const usageRatio = contextWindow > 0 ? usedTokens / contextWindow : 0;
  const usagePercentage = Math.min(100, Math.round(usageRatio * 100));
  const ringColor =
    usageRatio >= 0.85
      ? "var(--destructive)"
      : usageRatio >= 0.65
        ? "var(--signal-yellow)"
        : "var(--signal-cyan)";

  return (
    <HoverCard>
      <HoverCardTrigger
        aria-label={`上下文窗口已使用 ${usagePercentage}%`}
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span
          className="flex size-[14px] items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} ${usagePercentage}%, var(--muted) 0)`,
          }}
        >
          <span className="size-2 rounded-full bg-card" />
        </span>
      </HoverCardTrigger>

      <HoverCardContent
        align="end"
        side="top"
        sideOffset={8}
        className="flex w-64 flex-col gap-2.5 p-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">上下文窗口</span>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {formatTokenCount(usedTokens)}
            <span className="text-[10px] font-normal text-muted-foreground">
              {" "}
              / {formatTokenCount(contextWindow)} · {usagePercentage}%
            </span>
          </span>
        </div>

        <Progress value={usagePercentage} />

        <div className="flex items-center justify-between gap-3 text-[10px]">
          <span
            className={cn(
              "truncate text-muted-foreground",
              usageRatio >= 0.85 && "text-destructive",
            )}
          >
            {getContextStatusMessage(usageRatio)}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
            剩余 {formatTokenCount(Math.max(0, contextWindow - usedTokens))}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function getContextStatusMessage(usageRatio: number): string {
  if (usageRatio >= 0.95) return "上下文即将用尽，建议开启新会话。";
  if (usageRatio >= 0.85) return "上下文使用较高，长任务可能需要压缩历史。";
  if (usageRatio >= 0.65) return "上下文接近提醒阈值，当前仍可继续。";
  return "上下文空间充足，可继续当前任务。";
}
