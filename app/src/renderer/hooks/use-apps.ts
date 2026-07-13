import { listApps } from "@renderer/apis/apps";
import { useQuery } from "@tanstack/react-query";

const APPS_KEY = ["apps"] as const;

export function useApps() {
  return useQuery({ queryKey: APPS_KEY, queryFn: () => listApps(), staleTime: 30_000 });
}
