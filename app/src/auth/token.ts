const KEY = 'traceability.token'
const SERVER_KEY = 'traceability.server'

export function getToken(): string | null {
  return localStorage.getItem(KEY)
}
export function setToken(token: string): void {
  localStorage.setItem(KEY, token)
}
export function getServer(): string {
  return localStorage.getItem(SERVER_KEY) ?? ''
}
export function setServer(server: string): void {
  localStorage.setItem(SERVER_KEY, server)
}
export function clearAuth(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(SERVER_KEY)
}
