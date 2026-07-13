import { type SubmitEvent, useEffect, useState } from 'react'
import { Streamdown } from 'streamdown'
import type { Application } from '@traceability/protocol'
import { apiFetch } from '../../api/client'
import { fetchMonitorData } from '../../agent-monitor-data'
import type { AgentEntry, AgentPromptInput, AgentSessionDetail, AgentSessionSummary, AvailableModel } from '../../../shared/ipc'

export function AgentPanel() {
  const [applications, setApplications] = useState<Application[]>([])
  const [appId, setAppId] = useState('')
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([])
  const [sessionId, setSessionId] = useState('')
  const [session, setSession] = useState<AgentSessionDetail | null>(null)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [context, setContext] = useState<AgentPromptInput['context'] | null>(null)
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void apiFetch<Application[]>('/api/apps')
      .then((items) => {
        setApplications(items)
        setAppId(items[0]?.id ?? '')
      })
      .catch((cause) => setError(toError(cause)))
    void window.traceability.agent.listModels().then((items) => {
      setModels(items)
      setSelectedModel(items[0] ? modelKey(items[0]) : '')
    })
  }, [])

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<AgentPromptInput['context']>).detail
      if (!detail?.appId) return
      setAppId(detail.appId)
      setContext(detail)
    }
    window.addEventListener('traceability:agent-context', onContext)
    return () => window.removeEventListener('traceability:agent-context', onContext)
  }, [])

  useEffect(() => {
    if (!appId) {
      setSessions([])
      setSessionId('')
      setSession(null)
      return
    }
    void window.traceability.sessions.list(appId).then((items) => {
      setSessions(items)
      setSessionId(items[0]?.id ?? '')
    }).catch((cause) => setError(toError(cause)))
  }, [appId])

  useEffect(() => {
    if (!sessionId) {
      setSession(null)
      return
    }
    void loadSession(sessionId, setSession, setError)
  }, [sessionId])

  useEffect(() => {
    return window.traceability.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return
      if (event.type === 'agent_start' || event.type === 'run_started') setRunning(true)
      if (event.type === 'agent_end' || event.type === 'run_failed') {
        setRunning(false)
        void loadSession(event.sessionId, setSession, setError)
        if (appId) void window.traceability.sessions.list(appId).then(setSessions)
      }
    })
  }, [sessionId, appId])

  useEffect(() => {
    return window.traceability.agent.onMonitorDataRequest((request) => {
      void fetchMonitorData(request, apiFetch).then(async (result) => {
        await window.traceability.agent.resolveMonitorData({ requestId: request.requestId, result })
      }).catch(async (cause) => {
        await window.traceability.agent.rejectMonitorData({
          requestId: request.requestId,
          error: { message: toError(cause) },
        })
      })
    })
  }, [])

  const createSession = async () => {
    if (!appId) return
    try {
      const created = await window.traceability.sessions.create(appId)
      setSessions((items) => [created, ...items])
      setSessionId(created.id)
    } catch (cause) {
      setError(toError(cause))
    }
  }

  const send = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!appId || !sessionId || !text.trim() || running) return
    const model = models.find((item) => modelKey(item) === selectedModel)
    if (!model) {
      setError('No compatible model is configured in ~/.pi/agent/models.json')
      return
    }
    try {
      setError('')
      setRunning(true)
      await window.traceability.agent.prompt({
        sessionId,
        text,
        model: { providerId: model.providerId, modelId: model.modelId },
        context: context?.appId === appId ? context : { appId, source: 'general' },
      })
      setText('')
      void loadSession(sessionId, setSession, setError)
    } catch (cause) {
      setRunning(false)
      setError(toError(cause))
    }
  }

  return (
    <aside className="agent-panel" aria-label="Traceability Agent">
      <header className="agent-panel-header">
        <div>
          <strong>Traceability Agent</strong>
          <small>Read-only monitoring analysis</small>
        </div>
        <button type="button" className="agent-new" onClick={() => void createSession()} disabled={!appId}>+</button>
      </header>
      <div className="agent-controls">
        <select value={appId} onChange={(event) => {
          setAppId(event.target.value)
          setContext(event.target.value ? { appId: event.target.value, source: 'general' } : null)
        }} aria-label="Agent application">
          <option value="">Select an application</option>
          {applications.map((application) => <option key={application.id} value={application.id}>{application.name}</option>)}
        </select>
        <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} aria-label="Agent session" disabled={!appId}>
          <option value="">{sessions.length ? 'Select a conversation' : 'Create a conversation'}</option>
          {sessions.map((item) => <option key={item.id} value={item.id}>{item.title || 'New conversation'}</option>)}
        </select>
      </div>
      <section className="agent-conversation">
        {!appId && <div className="agent-empty">Select an application to start a scoped monitoring conversation.</div>}
        {appId && !sessionId && <div className="agent-empty">Create a conversation to analyze this application.</div>}
        {session?.entries.filter((entry) => entry.type === 'message').map((entry) => <Message key={entry.id} entry={entry} />)}
        {running && <div className="agent-running">Analyzing monitoring data…</div>}
      </section>
      <form className="agent-composer" onSubmit={send}>
        {context && context.source !== 'general' && <div className="agent-context-chip">{formatContext(context)}</div>}
        <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} aria-label="Agent model">
          <option value="">Select model</option>
          {models.map((model) => <option key={modelKey(model)} value={modelKey(model)}>{model.providerName} / {model.modelName}</option>)}
        </select>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask about the current application…" disabled={!sessionId || running || models.length === 0} rows={3} />
        {error && <div className="agent-error">{error}</div>}
        <div className="agent-composer-actions">
          {running ? <button type="button" onClick={() => void window.traceability.agent.abort(sessionId)}>Stop</button> : <button type="submit" className="agent-send" disabled={!sessionId || !text.trim() || models.length === 0}>Send</button>}
        </div>
      </form>
    </aside>
  )
}

