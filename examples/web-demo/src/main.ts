import { captureException, init, report } from '@traceability/core'

// Replace these with a real appId (create an app in the Inbox at http://localhost:5173)
// and the server's API token (TRACEABILITY_API_TOKEN).
const APP_ID = localStorage.getItem('demo.appId') ?? 'REPLACE_WITH_APP_ID'
const TOKEN = localStorage.getItem('demo.token') ?? 'dev-token'

init({
  dsn: 'http://localhost:3000',
  appId: 'e4eac53d-846d-4c75-a6a0-402c15c69954',
  token: TOKEN,
  environment: 'demo',
  replay: { enabled: true, maxDurationMs: 60_000 },
  whiteScreen: { stableWindowMs: 500, minContentNodes: 3 },
})

document.querySelector('#err')!.addEventListener('click', () => {
  captureException(new TypeError('demo: Cannot read properties of undefined'))
})
document.querySelector('#promise')!.addEventListener('click', () => {
  void Promise.reject(new Error('demo: unhandled rejection'))
})
document.querySelector('#white')!.addEventListener('click', () => {
  document.getElementById('root')!.innerHTML = ''
  // The whiteScreen integration observes load/navigation, not clicks.
  // Report directly so the demo exercises the white-screen event path.
  report({ type: 'white-screen', payload: { reason: 'demo-empty-root' }, tags: { type: 'white-screen' } })
})
document.querySelector('#custom')!.addEventListener('click', () => {
  report({ type: 'demo-custom-event', payload: { at: Date.now() }, tags: { feature: 'demo' } })
})
