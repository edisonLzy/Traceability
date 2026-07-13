import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const electronVitePackage = require.resolve('electron-vite/package.json')
const electronViteCli = join(dirname(electronVitePackage), 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [electronViteCli, ...process.argv.slice(2)], {
  env: { ...process.env, ELECTRON_EXEC_PATH: electronPath },
  stdio: 'inherit',
})

let receivedSignal = null

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    receivedSignal = signal
    if (!child.killed) child.kill(signal)
  })
}

child.once('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.once('close', (code) => {
  process.exit(code ?? (receivedSignal ? 130 : 1))
})
