import { describe, expect, it } from 'vitest'
import { RendererDataBroker } from './renderer-data-broker.js'

describe('RendererDataBroker', () => {
  it('rejects monitoring data that does not belong to the session application', async () => {
    let requestId = ''
    const broker = new RendererDataBroker(() => ({
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (_channel: string, request: { requestId: string }) => {
          requestId = request.requestId
        },
      },
    }) as any)

    const result = broker.request('session-1', 'getIssue', 'app-1', { issueId: 'issue-1' })
    broker.resolve(requestId, { id: 'issue-1', appId: 'another-app', title: 'Wrong scope' })

    await expect(result).rejects.toThrow('outside this session application')
  })
})
