import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { AvailableModel, ModelRef } from '../../shared/ipc.js'

interface ModelConfig {
  id: string
  name?: string
  reasoning?: boolean
  input?: Array<'text' | 'image'>
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow?: number
  maxTokens?: number
}

interface ProviderConfig {
  api: string
  apiKey?: string
  baseUrl: string
  headers?: Record<string, string>
  models?: ModelConfig[]
}

interface ModelsConfigFile {
  providers?: Record<string, ProviderConfig>
}

export class ModelRegistry {
  private readonly configPath: string
  private models = new Map<string, Model<any>>()
  private providers = new Map<string, ProviderConfig>()

  constructor(configPath = resolve(homedir(), '.pi', 'agent', 'models.json')) {
    this.configPath = configPath
  }

  async reload(): Promise<AvailableModel[]> {
    const config = await this.readConfig()
    this.models.clear()
    this.providers.clear()

    for (const [providerId, provider] of Object.entries(config.providers ?? {})) {
      this.providers.set(providerId, provider)
      for (const modelConfig of provider.models ?? []) {
        const model: Model<any> = {
          id: modelConfig.id,
          api: provider.api as Api,
          baseUrl: provider.baseUrl,
          provider: providerId,
          headers: provider.headers,
          name: modelConfig.name ?? modelConfig.id,
          reasoning: modelConfig.reasoning ?? false,
          input: modelConfig.input ?? ['text'],
          cost: modelConfig.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: modelConfig.contextWindow ?? 128_000,
          maxTokens: modelConfig.maxTokens ?? 16_384,
        }
        this.models.set(keyOf({ providerId, modelId: modelConfig.id }), model)
      }
    }
    return this.list()
  }

  list(): AvailableModel[] {
    return [...this.models.values()].map((model) => ({
      providerId: model.provider,
      providerName: model.provider,
      modelId: model.id,
      modelName: model.name ?? model.id,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    }))
  }

  resolve(model: ModelRef): Model<any> | undefined {
    return this.models.get(keyOf(model))
  }

  getApiKey(providerId: string): string | undefined {
    return this.providers.get(providerId)?.apiKey
  }

  getConfigPath(): string {
    return this.configPath
  }

  private async readConfig(): Promise<ModelsConfigFile> {
    try {
      const content = await readFile(this.configPath, 'utf8')
      const parsed = JSON.parse(content) as ModelsConfigFile
      return { providers: parsed.providers ?? {} }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { providers: {} }
      throw error
    }
  }
}

function keyOf(model: ModelRef): string {
  return `${model.providerId}/${model.modelId}`
}
