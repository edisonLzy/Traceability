import { contextBridge, ipcRenderer } from 'electron'

export const preloadBridge = {
  /** Forward a breadcrumb from the renderer to the main process log. */
  addBreadcrumb: (breadcrumb: unknown) => ipcRenderer.send('traceability:breadcrumb', breadcrumb),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('traceability', preloadBridge)
} else {
  ;(globalThis as any).traceability = preloadBridge
}
