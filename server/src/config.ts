export interface ServerConfig {
  port: number
  apiToken: string
  dbPath: string
}

export function getConfig(): ServerConfig {
  const apiToken = process.env.TRACEABILITY_API_TOKEN
  if (!apiToken) {
    throw new Error('TRACEABILITY_API_TOKEN env var is required')
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    apiToken,
    dbPath: process.env.TRACEABILITY_DB_PATH ?? 'server/data/traceability.db',
  }
}
