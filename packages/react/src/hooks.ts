import * as core from "@traceability/browser";
import type { ReportData } from "@traceability/browser";
import { useCallback } from "react";

export function useMonitorReport() {
  return useCallback((data: ReportData) => {
    core.report(data);
  }, []);
}

export function useMonitorTag() {
  return useCallback((key: string, value: string) => {
    core.setTag(key, value);
  }, []);
}
