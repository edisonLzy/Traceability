import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, CircleStop, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { ModelSelector } from "./model-selector";
import { getSkillNodeIds, insertSkillNode, skillNode } from "./skill-node";

export interface PromptSubmission {
  content: string;
  jsonContent: JSONContent;
  model: AvailableModel;
  skillIds: string[];
}

interface PromptInputProps {
  disabled?: boolean;
  isRunning: boolean;
  model: AvailableModel | null;
  models: AvailableModel[];
  onModelChange: (model: AvailableModel | null) => void;
  onStop: () => void;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  skills: DiscoveredSkill[];
}

export function PromptInput({
  disabled = false,
  isRunning,
  model,
  models,
  onModelChange,
  onStop,
  onSubmit,
  skills,
}: PromptInputProps) {
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Ask about this application…" }),
      skillNode,
    ],
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[46px] max-h-[132px] overflow-y-auto text-[12px] leading-5 text-ink outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-tertiary [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      },
    },
    onUpdate: ({ editor: nextEditor }) =>
      setSelectedSkillIds(getSkillNodeIds(nextEditor.getJSON())),
  });

  useEffect(() => {
    editor?.setEditable(!disabled && !isRunning);
  }, [disabled, editor, isRunning]);

  const submit = async () => {
    if (!editor || disabled || isRunning || !model) return;
    const content = editor.getText({ blockSeparator: "\n" }).trim();
    if (!content) return;
    await onSubmit({ content, jsonContent: editor.getJSON(), model, skillIds: selectedSkillIds });
    editor.commands.clearContent();
    setSelectedSkillIds([]);
  };

  return (
    <div className="rounded-[11px] border border-hairline-strong bg-white/[0.045] p-1.5 focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_rgba(143,156,255,0.09)]">
      <div
        className="px-1.5 py-1"
        onKeyDownCapture={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-1 pt-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ModelSelector
            disabled={disabled || isRunning}
            models={models}
            onChange={onModelChange}
            value={model}
          />
          {skills.length > 0 && (
            <details className="relative">
              <summary className="flex h-7 list-none items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2 text-[10px] text-tertiary hover:text-muted">
                <Wrench size={11} /> Skills
                {selectedSkillIds.length > 0 ? ` · ${selectedSkillIds.length}` : ""}
              </summary>
              <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-56 rounded-lg border border-hairline-strong bg-surface-2 p-1 shadow-xl">
                {skills
                  .filter((skill) => skill.enabled)
                  .map((skill) => {
                    const selected = selectedSkillIds.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={cn(
                          "block w-full rounded-md px-2 py-1.5 text-left text-[10px] text-tertiary hover:bg-white/[0.06] hover:text-ink",
                          selected && "bg-primary/15 text-primary-hover",
                        )}
                        disabled={selected}
                        onClick={() => {
                          if (!editor) return;
                          insertSkillNode(editor, {
                            id: skill.id,
                            label: skill.name,
                            scope: skill.scope,
                          });
                          setSelectedSkillIds(getSkillNodeIds(editor.getJSON()));
                        }}
                      >
                        <span className="block font-[620]">{skill.name}</span>
                        <span className="block truncate text-[9px] text-tertiary">
                          {skill.description}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </details>
          )}
        </div>
        <Button
          aria-label={isRunning ? "Stop response" : "Send prompt"}
          className={cn(
            "size-7 rounded-[8px]",
            isRunning && "border-danger/30 bg-danger/20 text-danger",
          )}
          disabled={isRunning ? false : disabled || !model}
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
        Enter to send · Shift+Enter for a newline
      </p>
    </div>
  );
}
