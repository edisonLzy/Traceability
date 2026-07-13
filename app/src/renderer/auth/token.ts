import type { ConnectionCredentials } from '../../shared/ipc'

let credentials: ConnectionCredentials | null = null
const listeners = new Set<(value: ConnectionCredentials | null) => void>()

export async function bootstrapConnection(): Promise<ConnectionCredentials | null> {
  credentials = await window.traceability.connection.bootstrap()
  emit()
  return credentials
}

export function getToken(): string | null {
  return credentials?.token ?? null
}

export function getServer(): string {
  return credentials?.serverUrl ?? ''
}

export async function saveConnection(input: ConnectionCredentials): Promise<void> {
  await window.traceability.connection.save(input)
  credentials = input
  emit()
}

export async function clearAuth(): Promise<void> {
  await window.traceability.connection.clear()
  credentials = null
  emit()
}

export function onConnectionChange(listener: (value: ConnectionCredentials | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) listener(credentials)
}
