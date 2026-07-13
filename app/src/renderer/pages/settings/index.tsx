import { Panel } from "@renderer/components/ui/card";

export function SettingsPage() {
  return (
    <div className="mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7">
      <div className="mb-7 flex items-start justify-between gap-3.5">
        <div>
          <h1 className="m-0 text-2xl leading-tight font-semibold tracking-[-0.7px] tablet:text-[28px]">
            SDK setup
          </h1>
          <p className="mt-1.5 text-subtle">
            Connect a web, React, Electron or Module Federation application.
          </p>
        </div>
      </div>
      <Panel title="Install @traceability/core">
        <pre className="m-0 overflow-auto bg-[#090a0b] px-5 py-4.5 font-mono text-xs leading-7 text-[#c7cbd3]">
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
  );
}
