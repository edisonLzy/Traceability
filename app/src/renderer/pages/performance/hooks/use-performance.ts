import { useQuery } from '@tanstack/react-query'
import { getPerformanceSummary } from '@renderer/apis/monitor'

export interface UsePerformanceSummaryParams {
  appId: string
  hours: 1 | 24 | 168
}

export function usePerformanceSummary(params: UsePerformanceSummaryParams) {
  return useQuery({
    queryKey: ['performance', { appId: params.appId, hours: params.hours }],
    queryFn: () => getPerformanceSummary(params),
    staleTime: 30_000,
  })
}