function Message({ entry }: { entry: AgentEntry }) {
  const role = entry.data.role
  const content = entry.data.content
  const blocks = Array.isArray(content) ? content as Array<Record<string, unknown>> : []
  const text = typeof content === 'string'
    ? content
    : blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => String(block.text)).join('\n')
  const tools = blocks.filter((block) => block.type === 'toolCall')

  return (
    <article className={`agent-message ${role === 'user' ? 'agent-user-message' : 'agent-assistant-message'}`}>
      <div className="agent-message-label">{role === 'user' ? 'You' : role === 'toolResult' ? 'Tool result' : 'Agent'}</div>
      {text && <Streamdown>{text}</Streamdown>}
      {tools.map((tool, index) => (
        <details className="agent-tool-call" key={String(tool.id ?? index)}>
          <summary>{String(tool.name ?? 'monitor tool')}</summary>
          <pre>{JSON.stringify(tool.arguments ?? {}, null, 2)}</pre>
        </details>
      ))}
      {!text && tools.length === 0 && <pre>{JSON.stringify(entry.data, null, 2)}</pre>}
    </article>
  )
}

async function loadSession(
  sessionId: string,
  setSession: (session: AgentSessionDetail | null) => void,
  setError: (message: string) => void,
): Promise<void> {
  try {
    setSession(await window.traceability.sessions.get(sessionId))
  } catch (cause) {
    setError(toError(cause))
  }
}

function modelKey(model: AvailableModel): string {
  return `${model.providerId}/${model.modelId}`
}

function toError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function formatContext(context: AgentPromptInput['context']): string {
  if (context.issueId) return `Issue: ${context.issueId}`
  if (context.metricName) return `Metric: ${context.metricName}`
  if (context.source === 'performance') return `Performance: last ${context.hours ?? 24}h`
  return 'Application overview'
}
