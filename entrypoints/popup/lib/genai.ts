import { GoogleGenAI, Type } from "@google/genai"

export type GenerateOptions = {
  stream?: boolean
  // Called with only the new delta (optional)
  onChunk?: (text: string) => void
  // Called with the full accumulated text so far (preferred for UIs)
  onUpdate?: (full: string) => void
  model?: string
  thinkingEnabled?: boolean
  thinkingBudget?: number // -1 auto, 0 disabled, else token budget
  // Thinking callbacks
  onThinkingChunk?: (text: string) => void
  onThinkingUpdate?: (full: string) => void
  debug?: boolean
  // Return false to stop streaming mid-flight
  shouldContinue?: () => boolean
  // Optional tools registry; enables streaming tool-calling when provided
  tools?: ToolRegistry
}

// Tool calling support
export type ToolParametersSchema = {
  type: 'OBJECT'
  properties: Record<string, { type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT'; description?: string }>
  required?: string[]
}

export type ToolHandlerContext = {}

export type ToolHandler = (args: any, ctx: ToolHandlerContext) => Promise<any>

export type ToolDefinition = {
  name: string
  description?: string
  parameters: ToolParametersSchema
  handler: ToolHandler
}

export type ToolRegistry = Record<string, ToolDefinition>

export type ToolEvent = {
  name: string
  args: any
  result?: any
  error?: string
}

export type GenerateWithToolsResult = {
  text: string
  events: ToolEvent[]
}

export async function generateWithGemini(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<{ text: string; events: ToolEvent[] }> {
  const { geminiApiKey } = await browser.storage.local.get("geminiApiKey")
  const apiKey = (geminiApiKey as string | undefined)?.trim()
  if (!apiKey)
    throw new Error("Gemini API key not set. Open the popup and Save your key.")

  const ai = new GoogleGenAI({ apiKey })
  const model = opts.model ?? "gemini-2.5-flash"

  // Use config.thinkingConfig (shape supported by current @google/genai in this project)
  const config: any = {
    thinkingConfig: {
      thinkingBudget: opts.thinkingEnabled ? -1 : 0,
      includeThoughts: !!opts.thinkingEnabled,
    },
  }
  if (opts.debug) {
    // Do not log the API key
    console.debug("[genai] request config", {
      model,
      thinkingEnabled: !!opts.thinkingEnabled,
      thinkingBudget: config.thinkingConfig?.thinkingBudget,
      hasPrompt: typeof prompt === "string" && prompt.length > 0,
      promptPreview: prompt.slice(0, 120),
      toolsRegistered: opts.tools ? Object.keys(opts.tools) : [],
    })
  }

  const hasTools = !!opts.tools && Object.keys(opts.tools!).length > 0

  // Tools path: streaming with tool-calling loop
  if (hasTools) {
    const functionDeclarations = Object.values(opts.tools!).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
    if (opts.debug) {
      try {
        console.debug('[genai] tools declarations', functionDeclarations.map((d) => ({
          name: d.name,
          paramKeys: d.parameters ? Object.keys((d.parameters as any)?.properties ?? {}) : [],
        })))
      } catch {}
    }
    const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }]
    const events: ToolEvent[] = []
    let full = ''
    let thoughtsFull = ''
    let safety = 0
    while (safety++ < 5) {
      const stream: any = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          ...config,
          tools: [{ functionDeclarations }],
        },
      })
      if (opts.debug) {
        console.debug('[genai] started streaming with tools', {
          declarations: functionDeclarations.map((d) => d.name),
          turn: safety,
        })
      }
      let lastFunctionCalls: any[] | undefined
      for await (const chunk of stream as any) {
        if (opts.shouldContinue && !opts.shouldContinue()) break
        const text: string = chunk?.text ?? ''
        if (text) {
          const isPrefix = text.startsWith(full)
          const delta = isPrefix ? text.slice(full.length) : text
          full = isPrefix ? text : full + delta
          if (delta) opts.onChunk?.(delta)
          opts.onUpdate?.(full)
        }
        // Stream-surface function calls if present (typically on the last chunk)
        if (Array.isArray((chunk as any)?.functionCalls) && (chunk as any).functionCalls.length) {
          lastFunctionCalls = (chunk as any).functionCalls
          if (opts.debug) {
            try {
              console.debug('[genai] stream functionCalls', lastFunctionCalls.map((c: any) => ({
                name: c?.name,
                argsKeys: Object.keys(c?.args ?? {}),
              })))
            } catch {}
          }
        }
      }

      // Execute tool calls from final chunk
      const calls = Array.isArray(lastFunctionCalls) ? lastFunctionCalls : []
      if (!calls.length) {
        if (opts.debug) console.debug('[genai] no function calls in final chunk')
        return { text: full, events }
      }
      if (opts.debug) {
        try {
          console.debug('[genai] executing function calls', calls.map((c: any) => ({
            name: c?.name,
            argsKeys: Object.keys(c?.args ?? {}),
          })))
        } catch {}
      }

      for (const call of calls) {
        const name: string = call.name
        const def = opts.tools![name]
        if (!def) {
          events.push({ name, args: call.args, error: 'Unknown tool' })
          contents.push({ role: 'user', parts: [{ functionResponse: { name, response: { ok: false, error: 'Unknown tool' } } }] })
          continue
        }
        let args: any = call.args
        try { if (typeof args === 'string') args = JSON.parse(args) } catch {}
        try {
          const result = await def.handler(args, {})
          events.push({ name, args, result })
          contents.push({ role: 'user', parts: [{ functionResponse: { name, response: result } }] })
          if (opts.debug) {
            try { console.debug('[genai] tool success', { name, args, resultPreview: JSON.stringify(result).slice(0, 200) }) } catch {}
          }
        } catch (e: any) {
          const error = e?.message ?? String(e)
          events.push({ name, args, error })
          contents.push({ role: 'user', parts: [{ functionResponse: { name, response: { ok: false, error } } }] })
          if (opts.debug) {
            try { console.debug('[genai] tool error', { name, args, error }) } catch {}
          }
        }
      }
      // Loop for potential follow-up generation after tool responses
    }
    return { text: '', events: [] }
  }

  if (opts.stream) {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config,
    })
    let full = ""
    let thoughtsFull = ""
    for await (const chunk of stream as any) {
      if (opts.shouldContinue && !opts.shouldContinue()) break
      const text: string = chunk?.text ?? ""
      if (text) {
        // Many SDKs yield cumulative text; compute only the delta to avoid repeats
        const isPrefix = text.startsWith(full)
        const delta = isPrefix ? text.slice(full.length) : text
        full = isPrefix ? text : full + delta
        if (delta) opts.onChunk?.(delta)
        opts.onUpdate?.(full)
      }

      // Try to extract any thought parts and stream them separately
      try {
        const candidates: any[] | undefined = chunk?.candidates
        if (Array.isArray(candidates)) {
          const thoughtText = candidates
            .flatMap((c: any) => (c?.content?.parts as any[]) || [])
            .filter(
              (p: any) => p && p.thought === true && typeof p.text === "string"
            )
            .map((p: any) => String(p.text))
            .join("")
          if (thoughtText) {
            const thoughtsIsPrefix = thoughtText.startsWith(thoughtsFull)
            const thoughtsDelta = thoughtsIsPrefix
              ? thoughtText.slice(thoughtsFull.length)
              : thoughtText
            thoughtsFull = thoughtsIsPrefix
              ? thoughtText
              : thoughtsFull + thoughtsDelta
            if (thoughtsDelta) opts.onThinkingChunk?.(thoughtsDelta)
            opts.onThinkingUpdate?.(thoughtsFull)
          }
          if (opts.debug) {
            const partsDebug = candidates
              .flatMap((c: any) => (c?.content?.parts as any[]) || [])
              .map((p: any) => ({
                thought: !!p?.thought,
                hasText: typeof p?.text === "string",
                textPreview:
                  typeof p?.text === "string"
                    ? String(p.text).slice(0, 80)
                    : undefined,
              }))
            console.debug("[genai] stream chunk", {
              textPreview: text.slice(0, 120),
              parts: partsDebug,
            })
          }
        }
      } catch {}
    }
    return { text: full, events: [] }
  }

  const res: any = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config,
  })
  if (opts.debug) {
    try {
      const partsDebug = (res?.candidates?.[0]?.content?.parts as any[])?.map(
        (p: any) => ({
          thought: !!p?.thought,
          hasText: typeof p?.text === "string",
          textPreview:
            typeof p?.text === "string"
              ? String(p.text).slice(0, 120)
              : undefined,
        })
      )
      console.debug("[genai] non-stream response", {
        textPreview: String(res?.text ?? "").slice(0, 120),
        parts: partsDebug,
      })
    } catch {}
  }
  return { text: res?.text ?? "", events: [] }
}

// Run a non-streaming tool-calling loop with Gemini. Falls back to plain text if no tools.
