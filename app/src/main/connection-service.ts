import { safeStorage } from 'electron'
import type { ConnectionCredentials, ConnectionStatus } from '../shared/ipc.js'
import { LocalDatabase } from './db/database.js'

const SERVER_URL_KEY = 'connection.serverUrl'
const TOKEN_KEY = 'connection.tokenCiphertext'

export class ConnectionService {
  private transientToken: string | null = null

  constructor(private db: LocalDatabase) {}

  getStatus(): ConnectionStatus {
    const serverUrl = this.db.getSetting(SERVER_URL_KEY)
    return {
      configured: Boolean(serverUrl && (this.transientToken || this.db.getSetting(TOKEN_KEY))),
      serverUrl,
      tokenPersistent: safeStorage.isEncryptionAvailable() && Boolean(this.db.getSetting(TOKEN_KEY)),
    }
  }

  getCredentials(): ConnectionCredentials | null {
    const serverUrl = this.db.getSetting(SERVER_URL_KEY)
    if (!serverUrl) return null
    if (this.transientToken) return { serverUrl, token: this.transientToken }

    const encryptedToken = this.db.getSetting(TOKEN_KEY)
    if (!encryptedToken || !safeStorage.isEncryptionAvailable()) return null

    try {
      return {
        serverUrl,
        token: safeStorage.decryptString(Buffer.from(encryptedToken, 'base64')),
      }
    } catch {
      return null
    }
  }

  save(input: ConnectionCredentials): ConnectionStatus {
    const serverUrl = normalizeServerUrl(input.serverUrl)
    const token = input.token.trim()
    if (!token) throw new Error('API token is required')

    this.db.setSetting(SERVER_URL_KEY, serverUrl)
    this.transientToken = token

    if (safeStorage.isEncryptionAvailable()) {
      this.db.setSetting(TOKEN_KEY, safeStorage.encryptString(token).toString('base64'))
    } else {
      this.db.deleteSetting(TOKEN_KEY)
    }

    return this.getStatus()
  }

  clear(): void {
    this.transientToken = null
    this.db.deleteSetting(SERVER_URL_KEY)
    this.db.deleteSetting(TOKEN_KEY)
  }
}

function normalizeServerUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Server URL must be a valid HTTP(S) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Server URL must use HTTP or HTTPS')
  }
  return url.toString().replace(/\/$/, '')
}
