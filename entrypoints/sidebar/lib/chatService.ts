import { generateWithGemini, type ToolEvent } from '@/lib/genai'
import { buildBrowserTools, type TaskToolClient } from '@/lib/tools'

export type RunChatCallbacks = {
  onToolCall?: (ev: { name: string; displayName?: string; args: any }) => void
  onToolResult?: (ev: {
    name: string
    displayName?: string
    args: any
    result?: any
    error?: string
  }) => void
  onUpdate?: (full: string) => void
  onThinkingUpdate?: (full: string) => void
  shouldContinue?: () => boolean
}

export async function runChat({
  prompt,
  model,
  thinkingEnabled,
  autoRunTools,
  history,
  taskClient,
  taskContext,
  callbacks,
}: {
  prompt: string
  model: string
  thinkingEnabled: boolean
  autoRunTools: boolean
  history: Array<{ role: 'user' | 'model'; text?: string; toolEvents?: ToolEvent[] }>
  taskClient?: TaskToolClient
  taskContext?: string | (() => string | Promise<string>)
  callbacks: RunChatCallbacks
}): Promise<{ events: ToolEvent[] }> {
  console.log('[chatService] runChat', {
    prompt,
    model,
    thinkingEnabled,
    autoRunTools,
    historyLength: history.length,
  })
  const tools = buildBrowserTools({ autoRun: autoRunTools, taskClient })
  if (taskContext) {
    try {
      const preview =
        typeof taskContext === 'function' ? taskContext() : Promise.resolve(taskContext)
      Promise.resolve(preview)
        .then((value) => {
          if (typeof value === 'string') {
            console.log('[chatService] taskContext preview', value)
          }
        })
        .catch((err) => {
          console.warn('[chatService] taskContext preview error', err)
        })
    } catch (err) {
      console.warn('[chatService] taskContext sync error', err)
    }
  } else {
    console.log('[chatService] taskContext missing')
  }
  const { events } = await generateWithGemini(prompt, {
    model,
    thinkingEnabled,
    debug: true,
    tools,
    history,
    taskContext,
    onToolCall: callbacks.onToolCall,
    onToolResult: callbacks.onToolResult,
    onUpdate: callbacks.onUpdate,
    onThinkingUpdate: callbacks.onThinkingUpdate,
    shouldContinue: callbacks.shouldContinue,
  })
  console.log('[chatService] runChat complete', { events })
  return { events }
}
