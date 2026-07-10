import { captureException, init, report } from '@traceability/core'

interface MonitorConfig {
  dsn: string
  appId: string
  token: string
  release?: string
  environment?: string
}

declare global {
  interface Window {
    traceability?: {
      report(event: unknown): void
      invoke(channel: string, ...args: unknown[]): Promise<unknown>
      getConfig(): Promise<MonitorConfig>
      getEnvironment(): Promise<unknown>
      sampleResources(): Promise<unknown>
    }
  }
}

const bridge = window.traceability
const output = document.querySelector<HTMLPreElement>('#output')!
const show = (value: unknown) => { output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2) }

async function start() {
  if (!bridge) {
    show('The Traceability preload bridge is unavailable.')
    return
  }
  const config = await bridge.getConfig()
  const appId = localStorage.getItem('electron-demo.appId') ?? config.appId
  const token = localStorage.getItem('electron-demo.token') ?? config.token
  init({
    dsn: config.dsn,
    appId,
    token,
    release: config.release ?? 'electron-demo@1.0.0',
    environment: config.environment ?? 'demo',
    replay: { enabled: true, maxDurationMs: 60_000 },
  })

  const on = (selector: string, action: () => void | Promise<void>) => {
    document.querySelector(selector)!.addEventListener('click', () => void action())
  }
  on('#renderer-error', () => captureException(new Error('demo: Electron renderer exception')))
  on('#renderer-promise', () => { void Promise.reject(new Error('demo: Electron renderer unhandled rejection')) })
  on('#ipc-ok', async () => show(await bridge.invoke('demo:ipc-echo', { source: 'renderer' })))
  on('#ipc-error', async () => {
    try {
      await bridge.invoke('demo:ipc-failure')
    } catch (error) {
      captureException(error)
      show(`IPC failure captured: ${String(error)}`)
    }
  })
  on('#resources', async () => show(await bridge.sampleResources()))
  on('#environment', async () => show(await bridge.getEnvironment()))
  on('#main-crash', async () => show(await bridge.invoke('demo:main-uncaught-exception')))
  on('#renderer-gone', async () => show(await bridge.invoke('demo:renderer-process-gone')))

  bridge.report({ type: 'electron-renderer-ready', payload: { at: new Date().toISOString() } })
  report({ type: 'electron-renderer-ready', payload: { at: Date.now() }, tags: { platform: 'electron-renderer' } })
}

void start().catch((error) => {
  show(`Could not initialize monitoring: ${String(error)}`)
})
