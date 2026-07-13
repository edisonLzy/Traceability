import React from 'react'
import { Panel } from '@renderer/components/ui/primitives'

export function SettingsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">SDK setup</h1>
          <p className="page-subtitle">Connect a web, React, Electron or Module Federation application.</p>
        </div>
      </div>
      <Panel title="Install @traceability/core">
        <pre className="code">
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
