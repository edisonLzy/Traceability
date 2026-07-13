import { deleteApp } from "@renderer/apis/apps";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const APPS_KEY = ["apps"] as const;

export function useDeleteApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApp(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPS_KEY });
    },
  });
}
