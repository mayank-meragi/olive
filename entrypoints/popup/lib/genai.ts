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

async function buildMcpToolRegistryFromAdapters(
  mcps: McpClientAdapter[],
): Promise<ToolRegistry> {
  const entries: Array<{ name: string; adapter: McpClientAdapter; tool: McpToolListItem }> = []
  for (const mcp of mcps) {
    try {
      const mcpTools = await mcp.listAllTools()
      // If selectedTools is provided and non-empty, filter by it
      const allow = Array.isArray(mcp.selectedTools) && mcp.selectedTools.length
        ? new Set(mcp.selectedTools)
        : undefined
      for (const t of mcpTools) {
        if (!t?.name) continue
        if (allow && !allow.has(t.name)) continue
        entries.push({ name: t.name, adapter: mcp, tool: t })
      }
    } catch (e) {
      console.warn('[genai][mcp] failed to list tools for adapter', mcp?.label, e)
    }
  }
  // Count duplicates by name
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)

  const registry: ToolRegistry = {}
  for (const e of entries) {
    const duplicate = (counts.get(e.name) ?? 0) > 1
    const uniqueName = duplicate
      ? `${e.name}__${(e.adapter.label ?? 'server').replace(/\s+/g, '_')}`
      : e.name
    registry[uniqueName] = {
      name: uniqueName,
      displayName: duplicate && e.adapter.label ? `${e.name} (${e.adapter.label})` : e.name,
      description: e.tool.description,
      parameters: e.tool.inputSchema ?? {},
      handler: async (args: any) => e.adapter.callTool(e.name, args),
    }
  }
  return registry
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

  // Merge local tools with MCP tools if provided (supports multiple MCP adapters)
  let mergedTools: ToolRegistry = { ...(opts.tools ?? {}) }
  const mcpsRaw = (opts as any)?.mcpClient as McpClientAdapter | McpClientAdapter[] | undefined
  const mcps = Array.isArray(mcpsRaw) ? mcpsRaw : mcpsRaw ? [mcpsRaw] : []
  if (mcps.length) {
    const mcpRegistry = await buildMcpToolRegistryFromAdapters(mcps)
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
