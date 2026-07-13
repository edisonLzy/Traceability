import * as core from "@traceability/core";
import type { ReportData } from "@traceability/core";
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
