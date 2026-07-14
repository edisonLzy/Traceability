import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { skillNode } from "../prompt-input/skill-node";

export function UserMessage({ message }: { message: AppUserMessage }) {
  const editor = useEditor({
    content: message.jsonContent,
    editable: false,
    extensions: [StarterKit, skillNode],
    editorProps: {
      attributes: { class: "ProseMirror text-[12px] leading-[1.55] outline-none" },
    },
  });

  return (
    <article className="mb-3 flex justify-end pl-9">
      <div className="max-w-full rounded-[13px_13px_4px_13px] border border-primary/25 bg-primary/15 px-3 py-2 text-[#e4e7ff]">
        <EditorContent editor={editor} />
      </div>
    </article>
  );
}
