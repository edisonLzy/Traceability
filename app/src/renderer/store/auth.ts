import { create } from 'zustand'
import type { ConnectionCredentials } from '@shared/ipc'

interface AuthState {
  credentials: ConnectionCredentials | null
  bootstrap: () => Promise<ConnectionCredentials | null>
  save: (input: ConnectionCredentials) => Promise<void>
  clear: () => Promise<void>
}

/**
 * Connection / auth state for the renderer.
 *
 * The store is the single source of truth for the active server URL + token.
 * React components subscribe via {@link useAuth}; non-React modules
 * (`lib/request.ts`, `lib/ws.ts`) read synchronously through the `getToken` /
 * `getServer` helpers, which call `useAuthStore.getState()`.
 */
export const useAuthStore = create<AuthState>((set) => ({
  credentials: null,
  bootstrap: async () => {
    const next = await window.traceability.connection.bootstrap()
    set({ credentials: next })
    return next
  },
  save: async (input) => {
    await window.traceability.connection.save(input)
    set({ credentials: input })
  },
  clear: async () => {
    await window.traceability.connection.clear()
    set({ credentials: null })
  },
}))

/** React subscription helper. */
export function useAuth(): ConnectionCredentials | null {
  return useAuthStore((state) => state.credentials)
}

/** Synchronous token read for non-React modules (HTTP transport). */
export function getToken(): string | null {
  return useAuthStore.getState().credentials?.token ?? null
}

/** Synchronous server URL read for non-React modules (HTTP / WS transport). */
export function getServer(): string {
  return useAuthStore.getState().credentials?.serverUrl ?? ''
}

/** Load persisted credentials from the main process into the store. */
export function bootstrapConnection(): Promise<ConnectionCredentials | null> {
  return useAuthStore.getState().bootstrap()
}

/** Persist a connection; kept as a free function so call sites read as verbs. */
export function saveConnection(input: ConnectionCredentials): Promise<void> {
  return useAuthStore.getState().save(input)
}

/** Clear the active connection; kept as a free function so call sites read as verbs. */
export function clearAuth(): Promise<void> {
  return useAuthStore.getState().clear()
}
