import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Field } from "@renderer/components/ui/field";
import { useCurrentApp } from "@renderer/context/current-app";
import { useCreateApp } from "@renderer/pages/apps/hooks/use-create-app";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function CreateAppModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setAppId } = useCurrentApp();
  const createAppMutation = useCreateApp();
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setRepo("");
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !repo.trim()) {
      toast("Enter an application name and repository");
      return;
    }
    try {
      const app = await createAppMutation.mutateAsync({
        name: name.trim(),
        repoUrl: repo.trim(),
        defaultBranch: "master",
      });
      setAppId(app.id);
      onOpenChange(false);
      toast("Application added");
    } catch (cause) {
      toast(String(cause));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add application</DialogTitle>
            <DialogDescription>Create a monitored application and switch to it.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              label="Application name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. checkout-web"
              autoFocus
            />
            <Field
              label="Repository"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="team/checkout-web"
            />
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-[#111329] transition-colors hover:bg-primary-hover"
            >
              Add application
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
