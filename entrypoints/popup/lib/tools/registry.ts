import type { ToolRegistry } from '../ai/types'
import type { MustAllowFn, TaskToolClient } from './types'

type ProviderContext = {
  mustAllow: MustAllowFn
  taskClient?: TaskToolClient
}

type ToolProvider = (ctx: ProviderContext) => ToolRegistry

export class ToolRegistryBuilder {
  private providers: ToolProvider[] = []

  register(provider: ToolProvider) {
    this.providers.push(provider)
    return this
  }

  build(ctx: ProviderContext): ToolRegistry {
    return this.providers.reduce<ToolRegistry>((acc, provider) => {
      return { ...acc, ...provider(ctx) }
    }, {})
  }
}

export const createToolRegistryBuilder = () => new ToolRegistryBuilder()
