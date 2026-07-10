import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { initMain, type MainMonitor } from '../../../packages/electron/dist/main.js'

const appId = '4d97043d-bd3e-4e7f-9ca0-18e431e47d04'
const token = process.env.TRACEABILITY_DEMO_TOKEN ?? 'dev-token'
const server = process.env.TRACEABILITY_SERVER ?? 'http://localhost:3000'

const monitor = initMain({
  dsn: server,
  appId,
  token,
  release: 'electron-demo@1.0.0',
  environment: 'demo',
  app: { name: 'traceability-electron-demo', version: '1.0.0' },
  system: { sampleInterval: 30_000, memoryThreshold: 0.85, cpuThreshold: 0.9 },
}) as MainMonitor

monitor.handle('demo:ipc-echo', (_event, payload) => ({ ok: true, received: payload, at: new Date().toISOString() }))
monitor.handle('demo:ipc-failure', () => {
  throw new Error('demo: Electron IPC handler failed')
})
monitor.handle('demo:main-uncaught-exception', () => {
  setTimeout(() => { throw new Error('demo: Electron main-process uncaught exception') }, 0)
  return { scheduled: true }
})
monitor.handle('demo:renderer-process-gone', () => {
  monitor.report('electron-render-process-gone', { simulated: true, reason: 'demo-button' })
  return { reported: true }
})

async function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 820,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Electron loads the preload in a sandboxed renderer via a CommonJS
      // bundler, which cannot evaluate ESM `export`. Use the package's CJS
      // preload build (dist/preload.cjs) instead of an ESM .js preload.
      preload: fileURLToPath(new URL('../../../packages/electron/dist/preload.cjs', import.meta.url)),
    },
  })
  await window.loadFile(fileURLToPath(new URL('./renderer/index.html', import.meta.url)))
}

app.whenReady().then(async () => {
  await createWindow()
  if (process.env.ELECTRON_DEMO_CRASH_ON_START === '1') {
    setTimeout(() => { throw new Error('demo: Electron main-process startup crash') }, 300)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
