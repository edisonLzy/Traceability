import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import type { TSchema } from '@earendil-works/pi-ai'
import type { MonitorToolMethod } from '../../shared/ipc.js'

export interface MonitorToolRequester {
  request<T>(method: MonitorToolMethod, args: Record<string, unknown>): Promise<T>
}

export function createMonitorTools(requester: MonitorToolRequester): AgentTool[] {
  return [
    createTool('monitor.listIssues', 'List Issues', 'List runtime issues for the current application.', 'listIssues', Type.Object({
      status: Type.Optional(Type.String({ description: 'Optional issue status filter' })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    })),
    createTool('monitor.getIssue', 'Get Issue', 'Get one issue and its current metadata.', 'getIssue', Type.Object({
      issueId: Type.String({ description: 'Issue ID' }),
    })),
    createTool('monitor.getIssueEvents', 'Get Issue Events', 'Get recent events that belong to an issue.', 'getIssueEvents', Type.Object({
      issueId: Type.String({ description: 'Issue ID' }),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    })),
    createTool('monitor.getIssueReplays', 'Get Issue Replays', 'List rrweb replay summaries for an issue.', 'getIssueReplays', Type.Object({
      issueId: Type.String({ description: 'Issue ID' }),
    })),
    createTool('monitor.getReplay', 'Get Replay', 'Get a complete rrweb replay for an issue.', 'getReplay', Type.Object({
      issueId: Type.String({ description: 'Issue ID' }),
      replayId: Type.String({ description: 'Replay ID' }),
    })),
    createTool('monitor.getPerformanceSummary', 'Get Performance Summary', 'Get performance metric summaries for the current application.', 'getPerformanceSummary', Type.Object({
      hours: Type.Number({ minimum: 1, maximum: 168, description: 'Time range in hours' }),
    })),
  ]

  function createTool(
    name: string,
    label: string,
    description: string,
    method: MonitorToolMethod,
    parameters: TSchema,
  ): AgentTool {
    return {
      name,
      label,
      description,
      parameters,
      async execute(_toolCallId, args) {
        const result = await requester.request(method, args as Record<string, unknown>)
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          details: result,
        }
      },
    }
  }
}
