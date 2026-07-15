import { defineRendererExtension } from "../../../core/renderer";
import { APPS_EXTENSION } from "../common/extension";
import { APPS_LIST_BLOCK_TYPE, type AppsListBlockProps } from "../common/types";

function AppsListBlock({ props }: { props: Record<string, unknown> }) {
  const block = parseAppsProps(props);

  if (!block) {
    return null;
  }

  return (
    <div className="not-prose my-2 border-y border-hairline text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-1 text-[10px] text-muted">
        <span className="font-[620]">Apps</span>
        <span className="text-tertiary">{block.apps.length}</span>
      </div>
      <div className="border-t border-hairline py-1">
        {block.apps.map((app) => (
          <div
            key={app.id}
            className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[10px] font-[610]">{app.name}</span>
              </div>
              <div className="truncate text-[9px] text-muted-foreground">
                {app.id} · {app.repoUrl} · {app.defaultBranch}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...APPS_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ type: APPS_LIST_BLOCK_TYPE, render: AppsListBlock });
  },
});

function parseAppsProps(value: Record<string, unknown>): AppsListBlockProps | null {
  if (!Array.isArray(value.apps)) {
    return null;
  }

  return {
    apps: value.apps.filter(isRecord).flatMap((item) => {
      if (typeof item.id !== "string" || typeof item.name !== "string") {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name,
          repoUrl: typeof item.repoUrl === "string" ? item.repoUrl : "",
          defaultBranch: typeof item.defaultBranch === "string" ? item.defaultBranch : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        },
      ];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
