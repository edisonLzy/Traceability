import { init, report, whiteScreenIntegration } from '@traceability/core'

// Replace these with a real appId (create an app in the Inbox at http://localhost:5173)
// and the server's API token (TRACEABILITY_API_TOKEN).
const APP_ID = localStorage.getItem('demo.appId') ?? 'REPLACE_WITH_APP_ID'
const TOKEN = localStorage.getItem('demo.token') ?? 'dev-token'

init({
  dsn: 'http://localhost:3000',
  appId: APP_ID,
  token: TOKEN,
  environment: 'demo',
  whiteScreen: { stableWindowMs: 500, minContentNodes: 3 },
})

// opt-in white screen integration
// (init already accepts whiteScreen options; this explicit integration is for demo clarity)
void whiteScreenIntegration

document.querySelector('#err')!.addEventListener('click', () => {
  throw new TypeError('demo: Cannot read properties of undefined')
})
document.querySelector('#promise')!.addEventListener('click', () => {
  void Promise.reject(new Error('demo: unhandled rejection'))
})
document.querySelector('#white')!.addEventListener('click', () => {
  document.getElementById('root')!.innerHTML = ''
})
document.querySelector('#custom')!.addEventListener('click', () => {
  report({ type: 'demo-custom-event', payload: { at: Date.now() }, tags: { feature: 'demo' } })
})
