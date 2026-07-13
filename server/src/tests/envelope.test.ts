import { describe, it, expect } from 'vitest'
import { parseEnvelope, filterSupportedItems, extractIssueFingerprint, payloadToIssueFields } from '../domains/ingest/envelope.js'

const sampleEnvelope = [
  JSON.stringify({ sent_at: '2026-01-01T00:00:00Z', dsn: 'https://x@ingest/1' }),
  JSON.stringify({ type: 'event' }),
  JSON.stringify({
    event_id: 'abc',
    type: 'error',
    message: 'boom',
    exception: { values: [{ type: 'TypeError', value: 'boom', stacktrace: { frames: [{ filename: 'a.js', lineno: 10 }] } }] },
  }),
].join('\n')

describe('parseEnvelope', () => {
  it('parses header + items', () => {
    const env = parseEnvelope(sampleEnvelope)
    expect(env.header.dsn).toBe('https://x@ingest/1')
    expect(env.items).toHaveLength(1)
    expect(env.items[0]![0].type).toBe('event')
  })
})

describe('filterSupportedItems', () => {
  it('keeps event/transaction, drops others', () => {
    const env = parseEnvelope(sampleEnvelope)
    const supported = filterSupportedItems(env)
    expect(supported).toHaveLength(1)
    expect(supported[0]!.payload.event_id).toBe('abc')
  })
})

describe('extractIssueFingerprint', () => {
  it('uses appId + exception type/value', () => {
    const env = parseEnvelope(sampleEnvelope)
    const { payload } = filterSupportedItems(env)[0]!
    expect(extractIssueFingerprint(payload, 'app1')).toBe('app1::error::TypeError::boom')
  })
})

describe('payloadToIssueFields', () => {
  it('derives error title + metadata', () => {
    const env = parseEnvelope(sampleEnvelope)
    const { payload } = filterSupportedItems(env)[0]!
    const fields = payloadToIssueFields(payload)
    expect(fields.title).toBe('TypeError: boom')
    expect(fields.type).toBe('error')
    expect(fields.metadata.message).toBe('boom')
  })
})
