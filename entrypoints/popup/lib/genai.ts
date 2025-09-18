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
  const baseConfig: any = {
    systemInstruction: [
      ...SYSTEM_INSTRUCTIONS,
      ...(opts.systemInstructionExtras ?? []),
    ],
  }
  if (thinkingConfig) baseConfig.thinkingConfig = thinkingConfig

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
      config: baseConfig,
      opts,
      tools: opts.tools,
    })
    return result
  }

  if (opts.stream) {
    const state = await runSimpleStream({
      ai,
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: baseConfig,
      opts,
    })
    return { text: state.text, events: [] }
  }

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
