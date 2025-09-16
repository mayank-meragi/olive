import { generateWithGemini, type ToolEvent } from '@/lib/genai'
import { buildBrowserTools } from '@/lib/tools'

export type RunChatCallbacks = {
  onToolCall?: (ev: { name: string; args: any }) => void
  onToolResult?: (ev: { name: string; args: any; result?: any; error?: string }) => void
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
  callbacks,
}: {
  prompt: string
  model: string
  thinkingEnabled: boolean
  autoRunTools: boolean
  history: Array<{ role: 'user' | 'model'; text?: string; toolEvents?: ToolEvent[] }>
  callbacks: RunChatCallbacks
}): Promise<{ events: ToolEvent[] }> {
  const tools = buildBrowserTools({ autoRun: autoRunTools })
  const { events } = await generateWithGemini(prompt, {
    model,
    thinkingEnabled,
    debug: true,
    tools,
    history,
    onToolCall: callbacks.onToolCall,
    onToolResult: callbacks.onToolResult,
    onUpdate: callbacks.onUpdate,
    onThinkingUpdate: callbacks.onThinkingUpdate,
    shouldContinue: callbacks.shouldContinue,
  })
  return { events }
}

