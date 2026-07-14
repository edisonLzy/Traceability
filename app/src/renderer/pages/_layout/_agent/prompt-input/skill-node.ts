import { mergeAttributes, type Editor, type JSONContent, type Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";

const SKILL_NODE_NAME = "skillNode";

export interface SkillNodeAttrs {
  id: string;
  label?: string | null;
  scope?: string | null;
}

export function insertSkillNode(editor: Editor, skill: SkillNodeAttrs, range?: Range): boolean {
  const content = [
    {
      type: SKILL_NODE_NAME,
      attrs: {
        id: skill.id,
        label: skill.label ?? skill.id,
        scope: skill.scope ?? null,
      },
    },
    { type: "text", text: " " },
  ];
  const chain = editor.chain().focus();
  return range ? chain.insertContentAt(range, content).run() : chain.insertContent(content).run();
}

export function getSkillNodeIds(content: JSONContent): string[] {
  const ids = new Set<string>();

  const visit = (node: JSONContent) => {
    if (node.type === SKILL_NODE_NAME && typeof node.attrs?.id === "string") {
      ids.add(node.attrs.id);
    }
    node.content?.forEach(visit);
  };

  visit(content);
  return [...ids];
}

export const skillNode = Mention.extend({
  name: SKILL_NODE_NAME,
  selectable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      scope: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-scope"),
        renderHTML: (attributes: { scope?: string | null }) =>
          attributes.scope ? { "data-scope": attributes.scope } : {},
      },
    };
  },
}).configure({
  HTMLAttributes: {
    class:
      "skill-node inline-flex rounded border border-primary/30 bg-primary/15 px-1 py-px text-[10px] font-[620] text-primary-hover",
    "data-inline-node": "skill",
  },
  renderHTML({ node, options }) {
    return [
      "span",
      mergeAttributes(options.HTMLAttributes, {
        "data-skill-id": node.attrs.id,
        "data-skill-label": node.attrs.label ?? node.attrs.id,
      }),
      `@${node.attrs.label ?? node.attrs.id ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `<skill name="${escapeXmlAttribute(node.attrs.id ?? "")}"></skill>`;
  },
});

function escapeXmlAttribute(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
