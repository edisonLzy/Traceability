# AgentPanel Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite AgentPanel to match divisor's active-session-content.tsx structure, remove traceability-only features, align PromptInput props, add ContextUsageControl.

**Architecture:** The refactor is split into 5 sequential tasks: (1) infrastructure files (hover-card, progress, token-usage), (2) ModalSelector internalization, (3) PromptInput rewrite with ContextUsageControl, (4) AgentPanel index.tsx rewrite with inlined hook + CreateSessionButton, (5) cleanup and verify.

**Tech Stack:** React 19, TypeScript strict, Zustand, @base-ui/react (already in deps), Tailwind 4, electron-vite

## Global Constraints

- All relative imports in `app/src/renderer/pages/_layout/_agent/` must use `../` prefix
- All file paths in `app/src/renderer/` can use `@renderer/` alias
- `@base-ui/react@^1.4.1` is already a dependency — do not install anything new
- Do NOT modify `ChatMessages`, `PendingMessages`, `AskUserQuestionPanel` — they stay unchanged
- Follow the existing code style: `import type` for type-only imports, `.js` suffix only in `packages/` and `server/` (not in `app/` via Vite)

---

### Task 1: Create Infrastructure Files (hover-card, progress, token-usage)

**Files:**
- Create: `app/src/renderer/components/ui/hover-card.tsx`
- Create: `app/src/renderer/components/ui/progress.tsx`
- Create: `app/src/renderer/lib/token-usage.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `{ HoverCard, HoverCardTrigger, HoverCardContent }` exports, `{ Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }` exports, `{ addUsage, getPromptTokens, getCacheHitRate, formatTokenCount, formatPercentage }` exports

- [ ] **Step 1: Create `hover-card.tsx`**

Write `app/src/renderer/components/ui/hover-card.tsx`:

```tsx
"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "@renderer/lib/utils";

function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<PreviewCardPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-64 origin-(--transform-origin) rounded-md border-2 border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-[var(--hard-shadow)] outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
```

- [ ] **Step 2: Create `progress.tsx`**

Write `app/src/renderer/components/ui/progress.tsx`:

```tsx
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@renderer/lib/utils";

function Progress({ className, children, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-2 w-full items-center overflow-x-hidden border border-border bg-muted",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      {...props}
    />
  );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue };
```

- [ ] **Step 3: Create `token-usage.ts`**

Write `app/src/renderer/lib/token-usage.ts`:

```tsx
import type { Usage } from "@earendil-works/pi-ai";

export function addUsage(left: Usage, right: Usage): Usage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    totalTokens: left.totalTokens + right.totalTokens,
    cost: {
      input: left.cost.input + right.cost.input,
      output: left.cost.output + right.cost.output,
      cacheRead: left.cost.cacheRead + right.cost.cacheRead,
      cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
      total: left.cost.total + right.cost.total,
    },
  };
}

export function getPromptTokens(usage: Usage): number {
  return usage.input + usage.cacheRead + usage.cacheWrite;
}

export function getCacheHitRate(usage: Usage): number | null {
  const promptTokens = getPromptTokens(usage);
  if (promptTokens === 0) return null;
  return usage.cacheRead / promptTokens;
}

export function formatTokenCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    return `${stripTrailingZero((value / 1000).toFixed(1))}k`;
  }
  return `${stripTrailingZero((value / 1_000_000).toFixed(1))}m`;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function stripTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git add app/src/renderer/components/ui/hover-card.tsx app/src/renderer/components/ui/progress.tsx app/src/renderer/lib/token-usage.ts
git commit -m "feat(ui): add hover-card, progress, token-usage infrastructure

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Update ModalSelector to useModalSelector Pattern

**Files:**
- Rewrite: `app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx`

**Interfaces:**
- Consumes: `useElectronIPC()` from `@renderer/context/ElectronIPCProvider`
- Produces: `ModalSelector(value, onChange)` component + `useModalSelector(initialValue?) => { value, onChange }` hook

- [ ] **Step 1: Rewrite `modal-selector.tsx`**

The new version fetches models internally via IPC (instead of receiving them as props) and exposes `useModalSelector` for local state management.

Write the full file at `app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx`:

