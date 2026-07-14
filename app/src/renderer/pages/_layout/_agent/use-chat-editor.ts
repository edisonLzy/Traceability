import Placeholder from "@tiptap/extension-placeholder";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";

import { skillNode } from "./prompt-input/skill-node";

export interface UseChatEditorOptions {
  disabled?: boolean;
  onCreate?: (editor: NonNullable<ReturnType<typeof useEditor>>) => void;
  onDestroy?: () => void;
}

/** Shared TipTap setup, matching divisor's editor lifecycle without extensions. */
export function useChatEditor({
  disabled = false,
  onCreate,
  onDestroy,
}: UseChatEditorOptions = {}) {
  const [hasContent, setHasContent] = useState(false);
  const editor = useEditor({
    editable: !disabled,
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
    onCreate: ({ editor: nextEditor }) => onCreate?.(nextEditor),
    onDestroy: () => onDestroy?.(),
    onUpdate: ({ editor: nextEditor }) => setHasContent(!nextEditor.isEmpty),
  });

  return { editor, hasContent };
}
