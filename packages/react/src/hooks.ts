import { setTag } from "@traceability/browser";
import { useCallback } from "react";

export function useMonitorTag() {
  return useCallback((key: string, value: string) => {
    setTag(key, value);
  }, []);
}
