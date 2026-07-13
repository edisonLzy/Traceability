import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from '@earendil-works/pi-ai'
import type { AxiosInstance } from 'axios'
import { AgentRuntime } from './agent-runtime.js'
import { ModelRegistry } from './model-registry.js'
import { SessionStore } from './session-store.js'
import { LocalDatabase } from '../db/database.js'

describe('AgentRuntime', () => {
  const databases: LocalDatabase[] = []

  afterEach(() => {
    for (const database of databases.splice(0)) database.close()
  })

  it('persists a normal response and resolves an Issue tool call through the self-contained monitor client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'traceability-agent-test-'))
    const modelPath = join(directory, 'models.json')
    await writeFile(modelPath, JSON.stringify({
      providers: {
        faux: {
          api: 'faux',
          baseUrl: 'http://faux.local',
          apiKey: 'unused',
          models: [{ id: 'monitor-test', name: 'Monitor Test' }],
        },
      },
    }))

    const faux = registerFauxProvider({ provider: 'faux', api: 'faux', models: [{ id: 'monitor-test' }] })
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('monitor.getIssue', { issueId: 'issue-1' })),
      fauxAssistantMessage(fauxText('The issue was loaded through the monitoring tool.')),
    ])

    try {
      const database = new LocalDatabase(':memory:')
      databases.push(database)
      const sessions = new SessionStore(database)
      const created = sessions.create('app-1')
      const models = new ModelRegistry(modelPath)
      await models.reload()

      const http = {
        get: vi.fn(async (url: string) => {
          if (url === '/api/issues/issue-1') {
            return { data: { id: 'issue-1', appId: 'app-1', title: 'Boom' } }
          }
          throw new Error(`unexpected GET ${url}`)
        }),
      } as unknown as AxiosInstance

      const emitted: string[] = []
      const runtime = new AgentRuntime(created.id, created.appId, sessions, models, http, (event) => emitted.push(event.type))
      await runtime.setModel({ providerId: 'faux', modelId: 'monitor-test' })
      await runtime.prompt({
        sessionId: created.id,
        text: 'Please inspect issue issue-1.',
        context: { appId: 'app-1', source: 'issue', issueId: 'issue-1' },
      })
      await runtime.waitForIdle()

      expect(http.get).toHaveBeenCalledWith('/api/issues/issue-1')
      const detail = sessions.get(created.id)
      expect(detail?.entries.map((entry) => entry.type)).toEqual(['model_change', 'message', 'message', 'message', 'message'])
      expect(detail?.entries.slice(1).map((entry) => entry.data.role)).toEqual(['user', 'assistant', 'toolResult', 'assistant'])
      expect(JSON.stringify(detail?.entries)).toContain('The issue was loaded through the monitoring tool.')
      expect(emitted).toContain('tool_execution_start')
      expect(emitted).toContain('agent_end')
    } finally {
      faux.unregister()
    }
  })

  it('passes Performance summaries through a monitor tool call before the assistant replies', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'traceability-agent-performance-test-'))
    const modelPath = join(directory, 'models.json')
    await writeFile(modelPath, JSON.stringify({
      providers: {
        faux: {
          api: 'faux',
          baseUrl: 'http://faux.local',
          apiKey: 'unused',
          models: [{ id: 'performance-test' }],
        },
      },
    }))

    const faux = registerFauxProvider({ provider: 'faux', api: 'faux', models: [{ id: 'performance-test' }] })
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('monitor.getPerformanceSummary', { hours: 24 })),
      fauxAssistantMessage(fauxText('Performance data shows the requested monitoring summary.')),
    ])

    try {
      const database = new LocalDatabase(':memory:')
      databases.push(database)
      const sessions = new SessionStore(database)
      const created = sessions.create('app-performance')
      const models = new ModelRegistry(modelPath)
      await models.reload()

      const http = {
        get: vi.fn(async (url: string) => {
          if (url.startsWith('/api/performance')) {
            return {
              data: {
                since: new Date().toISOString(),
                apps: [{ appId: 'app-performance', appName: 'Checkout', samples: 3, metrics: { LCP: { average: 1200, p75: 1500, count: 3, lastSeen: new Date().toISOString(), unit: 'millisecond' } } }],
              },
            }
          }
          throw new Error(`unexpected GET ${url}`)
        }),
      } as unknown as AxiosInstance

      const runtime = new AgentRuntime(created.id, created.appId, sessions, models, http, () => {})
      await runtime.setModel({ providerId: 'faux', modelId: 'performance-test' })
      await runtime.prompt({
        sessionId: created.id,
        text: 'Analyze performance over the last day.',
        context: { appId: created.appId, source: 'performance', hours: 24 },
      })
      await runtime.waitForIdle()

      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/api/performance?appId=app-performance&hours=24'))
      expect(JSON.stringify(sessions.get(created.id)?.entries)).toContain('Performance data shows the requested monitoring summary.')
    } finally {
      faux.unregister()
    }
  })
})
