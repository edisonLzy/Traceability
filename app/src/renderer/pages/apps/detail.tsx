import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { cn } from "@renderer/lib/utils";
import { useApp } from "@renderer/pages/apps/hooks/use-app";
import { useDeleteApp } from "@renderer/pages/apps/hooks/use-delete-app";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: app } = useApp(id);
  const deleteAppMutation = useDeleteApp();
  const nav = useNavigate();
  if (!app)
    return (
      <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
        <div className="px-5 py-13.5 text-center text-subtle">Loading…</div>
      </div>
    );

  const dsn = `${location.origin.replace(/:\d+$/, ":3000")}/api/ingest/envelope/${app.id}`;

  const del = async () => {
    try {
      await deleteAppMutation.mutateAsync(app.id);
    } catch (e) {
      toast(String(e));
      return;
    }
    toast("Application deleted");
    nav("/apps");
  };

  return (
    <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
      <div className="mb-7 flex items-start justify-between gap-3.5">
        <div>
          <Button size="sm" onClick={() => nav("/apps")}>
            ← Applications
          </Button>
          <h1
            className={cn(
              "m-0 text-2xl leading-tight font-semibold tracking-[-0.7px] tablet:text-[28px]",
              "mt-4.5",
            )}
          >
            {app.name}
          </h1>
          <p className="mt-1.5 text-subtle">
            {app.defaultBranch} · created {new Date(app.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => nav(`/issues?appId=${app.id}`)}>
            View issues
          </Button>
          <Button onClick={() => nav(`/performance?appId=${app.id}`)}>View performance</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4.5 desktop:grid-cols-[minmax(0,1fr)_310px]">
        <Card>
          <CardHeader>
            <CardTitle>SDK connection</CardTitle>
            <Badge variant="fixed" className="ml-auto">
              Receiving events
            </Badge>
          </CardHeader>
          <div className="px-4.5 py-2">
            <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs">
              <div className="text-[11px] text-tertiary">App ID</div>
              <div className="break-all font-medium text-muted">{app.id}</div>
            </div>
            <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs">
              <div className="text-[11px] text-tertiary">DSN</div>
              <div className="break-all font-medium text-muted">{dsn}</div>
            </div>
            <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs">
              <div className="text-[11px] text-tertiary">Repository</div>
              <div className="break-all font-medium text-muted">{app.repoUrl}</div>
            </div>
            <div className="grid grid-cols-[120px_1fr] border-b border-hairline py-2.5 text-xs last:border-b-0">
              <div className="text-[11px] text-tertiary">Default branch</div>
              <div className="break-all font-medium text-muted">{app.defaultBranch}</div>
            </div>
          </div>
        </Card>
        <aside className="h-max order-first overflow-hidden rounded-xl border border-hairline bg-surface-1 desktop:order-none">
          <div className="border-b border-hairline p-4">
            <div className="mb-2 text-[11px] text-tertiary">Created</div>
            <div className="text-xs font-medium text-muted">
              {new Date(app.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="p-4">
            <Button variant="danger" className="w-full" onClick={del}>
              Delete application
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
