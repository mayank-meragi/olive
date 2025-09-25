import { SYSTEM_INSTRUCTIONS } from './prompts'
import type { McpClientAdapter, McpToolListItem } from '../mcp/client'
import { getLatestTaskInstruction } from './taskContext'
import { createGeminiClient, getDefaultModel } from './ai/client'
import { tryDebug } from './ai/debug'
import { buildHistoryContents } from './ai/history'
import { resolveThinkingConfig } from './ai/thinking'
import { runSimpleStream, runToolStreamingLoop } from './ai/toolRunner'
import type {
  GenerateOptions,
  GenerateWithToolsResult,
  ToolDefinition,
  ToolEvent,
  ToolHandler,
  ToolHandlerContext,
  ToolRegistry,
} from './ai/types'

export type {
  GenerateOptions,
  GenerateWithToolsResult,
  ToolDefinition,
  ToolEvent,
  ToolHandler,
  ToolHandlerContext,
  ToolRegistry,
} from './ai/types'

async function buildMcpToolRegistry(
  mcp: McpClientAdapter,
): Promise<ToolRegistry> {
  const tools: ToolRegistry = {}
  try {
    const mcpTools: McpToolListItem[] = await mcp.listAllTools()
    for (const t of mcpTools) {
      const name = t.name
      if (!name) continue
      tools[name] = {
        name,
        displayName: name,
        description: t.description,
        parameters: t.inputSchema ?? {},
        handler: async (args: any) => {
          const res = await mcp.callTool(name, args)
          return res
        },
      }
    }
  } catch (e) {
    console.warn('[genai][mcp] failed to build MCP tools', e)
  }
  return tools
}

export async function generateWithGemini(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<GenerateWithToolsResult> {
  const ai = await createGeminiClient()
  const model = getDefaultModel(opts.model)

  const thinkingConfig = resolveThinkingConfig(opts)

  const buildRequestConfig = async () => {
    const taskInstruction = getLatestTaskInstruction()
    if (taskInstruction) {
      console.log('[genai] buildRequestConfig using taskInstruction', taskInstruction)
    } else {
      console.log('[genai] buildRequestConfig using default instructions')
    }
    const systemInstruction = taskInstruction
      ? [...SYSTEM_INSTRUCTIONS, taskInstruction]
      : [...SYSTEM_INSTRUCTIONS]
    const config: any = {
      systemInstruction,
    }
    if (thinkingConfig) config.thinkingConfig = thinkingConfig
    console.log('[genai] buildRequestConfig final', config)
    return config
  }

  const contents: any[] = buildHistoryContents(opts)
  contents.push({ role: 'user', parts: [{ text: prompt }] })

  // Merge local tools with MCP tools if provided
  let mergedTools: ToolRegistry = { ...(opts.tools ?? {}) }
  const mcp: McpClientAdapter | undefined = (opts as any)?.mcpClient
  if (mcp) {
    const mcpRegistry = await buildMcpToolRegistry(mcp)
    mergedTools = { ...mergedTools, ...mcpRegistry }
  }

  const hasTools = !!mergedTools && Object.keys(mergedTools).length > 0

  if (hasTools && opts.tools) {
    const functionDeclarations = Object.values(mergedTools).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
    tryDebug(
      opts.debug,
      '[genai] tools declarations',
      functionDeclarations.map((d) => ({
        name: d.name,
        paramKeys: d.parameters
          ? Object.keys((d.parameters as any)?.properties ?? {})
          : [],
      })),
    )
    const result = await runToolStreamingLoop({
      ai,
      model,
      contents,
      configProvider: buildRequestConfig,
      opts,
      tools: mergedTools,
    })
    return result
  }

  if (opts.stream) {
    const baseConfig = await buildRequestConfig()
    console.log('[genai] runSimpleStream config', baseConfig)
    const state = await runSimpleStream({
      ai,
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: baseConfig,
      opts,
    })
    return { text: state.text, events: [] }
  }

  const baseConfig = await buildRequestConfig()
  console.log('[genai] generateContent config', baseConfig)
  const res: any = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: baseConfig,
  })
  try {
    const partsDebug = (res?.candidates?.[0]?.content?.parts as any[])?.map(
      (p: any) => ({
        thought: !!p?.thought,
        hasText: typeof p?.text === 'string',
        textPreview:
          typeof p?.text === 'string'
            ? String(p.text).slice(0, 120)
            : undefined,
      }),
    )
    tryDebug(opts.debug, '[genai] non-stream response', {
      textPreview: String(res?.text ?? '').slice(0, 120),
      parts: partsDebug,
    })
  } catch {
    // ignore debug errors
  }
  return { text: res?.text ?? '', events: [] }
}
