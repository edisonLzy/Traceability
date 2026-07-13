import 'express'

declare global {
  namespace Express {
    interface Response {
      success: <T>(data: T, status?: number) => void
    }
  }
}

export {}
