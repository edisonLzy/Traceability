import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from '@earendil-works/pi-ai'
import { AgentRuntime } from './agent-runtime.js'
import { ModelRegistry } from './model-registry.js'
import { RendererDataBroker } from './renderer-data-broker.js'
import { SessionStore } from './session-store.js'
import { LocalDatabase } from '../db/database.js'

describe('AgentRuntime', () => {
  const databases: LocalDatabase[] = []

  afterEach(() => {
    for (const database of databases.splice(0)) database.close()
  })

  it('persists a normal response and resolves an Issue tool call through the renderer bridge', async () => {
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

      let broker!: RendererDataBroker
      broker = new RendererDataBroker(() => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (_channel: string, request: { requestId: string; method: string; appId: string }) => {
            expect(request.method).toBe('getIssue')
            expect(request.appId).toBe('app-1')
            queueMicrotask(() => broker.resolve(request.requestId, { id: 'issue-1', appId: 'app-1', title: 'Boom' }))
          },
        },
      }) as any)

      const emitted: string[] = []
      const runtime = new AgentRuntime(created.id, created.appId, sessions, models, broker, (event) => emitted.push(event.type))
      await runtime.setModel({ providerId: 'faux', modelId: 'monitor-test' })
      await runtime.prompt({
        sessionId: created.id,
        text: 'Please inspect issue issue-1.',
        context: { appId: 'app-1', source: 'issue', issueId: 'issue-1' },
      })
      await runtime.waitForIdle()

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

      let broker!: RendererDataBroker
      broker = new RendererDataBroker(() => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (_channel: string, request: { requestId: string; method: string; appId: string; args: { hours?: number } }) => {
            expect(request.method).toBe('getPerformanceSummary')
            expect(request.appId).toBe('app-performance')
            expect(request.args.hours).toBe(24)
            queueMicrotask(() => broker.resolve(request.requestId, {
              since: new Date().toISOString(),
              apps: [{ appId: 'app-performance', appName: 'Checkout', samples: 3, metrics: { LCP: { average: 1200, p75: 1500, count: 3, lastSeen: new Date().toISOString(), unit: 'millisecond' } } }],
            }))
          },
        },
      }) as any)

      const runtime = new AgentRuntime(created.id, created.appId, sessions, models, broker, () => {})
      await runtime.setModel({ providerId: 'faux', modelId: 'performance-test' })
      await runtime.prompt({
        sessionId: created.id,
        text: 'Analyze performance over the last day.',
        context: { appId: created.appId, source: 'performance', hours: 24 },
      })
      await runtime.waitForIdle()

      expect(JSON.stringify(sessions.get(created.id)?.entries)).toContain('Performance data shows the requested monitoring summary.')
    } finally {
      faux.unregister()
    }
  })
})
