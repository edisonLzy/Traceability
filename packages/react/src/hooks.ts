import { useCallback } from 'react'
import * as core from '@traceability/core'
import type { ReportData } from '@traceability/core'

export function useMonitorReport() {
  return useCallback((data: ReportData) => {
    core.report(data)
  }, [])
}

export function useMonitorTag() {
  return useCallback((key: string, value: string) => {
    core.setTag(key, value)
  }, [])
}
