import { contextBridge, ipcRenderer } from 'electron'

export const preloadBridge = {
  /** Forward a breadcrumb from the renderer to the main process log. */
  addBreadcrumb: (breadcrumb: unknown) => ipcRenderer.send('traceability:breadcrumb', breadcrumb),
  /** Report a renderer-originated application event through the main process. */
  report: (event: unknown) => ipcRenderer.send('traceability:report', event),
  /** Invoke a monitored IPC handler. Exceptions are captured in the main process. */
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  getConfig: () => ipcRenderer.invoke('traceability:config'),
  getEnvironment: () => ipcRenderer.invoke('traceability:environment'),
  sampleResources: () => ipcRenderer.invoke('traceability:sample-resources'),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('traceability', preloadBridge)
} else {
  ;(globalThis as any).traceability = preloadBridge
}
