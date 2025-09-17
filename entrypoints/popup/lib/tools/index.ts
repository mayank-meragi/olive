import type { ToolRegistry } from '../genai'
import { createTabTools } from './tabTools'
import { createPageTools } from './pageTools'
import { createTaskTools } from './taskTools'
import type { TaskToolClient } from './types'

export type {
  TaskToolClient,
  TaskCreationInput,
  TaskBatchCreationInput,
  SubtaskCreationInput,
  TaskDeletionInput,
  TaskCompletionInput,
  TaskListResult,
} from './types'

export function buildBrowserTools(opts: {
  autoRun: boolean
  taskClient?: TaskToolClient
}): ToolRegistry {
  const mustAllow = () => {
    if (!opts.autoRun) throw new Error('Tool execution disabled by user')
  }

  const baseTools: ToolRegistry = {
    ...createTabTools({ mustAllow }),
    ...createPageTools({ mustAllow }),
  }

  const taskTools = createTaskTools({ mustAllow, taskClient: opts.taskClient })

  return {
    ...baseTools,
    ...taskTools,
  }
}
