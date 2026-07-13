import { Panel } from '@renderer/components/ui/card'
import { codeClass, pageClass, pageHeaderClass, pageTitleClass, pageSubtitleClass } from '@renderer/components/ui/styles'

export function SettingsPage() {
  return (
    <div className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1 className={pageTitleClass}>SDK setup</h1>
          <p className={pageSubtitleClass}>Connect a web, React, Electron or Module Federation application.</p>
        </div>
      </div>
      <Panel title="Install @traceability/core">
        <pre className={codeClass}>
{`pnpm add @traceability/core @sentry/browser

import { init } from '@traceability/core'

init({
  dsn: 'http://localhost:3000',
  appId: '<appId from the application detail page>',
  token: '<api token>',
  environment: 'production',
  replay: { enabled: true, maxDurationMs: 60000 },
  whiteScreen: { stableWindowMs: 500 }
})`}
        </pre>
      </Panel>
    </div>
  )
}