```tsx
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { CircleHelp, Cpu } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export function ModalSelector({ value, onChange }: ModalSelectorProps) {
  const { invoke } = useElectronIPC();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      setIsLoading(true);

      try {
        const nextModels = await invoke("getAvailableModels");
        if (isActive) {
          setModels(nextModels);
        }
      } catch (error) {
        console.error("Failed to load available models", error);
        if (isActive) {
          setModels([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadModels();

    return () => {
      isActive = false;
    };
  }, [invoke]);

  useEffect(() => {
    if (value === null && models.length > 0) {
      onChange(models[0]!);
    }
  }, [models, onChange, value]);

  const selectedValue = value ? `${value.providerId}/${value.modelId}` : null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!normalizedQuery) {
      return models;
    }

    return models.filter((model) => {
      return [model.modelName, model.providerName, model.providerId, model.modelId].some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [models, normalizedQuery]);

  return (
    <Select
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
      value={selectedValue}
      onValueChange={(nextValue) => {
        const nextModel =
          models.find((model) => `${model.providerId}/${model.modelId}` === nextValue) ?? null;
        onChange(nextModel);
      }}
      disabled={isLoading || models.length === 0}
    >
      <SelectTrigger
        className="h-7 w-auto max-w-50 gap-1 rounded-sm border-2 border-border bg-card px-2 text-foreground shadow-[var(--hard-shadow-sm)] hover:bg-accent data-popup-open:bg-accent focus:ring-0"
        aria-label="Select model"
      >
        <SelectValue className="pointer-events-none min-w-0">
          {value ? (
            <div className="flex min-w-0 items-center gap-1.5 text-left text-xs font-normal text-muted-foreground">
              <span className="block truncate">{value.modelName}</span>
            </div>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {isLoading ? "加载中..." : "选择模型"}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>

      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        sideOffset={8}
        className="max-h-none w-max min-w-56 max-w-80 overflow-hidden rounded-md border-2 border-border bg-popover p-0 text-popover-foreground shadow-[var(--hard-shadow)]"
      >
        <div className="border-b-2 border-border px-2 py-2.5">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDownCapture={(event) => {
              event.stopPropagation();
            }}
            placeholder="搜索模型..."
            className="h-8 rounded-sm px-3 text-[12px] text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-60 overflow-x-hidden overflow-y-auto px-1 py-1.5">
          <TooltipProvider delay={120}>
            <SelectGroup className="min-w-0 p-0">
              {filteredModels.map((model) => {
                const modelValue = `${model.providerId}/${model.modelId}`;
                const isSelected = selectedValue === modelValue;

                return (
                  <SelectItem
                    key={modelValue}
                    value={modelValue}
                    className={cn(
                      "mb-0.5 last:mb-0 w-full overflow-hidden rounded-sm border border-transparent px-3 py-2 text-foreground focus:bg-accent focus:text-accent-foreground",
                      isSelected && "text-foreground",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden pr-6">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-signal-purple text-accent-foreground">
                        <Cpu className="size-3" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="block min-w-0 truncate text-[13px] font-medium leading-none text-current">
                          {model.modelName}
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                              />
                            }
                          >
                            <CircleHelp className="size-3.25" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px]">
                            {model.providerName}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </TooltipProvider>

          {!isLoading && filteredModels.length === 0 ? (
            <div
              className={cn(
                "px-3 py-3 text-[12px] text-muted-foreground",
                models.length === 0 && "text-center",
              )}
            >
              {models.length === 0 ? "没有可用模型" : "没有匹配的模型"}
            </div>
          ) : null}
        </div>
      </SelectContent>
    </Select>
  );
}

interface ModalSelectorProps {
  value: AvailableModel | null;
  onChange: (value: AvailableModel | null) => void;
}

export function useModalSelector(initialValue: AvailableModel | null = null): ModalSelectorProps {
  const [value, setValue] = useState<AvailableModel | null>(initialValue);

  const handleChange = useCallback((nextValue: AvailableModel | null) => {
    setValue(nextValue);
  }, []);

  return useMemo(() => ({ value, onChange: handleChange }), [handleChange, value]);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git add app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx
git commit -m "refactor(agent): internalize model management in modal-selector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update PromptInput with New Props + ContextUsageControl

**Files:**
- Rewrite: `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx`

**Interfaces:**
- Consumes: `PromptSubmission` from `../prompt-types`, `useChatEditor` from `../use-chat-editor`, `ModalSelector` + `useModalSelector` from `./modal-selector`, `TokenUsage` from `@renderer/store/agent`, `formatTokenCount` from `@renderer/lib/token-usage`, `HoverCard` from `@renderer/components/ui/hover-card`, `Progress` from `@renderer/components/ui/progress`
- Produces: `PromptInput` with new props interface as designed in the spec

- [ ] **Step 1: Write new `prompt-input/index.tsx`**

Replace the file at `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx`:

```tsx
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
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { Editor, EditorContent } from "@tiptap/react";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

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
    [disabled, editor, hasContent, hasModel, modelSelectorProps.value, onFollowUp, onSteer, onSubmit],
  );

  // Listen for Enter / Mod+Enter on the editor container with `capture: true`
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (!matchesKeyboardEvent(event, "Enter") && !matchesKeyboardEvent(event, "Mod+Enter"))
      ) {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (suggestionState?.active) {
        return;
      }

      if (isRunning) {
        if (matchesKeyboardEvent(event, "Mod+Enter")) {
          event.preventDefault();
          void handleSubmit("follow-up");
        }

        if (matchesKeyboardEvent(event, "Enter")) {
          event.preventDefault();
          void handleSubmit("steering");
        }
        return;
      }

      event.preventDefault();
      void handleSubmit("prompt");
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git add app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx
git commit -m "refactor(agent): align PromptInput props with divisor + add ContextUsageControl

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rewrite AgentPanel index.tsx

**Files:**
- Rewrite: `app/src/renderer/pages/_layout/_agent/index.tsx`

**Interfaces:**
- Consumes: `agentStore` from `@renderer/store/agent`, `useAgentMessages` from `./hooks/use-agent-messages`, `useAgentTokenUsage` from `./hooks/use-agent-token-usage`, `isMessageEntry` from `./messages/types`, `shouldAutoRenameSession` + `createSessionTitleFromPrompt` from `./session-title`, `ChatMessages` from `./messages`, `PendingMessages` from `./pending-messages`, `AskUserQuestionPanel` from `./human-in-the-loop`, `PromptInput` + `PromptInputProps` from `./prompt-input`, `useElectronIPC` from `@renderer/context/ElectronIPCProvider`
- Produces: no exports (self-contained page component)

- [ ] **Step 1: Rewrite `index.tsx`**

Replace the file at `app/src/renderer/pages/_layout/_agent/index.tsx`:

```tsx
import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type { ToolExecutionState } from "@renderer/store/agent";
import { Sparkles, SquarePlus } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { isMessageEntry, isUserMessage } from "./messages/types";
import { PendingMessages } from "./pending-messages";
import { PromptInput, type PromptInputProps } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "./session-title";
import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

export function AgentPanel() {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    tokenUsage,
  } = useActiveSessionChat();

  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId!);
  const activeSession = useStore(agentStore, (state) =>
    activeSessionId ? state.getSession(activeSessionId) : undefined,
  );
  const pendingHumanInTheLoopRequest = useStore(agentStore, (state) => {
    if (!activeSessionId) {
      return null;
    }
    return state.getHumanInTheLoopState(activeSessionId).requests[0] ?? null;
  });
  const sessionName = activeSession?.name.trim() || "untitled";

  useAgentMessages();
  useAgentTokenUsage();

  const handlePromptInputCreated: PromptInputProps["onCreate"] = () => {};
  const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {};

  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex h-full min-w-0 flex-col bg-[rgba(18,19,23,0.75)] backdrop-blur-2xl"
    >
      <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
        <span className="grid size-[27px] place-items-center rounded-[9px] bg-primary/15 text-primary-hover">
          <Sparkles size={15} />
        </span>
        <h1 className="min-w-0 flex-1 truncate px-1.5 text-[12px] font-[650] text-ink">
          {sessionName}
        </h1>
        <CreateSessionButton />
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        <ChatMessages
          entries={entries}
          sessionId={activeSessionId ?? ""}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5">
        {activeSessionId ? <PendingMessages sessionId={activeSessionId} /> : null}
        <div className={activeSessionId ? "mt-2" : ""}>
          {activeSessionId && pendingHumanInTheLoopRequest ? (
            <AskUserQuestionPanel
              request={pendingHumanInTheLoopRequest}
              sessionId={activeSessionId}
            />
          ) : (
            <PromptInput
              disabled={false}
              initialModel={activeSession?.model ?? null}
              isRunning={isRunning}
              onFollowUp={followUpPrompt}
              onSteer={steerPrompt}
              onStop={stopPrompt}
              onSubmit={submitPrompt}
              sessionId={activeSessionId}
              onCreate={handlePromptInputCreated}
              onDestroy={handlePromptInputDestroyed}
              tokenUsage={tokenUsage}
            />
          )}
        </div>
      </section>
    </aside>
  );
}

// ─── CreateSessionButton ─────────────────────────────────────────

function CreateSessionButton() {
  const { invoke } = useElectronIPC();

  const handleClick = useCallback(async () => {
    try {
      const session = await invoke("createSession", "traceability");
      agentStore.getState().appendSession(session);
      agentStore.getState().setActiveSessionId(session.id);
      await invoke("setSessionId", session.id);
      await invoke("setSessionScope", "main");
    } catch (error) {
      console.error("Failed to create session", error);
    }
  }, [invoke]);

  return (
    <button
      className="grid size-[27px] place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
      onClick={handleClick}
      title="New conversation"
      type="button"
    >
      <SquarePlus size={16} />
    </button>
  );
}

// ─── useActiveSessionChat (inline hook) ──────────────────────────

function useActiveSessionChat() {
  const { invoke } = useElectronIPC();
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId!);
  const activeSession = activeSessionId
    ? agentStore.getState().getSession(activeSessionId)
    : null;
  const entryState = activeSessionId
    ? agentStore.getState().getEntryState(activeSessionId)
    : { entries: [], toolStates: EMPTY_TOOL_STATES, status: "idle" as const };
  const entries = entryState.entries;
  const messageEntries = entries.filter(isMessageEntry);
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";
  const tokenUsage = messageEntries.findLast((entry) => entry.tokenUsage)?.tokenUsage;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      agentStore.getState().setSessionStatus(activeSessionId, "running");
      agentStore.getState().setModel(activeSessionId, submission.model);
      const submissionText = submission.content;
      const shouldRename =
        shouldAutoRenameSession(activeSession?.name) &&
        !entries.some((entry) => isMessageEntry(entry) && isUserMessage(entry.data));

      if (shouldRename) {
        const title = createSessionTitleFromPrompt(submissionText);
        agentStore.getState().setSessionName(activeSessionId, title);
        try {
          await invoke("renameSession", activeSessionId, title);
        } catch (error) {
          console.error("Failed to rename session", error);
        }
      }

      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submissionText,
          timestamp: Date.now(),
          kind: "prompt",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to submit prompt", error);
        agentStore.getState().setSessionStatus(activeSessionId, "idle");
      }
    },
    [activeSession?.name, activeSessionId, entries, invoke],
  );

  const steerPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "steering",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to steer prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const followUpPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "follow-up",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to queue follow-up prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const stopPrompt = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      await invoke("abortPrompt", activeSessionId);
    } catch (error) {
      console.error("Failed to stop prompt", error);
    }
  }, [activeSessionId, invoke]);

  return {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId: activeSessionId
      ? agentStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    tokenUsage,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git add app/src/renderer/pages/_layout/_agent/index.tsx
git commit -m "refactor(agent): rewrite AgentPanel with divisor structure

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Remove use-active-session-chat.ts + Verify

**Files:**
- Delete: `app/src/renderer/pages/_layout/_agent/hooks/use-active-session-chat.ts`

- [ ] **Step 1: Remove the old hook file**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git rm app/src/renderer/pages/_layout/_agent/hooks/use-active-session-chat.ts
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/evan/Desktop/inspiration/traceability
pnpm --filter @traceability/app typecheck
```

Expected: no type errors. If there are errors, fix them (likely missing imports in `index.tsx`).

- [ ] **Step 3: Run unit tests**

```bash
cd /Users/evan/Desktop/inspiration/traceability
pnpm --filter @traceability/app exec vitest run
```

Expected: all tests pass. Note that `use-agent-token-usage.test.ts` has a test for `calculateEntryTokenUsage` — this should still pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/evan/Desktop/inspiration/traceability
git add -A
git commit -m "chore(agent): remove unused use-active-session-chat hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After all tasks:

1. `pnpm --filter @traceability/app typecheck` — types pass
2. `pnpm --filter @traceability/app exec vitest run` — tests pass
3. `pnpm dev:app` — launch app and verify:
   - AgentPanel renders without errors
   - Chat messages display correctly
   - PromptInput works (Enter to submit, running state steer/follow-up)
   - Context usage indicator appears in PromptInput
   - CreateSessionButton creates new sessions
   - No console errors
