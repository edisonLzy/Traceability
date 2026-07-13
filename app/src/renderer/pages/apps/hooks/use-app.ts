import { getApp } from "@renderer/apis/apps";
import { useQuery } from "@tanstack/react-query";

const appKey = (id: string) => ["apps", id] as const;

export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: appKey(id ?? ""),
    queryFn: () => getApp(id!),
    enabled: Boolean(id),
  });
}
