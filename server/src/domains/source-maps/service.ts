import type { Database } from 'better-sqlite3'
import type { SourceLocation, SourceMapUpload } from '@traceability/protocol'
import { createSourceMapsRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'

interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
}

export function createSourceMapsService(db: Database) {
  const repo = createSourceMapsRepo(db)
  return {
    upsert(appId: string, input: SourceMapUpload): void {
      if (!input.file || !input.sourceMap || typeof input.sourceMap !== 'object') {
        throw new AppError('file and sourceMap are required', 400, 400)
      }
      repo.upsert(appId, input)
    },
    resolveFrames(appId: string, release: string | undefined, frames: StackFrame[]): SourceLocation[] {
      return repo.resolveFrames(appId, release, frames)
    },
  }
}
