import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentPromptInput,
  AgentRuntimeEvent,
  AgentSessionDetail,
  AgentSessionSummary,
  AvailableModel,
  ConnectionCredentials,
  ModelRef,
  MonitorDataRequest,
} from '../shared/ipc.js'

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  connection: {
    bootstrap: () => ipcRenderer.invoke('connection:bootstrap') as Promise<ConnectionCredentials | null>,
    getStatus: () => ipcRenderer.invoke('connection:status'),
    save: (input: ConnectionCredentials) => ipcRenderer.invoke('connection:save', input),
    clear: () => ipcRenderer.invoke('connection:clear'),
  },
  sessions: {
    list: (appId: string) => ipcRenderer.invoke('sessions:list', appId) as Promise<AgentSessionSummary[]>,
    create: (appId: string) => ipcRenderer.invoke('sessions:create', appId) as Promise<AgentSessionSummary>,
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId) as Promise<AgentSessionDetail | null>,
    rename: (input: { sessionId: string; title: string }) => ipcRenderer.invoke('sessions:rename', input) as Promise<void>,
    delete: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId) as Promise<void>,
    setModel: (input: { sessionId: string; model: ModelRef }) => ipcRenderer.invoke('sessions:set-model', input) as Promise<boolean>,
  },
  agent: {
    prompt: (input: AgentPromptInput) => ipcRenderer.invoke('agent:prompt', input) as Promise<void>,
    abort: (sessionId: string) => ipcRenderer.invoke('agent:abort', sessionId) as Promise<void>,
    listModels: () => ipcRenderer.invoke('agent:list-models') as Promise<AvailableModel[]>,
    reloadModels: () => ipcRenderer.invoke('agent:reload-models') as Promise<AvailableModel[]>,
    resolveMonitorData: (input: { requestId: string; result: unknown }) => ipcRenderer.invoke('agent:resolve-monitor-data', input) as Promise<void>,
    rejectMonitorData: (input: { requestId: string; error: { message: string; code?: string } }) => ipcRenderer.invoke('agent:reject-monitor-data', input) as Promise<void>,
    onEvent: (listener: (event: AgentRuntimeEvent) => void) => listen('agent:event', listener),
    onMonitorDataRequest: (listener: (request: MonitorDataRequest) => void) => listen('agent:monitor-data-request', listener),
  },
}

contextBridge.exposeInMainWorld('traceability', api)
