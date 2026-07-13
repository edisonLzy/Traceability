import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-center"
      offset="28px"
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-hairline-strong bg-surface-3 px-3.5 py-2.5 text-muted text-sm',
        },
      }}
    />
  )
}
