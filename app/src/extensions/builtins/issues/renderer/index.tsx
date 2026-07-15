import { cn, relativeTime, statusLabel } from "@renderer/lib/utils";
import type { Issue, IssueStatus } from "@traceability/protocol";
import { useNavigate } from "react-router-dom";

import { defineRendererExtension } from "../../../core/renderer";
import { ISSUES_EXTENSION } from "../common/extension";
import { ISSUES_LIST_BLOCK_TYPE, type IssuesListBlockProps } from "../common/types";

function IssuesListBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseIssuesProps(props);

  if (!block) {
    return null;
  }

  return (
    <div className="not-prose my-2 border-y border-hairline text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-1 text-[10px] text-muted">
        <span className="font-[620]">Issues</span>
        <span className="text-tertiary">{block.issues.length}</span>
      </div>
      <div className="border-t border-hairline py-1">
        {block.issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => navigate(`/issues/${issue.id}`)}
            className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                issue.type === "error" ? "bg-danger" : "bg-warning",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[10px] font-[610]">{issue.title}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {statusLabel(issue.status)}
                </span>
              </div>
              <div className="truncate text-[9px] text-muted-foreground">
                x{issue.count} · {relativeTime(issue.lastSeen)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ type: ISSUES_LIST_BLOCK_TYPE, render: IssuesListBlock });
  },
});

function parseIssuesProps(value: Record<string, unknown>): IssuesListBlockProps | null {
  if (!Array.isArray(value.issues) || typeof value.appId !== "string") {
    return null;
  }

  return {
    appId: value.appId,
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null,
    issues: value.issues.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.appId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.type !== "string" ||
        typeof item.status !== "string"
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          appId: item.appId,
          fingerprint: typeof item.fingerprint === "string" ? item.fingerprint : "",
          title: item.title,
          type: item.type as Issue["type"],
          firstSeen: typeof item.firstSeen === "string" ? item.firstSeen : "",
          lastSeen: typeof item.lastSeen === "string" ? item.lastSeen : "",
          count: typeof item.count === "number" ? item.count : 0,
          status: item.status as IssueStatus,
          metadata: isRecord(item.metadata) ? item.metadata : {},
        },
      ];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
