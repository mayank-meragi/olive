import type { GoogleGenAI } from '@google/genai'
import { tryDebug } from './debug'
import { applyTextChunk, applyThoughtChunk, createStreamState, debugChunkParts } from './streamState'
import type { GenerateOptions, ToolEvent, ToolRegistry } from './types'

type StreamIterationResult = {
  interrupted: boolean
  functionCalls: any[]
  state: ReturnType<typeof createStreamState>
}

const streamOnce = async ({
  ai,
  model,
  contents,
  config,
  opts,
  label,
}: {
  ai: GoogleGenAI
  model: string
  contents: any[]
  config: any
  opts: GenerateOptions
  label: string
}): Promise<StreamIterationResult> => {
  const state = createStreamState()
  const stream: any = await ai.models.generateContentStream({
    model,
    contents,
    config,
  })
  let interrupted = false
  let lastFunctionCalls: any[] = []
  for await (const chunk of stream as any) {
    if (opts.shouldContinue && !opts.shouldContinue()) {
      interrupted = true
      break
    }
    applyTextChunk(state, chunk, opts)
    applyThoughtChunk(state.thoughts, chunk, opts)
    debugChunkParts(chunk, opts, label)
    const fc = (chunk as any)?.functionCalls
    if (Array.isArray(fc)) {
      lastFunctionCalls = fc
      tryDebug(
        opts.debug,
        '[genai] stream functionCalls (chunk)',
        fc.map((c: any) => ({
          name: c?.name,
          argsKeys: Object.keys(c?.args ?? {}),
        })),
      )
    }
  }
  return { interrupted, functionCalls: lastFunctionCalls, state }
}

const dedupeCalls = (calls: any[]) => {
  const seenTurn = new Set<string>()
  return calls.filter((c: any) => {
    const key = `${c?.name}|${JSON.stringify(c?.args ?? {})}`
    if (seenTurn.has(key)) return false
    seenTurn.add(key)
    return true
  })
}

const runSingleTool = async ({
  call,
  opts,
  events,
  contents,
  tools,
}: {
  call: any
  opts: GenerateOptions
  events: ToolEvent[]
  contents: any[]
  tools: ToolRegistry
}) => {
  const name: string = call.name
  const def = tools[name]
  console.log('[toolRunner] runSingleTool start', { name, args: call.args })
  try {
    opts.onToolCall?.({
      name,
      displayName: def?.displayName,
      args: call.args,
    })
  } catch {
    // ignore hook errors
  }
  if (!def) {
    events.push({
      name,
      displayName: name,
      args: call.args,
      error: 'Unknown tool',
    })
    contents.push({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name,
            response: { ok: false, error: 'Unknown tool' },
          },
        },
      ],
    })
    return
  }

  let args: any = call.args
  try {
    if (typeof args === 'string') args = JSON.parse(args)
  } catch {
    // leave args as-is on parse failure
  }

  try {
    const result = await def.handler(args, {})
    console.log('[toolRunner] runSingleTool success', { name, args, result })
    events.push({
      name,
      displayName: def.displayName ?? name,
      args,
      result,
    })
    {
      const parts: any[] = [{ functionResponse: { name, response: result } }]
      try {
        const img = (result as any)?.screenshot
        if (
          img &&
          typeof img?.base64 === 'string' &&
          img.base64.length > 0 &&
          typeof img?.mimeType === 'string'
        ) {
          parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } })
          tryDebug(opts.debug, '[genai] attached screenshot inlineData', {
            mimeType: img.mimeType,
            size: img.base64.length,
          })
        }
      } catch {
        // ignore attachment errors
      }
      contents.push({ role: 'user', parts })
    }
    try {
      opts.onToolResult?.({
        name,
        displayName: def.displayName,
        args,
        result,
      })
    } catch {
      // ignore hook errors
    }
    tryDebug(opts.debug, '[genai] tool success', {
      name,
      args,
      resultPreview: JSON.stringify(result).slice(0, 200),
    })
  } catch (e: any) {
    const error = e?.message ?? String(e)
    console.warn('[toolRunner] runSingleTool error', { name, args, error })
    events.push({
      name,
      displayName: def.displayName ?? name,
      args,
      error,
    })
    contents.push({
      role: 'user',
      parts: [
        { functionResponse: { name, response: { ok: false, error } } },
      ],
    })
    try {
      opts.onToolResult?.({
        name,
        displayName: def.displayName,
        args,
        error,
      })
    } catch {
      // ignore hook errors
    }
    tryDebug(opts.debug, '[genai] tool error', { name, args, error })
  }
}

export const runToolStreamingLoop = async ({
  ai,
  model,
  contents,
  configProvider,
  opts,
  tools,
}: {
  ai: GoogleGenAI
  model: string
  contents: any[]
  configProvider: () => Promise<any>
  opts: GenerateOptions
  tools: ToolRegistry
}): Promise<{ text: string; events: ToolEvent[] }> => {
  const events: ToolEvent[] = []
  let iterations = 0
  while (true) {
    const baseConfig = await configProvider()
    console.log('[toolRunner] iteration config', iterations, baseConfig)
    tryDebug(opts.debug, '[genai] streaming turn', { iteration: iterations })
    const { interrupted, functionCalls, state } = await streamOnce({
      ai,
      model,
      contents,
      config: {
        ...baseConfig,
        tools: [{
          functionDeclarations: Object.values(tools).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        }],
      },
      opts,
      label: '[genai] stream chunk',
    })

    if (interrupted) return { text: state.text, events }

    let calls = Array.isArray(functionCalls) ? functionCalls : []
    calls = dedupeCalls(calls)
    if (!calls.length) {
      tryDebug(opts.debug, '[genai] no function calls in final chunk')
      return { text: state.text, events }
    }

    tryDebug(
      opts.debug,
      '[genai] executing function calls',
      calls.map((c: any) => ({
        name: c?.name,
        argsKeys: Object.keys(c?.args ?? {}),
      })),
    )

    for (const call of calls) {
      await runSingleTool({ call, opts, events, contents, tools })
    }

    iterations += 1
  }
}

export const runSimpleStream = async ({
  ai,
  model,
  contents,
  config,
  opts,
}: {
  ai: GoogleGenAI
  model: string
  contents: any[]
  config: any
  opts: GenerateOptions
}) => {
  const { state } = await streamOnce({
    ai,
    model,
    contents,
    config,
    opts,
    label: '[genai] stream chunk',
  })
  return state
}
