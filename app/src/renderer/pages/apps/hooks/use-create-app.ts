import { createApp } from "@renderer/apis/apps";
import type { CreateAppRequest } from "@renderer/apis/apps";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const APPS_KEY = ["apps"] as const;

export function useCreateApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateAppRequest) => createApp(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPS_KEY });
    },
  });
}
