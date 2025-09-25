import { generateWithGemini, type ToolEvent } from '@/lib/genai'
import { createAllMcpClientsFromStorage } from '@/lib/mcp/client'
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
  callbacks,
}: {
  prompt: string
  model: string
  thinkingEnabled: boolean
  autoRunTools: boolean
  history: Array<{ role: 'user' | 'model'; text?: string; toolEvents?: ToolEvent[] }>
  taskClient?: TaskToolClient
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

  // Try to create an MCP client based on saved settings
  const mcpClients = await createAllMcpClientsFromStorage().catch(() => [])
  const { events } = await generateWithGemini(prompt, {
    model,
    thinkingEnabled,
    debug: true,
    tools,
    // If MCP client is available, merge its tools into the registry
    mcpClient: mcpClients.length ? mcpClients : undefined,
    history,
    onToolCall: callbacks.onToolCall,
    onToolResult: callbacks.onToolResult,
    onUpdate: callbacks.onUpdate,
    onThinkingUpdate: callbacks.onThinkingUpdate,
    shouldContinue: callbacks.shouldContinue,
  })
  // Close MCP client after run
  for (const c of mcpClients) {
    try { await c.close() } catch { /* ignore */ }
  }
  console.log('[chatService] runChat complete', { events })
  return { events }
}
