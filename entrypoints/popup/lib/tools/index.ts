import type { ToolRegistry } from '../genai'
import { createPageTools } from './pageTools'
import { createTaskTools } from './taskTools'
import { createTabTools } from './tabTools'
import { createScreenshotTools } from './screenshotTools'
import type { TaskToolClient } from './types'
import { createMustAllowGuard } from './utils'
import { createToolRegistryBuilder } from './registry'

export type {
  TaskToolClient,
  TaskCreationInput,
  TaskBatchCreationInput,
  SubtaskCreationInput,
  TaskDeletionInput,
  TaskCompletionInput,
  TaskListResult,
} from './types'

export { createToolRegistryBuilder } from './registry'

export function buildBrowserTools(opts: {
  autoRun: boolean
  taskClient?: TaskToolClient
}): ToolRegistry {
  const mustAllow = createMustAllowGuard(opts.autoRun)
  const builder = createToolRegistryBuilder()
    .register(({ mustAllow }) => createTabTools({ mustAllow }))
    .register(({ mustAllow }) => createPageTools({ mustAllow }))
    .register(({ mustAllow }) => createScreenshotTools({ mustAllow }))

  if (opts.taskClient) {
    builder.register(({ mustAllow }) =>
      createTaskTools({ mustAllow, taskClient: opts.taskClient }),
    )
  }

  return builder.build({ mustAllow, taskClient: opts.taskClient })
}
