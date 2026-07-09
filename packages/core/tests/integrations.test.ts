import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsDiagnosticIntegration } from '../src/integrations/corsDiagnostic.js'

// captureMessage is imported from ../index.js inside the integration; mock it
vi.mock('../src/index.js', () => ({
  captureMessage: vi.fn(),
}))

import { captureMessage } from '../src/index.js'

describe('corsDiagnosticIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.head.innerHTML = ''
  })

  it('warns + reports when a cross-origin script lacks crossorigin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const script = document.createElement('script')
    script.src = 'https://other-origin.example/bundle.js'
    document.head.appendChild(script)

    const integration = corsDiagnosticIntegration()
    integration.setupOnce()

    expect(warn).toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledWith('cors-config-warning', expect.objectContaining({
      level: 'warning',
    }))
  })

  it('is silent for same-origin scripts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const script = document.createElement('script')
    script.src = '/local.js'
    document.head.appendChild(script)

    corsDiagnosticIntegration().setupOnce()

    expect(warn).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
