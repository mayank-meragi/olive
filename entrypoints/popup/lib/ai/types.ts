export type ToolEvent = {
  name: string
  displayName?: string
  args: any
  result?: any
  error?: string
}

export type GenerateOptions = {
  stream?: boolean
  onChunk?: (text: string) => void
  onUpdate?: (full: string) => void
  model?: string
  thinkingEnabled?: boolean
  thinkingBudget?: number
  onThinkingChunk?: (text: string) => void
  onThinkingUpdate?: (full: string) => void
  debug?: boolean
  shouldContinue?: () => boolean
  tools?: ToolRegistry
  history?: Array<{
    role: 'user' | 'ai' | 'model'
    text?: string
    toolEvents?: ToolEvent[]
  }>
  taskContext?: string | (() => string | Promise<string>)
  onToolCall?: (ev: { name: string; displayName?: string; args: any }) => void
  onToolResult?: (ev: {
    name: string
    displayName?: string
    args: any
    result?: any
    error?: string
  }) => void
  // Optional MCP client adapter(s); when provided, MCP tools will be
  // dynamically discovered and merged into the tool registry.
  mcpClient?:
    | {
        label?: string
        listAllTools: () => Promise<Array<{ name: string; description?: string; inputSchema?: any }>>
        callTool: (name: string, args: any) => Promise<any>
        close: () => Promise<void>
      }
    | Array<{
        label?: string
        listAllTools: () => Promise<Array<{ name: string; description?: string; inputSchema?: any }>>
        callTool: (name: string, args: any) => Promise<any>
        close: () => Promise<void>
      }>
}

export type ToolHandlerContext = {}

export type ToolHandler = (args: any, ctx: ToolHandlerContext) => Promise<any>

export type ToolDefinition = {
  name: string
  displayName?: string
  description?: string
  parameters: any
  handler: ToolHandler
}

export type ToolRegistry = Record<string, ToolDefinition>

export type GenerateWithToolsResult = {
  text: string
  events: ToolEvent[]
}
