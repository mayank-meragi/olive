import { SYSTEM_INSTRUCTIONS } from './prompts'
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

export async function generateWithGemini(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<GenerateWithToolsResult> {
  const ai = await createGeminiClient()
  const model = getDefaultModel(opts.model)

  const thinkingConfig = resolveThinkingConfig(opts)

  const resolveTaskContext = async () => {
    if (!opts.taskContext) return undefined
    try {
      const text =
        typeof opts.taskContext === 'function'
          ? await opts.taskContext()
          : opts.taskContext
      const trimmed = typeof text === 'string' ? text.trim() : ''
      console.log('[genai] resolveTaskContext result', trimmed)
      return trimmed ? { text: trimmed } : undefined
    } catch (err) {
      tryDebug(opts.debug, '[genai] task context error', err)
      console.warn('[genai] task context error', err)
      return undefined
    }
  }

  const buildRequestConfig = async () => {
    const taskInstruction = await resolveTaskContext()
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

  const hasTools = !!opts.tools && Object.keys(opts.tools).length > 0

  if (hasTools && opts.tools) {
    const functionDeclarations = Object.values(opts.tools).map((t) => ({
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
      tools: opts.tools,
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
