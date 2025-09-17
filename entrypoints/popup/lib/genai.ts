import { GoogleGenAI } from "@google/genai"
import { SYSTEM_INSTRUCTIONS } from "./prompts"

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
  // Optional prior conversation to provide full context, including prior tool responses
  history?: Array<{
    role: "user" | "ai" | "model"
    text?: string
    toolEvents?: ToolEvent[]
  }>
  // Live tool-call hooks for UI ordering
  onToolCall?: (ev: { name: string; displayName?: string; args: any }) => void
  onToolResult?: (ev: {
    name: string
    displayName?: string
    args: any
    result?: any
    error?: string
  }) => void
}

// Tool calling support

export type ToolHandlerContext = {}

export type ToolHandler = (args: any, ctx: ToolHandlerContext) => Promise<any>

export type ToolDefinition = {
  name: string
  displayName?: string
  description?: string
  // Parameters schema in SDK's Schema format (use Type.OBJECT, etc.)
  parameters: any
  handler: ToolHandler
}

export type ToolRegistry = Record<string, ToolDefinition>

export type ToolEvent = {
  name: string
  displayName?: string
  args: any
  result?: any
  error?: string
}

export type GenerateWithToolsResult = {
  text: string
  events: ToolEvent[]
}

const DEFAULT_MODEL = "gemini-2.5-flash"

type StreamState = {
  text: string
  thoughts: ThoughtState
}

type ThoughtState = {
  full: string
  signaturelessFull: string
  signatureParts: Map<string, string>
}

const createStreamState = (): StreamState => ({
  text: "",
  thoughts: {
    full: "",
    signaturelessFull: "",
    signatureParts: new Map<string, string>(),
  },
})

const tryDebug = (debug: boolean | undefined, ...args: any[]) => {
  if (!debug) return
  try {
    console.debug(...args)
  } catch {}
}

const computeDelta = (
  previous: string,
  next: string | undefined | null
): { delta?: string; full: string } => {
  if (typeof next !== "string") return { full: previous }
  if (next === previous) return { full: previous }
  if (next === "") return { full: previous }
  if (!previous) return { delta: next, full: next }

  if (next.startsWith(previous)) {
    const delta = next.slice(previous.length)
    return { delta: delta || undefined, full: next }
  }

  if (previous.startsWith(next)) {
    // Stream restarted with a truncated value
    return { full: next }
  }

  const maxPrefix = Math.min(previous.length, next.length)
  let shared = 0
  while (shared < maxPrefix && previous[shared] === next[shared]) shared += 1

  if (shared === 0) {
    // Treat as incremental chunk appended to the previous value
    return { delta: next, full: previous + next }
  }

  const delta = next.slice(shared)
  return { delta: delta || undefined, full: next }
}

const extractThoughtParts = (chunk: any): any[] => {
  const candidates: any[] | undefined = chunk?.candidates
  if (!Array.isArray(candidates)) return []
  const parts: any[] = []
  for (const candidate of candidates) {
    const candidateParts = candidate?.content?.parts
    if (Array.isArray(candidateParts)) {
      for (const part of candidateParts) {
        if (part && part.thought === true) parts.push(part)
      }
    }
  }
  return parts
}

const applyTextChunk = (
  state: StreamState,
  chunk: any,
  opts: GenerateOptions
) => {
  const { delta, full } = computeDelta(state.text, chunk?.text)
  if (typeof delta === "string" && delta.length) {
    opts.onChunk?.(delta)
  }
  if (full !== state.text) {
    state.text = full
    opts.onUpdate?.(state.text)
  }
}

const applyThoughtChunk = (
  state: ThoughtState,
  chunk: any,
  opts: GenerateOptions
) => {
  const parts = extractThoughtParts(chunk)
  if (!parts.length) return

  let deltaAggregate = ""
  const signaturelessParts: string[] = []

  for (const part of parts) {
    const text = typeof part?.text === "string" ? String(part.text) : ""
    if (!text) continue
    const signature =
      typeof part?.thoughtSignature === "string"
        ? part.thoughtSignature
        : undefined
    if (signature) {
      const prev = state.signatureParts.get(signature) ?? ""
      const { delta, full } = computeDelta(prev, text)
      state.signatureParts.set(signature, full)
      if (typeof delta === "string" && delta.length) {
        deltaAggregate += delta
      } else if (!prev && full) {
        deltaAggregate += full
      }
    } else {
      signaturelessParts.push(text)
    }
  }

  if (signaturelessParts.length) {
    const joined = signaturelessParts.join("")
    const prev = state.signaturelessFull
    const { delta, full } = computeDelta(prev, joined)
    state.signaturelessFull = full
    if (typeof delta === "string" && delta.length) {
      deltaAggregate += delta
    } else if (!prev && full) {
      // First segment without identifiable signature; treat as initial chunk
      deltaAggregate += full
    }
  }

  if (!deltaAggregate) return

  state.full += deltaAggregate
  opts.onThinkingChunk?.(deltaAggregate)
  opts.onThinkingUpdate?.(state.full)
}

const debugChunkParts = (chunk: any, opts: GenerateOptions, label: string) => {
  if (!opts.debug) return
  try {
    const candidates: any[] = Array.isArray(chunk?.candidates)
      ? (chunk as any).candidates.flatMap((c: any) =>
          Array.isArray(c?.content?.parts) ? c.content.parts : []
        )
      : []
    const partsDebug = candidates.map((p: any) => ({
      thought: !!p?.thought,
      hasText: typeof p?.text === "string",
      textPreview:
        typeof p?.text === "string" ? String(p.text).slice(0, 80) : undefined,
    }))
    const textPreview =
      typeof chunk?.text === "string"
        ? String((chunk as any).text).slice(0, 120)
        : undefined
    tryDebug(opts.debug, label, {
      textPreview,
      parts: partsDebug,
    })
  } catch {}
}

type StreamIterationResult = {
  interrupted: boolean
  functionCalls: any[]
}

const streamOnce = async ({
  ai,
  model,
  contents,
  config,
  opts,
  state,
  label,
}: {
  ai: GoogleGenAI
  model: string
  contents: any[]
  config: any
  opts: GenerateOptions
  state: StreamState
  label: string
}): Promise<StreamIterationResult> => {
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
    console.log("genai chunk", chunk)
    applyTextChunk(state, chunk, opts)
    applyThoughtChunk(state.thoughts, chunk, opts)
    debugChunkParts(chunk, opts, label)
    const fc = (chunk as any)?.functionCalls
    if (Array.isArray(fc)) {
      lastFunctionCalls = fc
      tryDebug(
        opts.debug,
        "[genai] stream functionCalls (chunk)",
        fc.map((c: any) => ({
          name: c?.name,
          argsKeys: Object.keys(c?.args ?? {}),
        }))
      )
    }
  }
  return { interrupted, functionCalls: lastFunctionCalls }
}

const resolveThinkingConfig = (
  opts: GenerateOptions
): { thinkingBudget: number; includeThoughts: boolean } | undefined => {
  const budgetProvided =
    typeof opts.thinkingBudget === "number" ? opts.thinkingBudget : undefined

  const wantsThoughts =
    opts.thinkingEnabled ??
    (typeof budgetProvided === "number" && budgetProvided !== 0)

  if (!wantsThoughts) {
    if (typeof budgetProvided === "number") {
      return {
        thinkingBudget: budgetProvided,
        includeThoughts: budgetProvided !== 0,
      }
    }
    return { thinkingBudget: 0, includeThoughts: false }
  }

  const budget = typeof budgetProvided === "number" ? budgetProvided : -1

  return {
    thinkingBudget: budget,
    includeThoughts: true,
  }
}

const buildHistoryContents = (opts: GenerateOptions) => {
  const contents: any[] = []
  if (!Array.isArray(opts.history)) return contents
  for (const h of opts.history) {
    const role = h.role === "user" ? "user" : "model"
    const text = typeof h.text === "string" ? h.text : ""
    if (text) contents.push({ role, parts: [{ text }] })
    if (Array.isArray(h.toolEvents)) {
      for (const ev of h.toolEvents) {
        const response =
          ev?.result ??
          (ev?.error ? { ok: false, error: ev.error } : { ok: true })
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name: ev.name, response } }],
        })
      }
    }
  }
  return contents
}

export async function generateWithGemini(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<{ text: string; events: ToolEvent[] }> {
  const { geminiApiKey } = await browser.storage.local.get("geminiApiKey")
  const apiKey = (geminiApiKey as string | undefined)?.trim()
  if (!apiKey)
    throw new Error("Gemini API key not set. Open the popup and Save your key.")

  const ai = new GoogleGenAI({ apiKey })
  const model = opts.model ?? DEFAULT_MODEL

  const thinkingConfig = resolveThinkingConfig(opts)
  const config: any = {
    systemInstruction: SYSTEM_INSTRUCTIONS,
  }
  if (thinkingConfig) config.thinkingConfig = thinkingConfig

  const hasTools = !!opts.tools && Object.keys(opts.tools!).length > 0

  // Build contents from history + current user prompt
  const contents: any[] = buildHistoryContents(opts)
  // Append the new user turn (the prompt we were given)
  contents.push({ role: "user", parts: [{ text: prompt }] })

  // Tools path: streaming with tool-calling loop
  if (hasTools) {
    const functionDeclarations = Object.values(opts.tools!).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
    tryDebug(
      opts.debug,
      "[genai] tools declarations",
      functionDeclarations.map((d) => ({
        name: d.name,
        paramKeys: d.parameters
          ? Object.keys((d.parameters as any)?.properties ?? {})
          : [],
      }))
    )
    const events: ToolEvent[] = []
    const executed = new Set<string>()
    let iterations = 0
    let lastState = createStreamState()
    while (true) {
      const state = createStreamState()
      lastState = state
      tryDebug(opts.debug, "[genai] streaming turn", { iteration: iterations })
      const { interrupted, functionCalls } = await streamOnce({
        ai,
        model,
        contents,
        config: {
          ...config,
          tools: [{ functionDeclarations }],
        },
        opts,
        state,
        label: "[genai] stream chunk",
      })
      if (interrupted) return { text: state.text, events }

      // Execute tool calls from final chunk
      let calls = Array.isArray(functionCalls) ? functionCalls : []
      // Deduplicate identical calls within the same turn (by name+args)
      const seenTurn = new Set<string>()
      calls = calls.filter((c: any) => {
        const key = `${c?.name}|${JSON.stringify(c?.args ?? {})}`
        if (seenTurn.has(key)) return false
        seenTurn.add(key)
        return true
      })
      if (!calls.length) {
        tryDebug(opts.debug, "[genai] no function calls in final chunk")
        return { text: state.text, events }
      }
      tryDebug(
        opts.debug,
        "[genai] executing function calls",
        calls.map((c: any) => ({
          name: c?.name,
          argsKeys: Object.keys(c?.args ?? {}),
        }))
      )

      for (const call of calls) {
        const name: string = call.name
        const def = opts.tools![name]
        try {
          opts.onToolCall?.({
            name,
            displayName: def?.displayName,
            args: call.args,
          })
        } catch {}
        if (!def) {
          events.push({
            name,
            displayName: name,
            args: call.args,
            error: "Unknown tool",
          })
          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name,
                  response: { ok: false, error: "Unknown tool" },
                },
              },
            ],
          })
          continue
        }
        let args: any = call.args
        try {
          if (typeof args === "string") args = JSON.parse(args)
        } catch {}
        const execKey = `${name}|${JSON.stringify(args ?? {})}`
        if (executed.has(execKey)) {
          tryDebug(opts.debug, "[genai] skipping duplicate tool call", { name })
          continue
        }
        try {
          const result = await def.handler(args, {})
          events.push({
            name,
            displayName: def.displayName ?? name,
            args,
            result,
          })
          contents.push({
            role: "user",
            parts: [{ functionResponse: { name, response: result } }],
          })
          try {
            opts.onToolResult?.({
              name,
              displayName: def.displayName,
              args,
              result,
            })
          } catch {}
          tryDebug(opts.debug, "[genai] tool success", {
            name,
            args,
            resultPreview: JSON.stringify(result).slice(0, 200),
          })
          executed.add(execKey)
        } catch (e: any) {
          const error = e?.message ?? String(e)
          events.push({
            name,
            displayName: def.displayName ?? name,
            args,
            error,
          })
          contents.push({
            role: "user",
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
          } catch {}
          tryDebug(opts.debug, "[genai] tool error", { name, args, error })
          executed.add(execKey)
        }
      }
    }
  }

  if (opts.stream) {
    const state = createStreamState()
    await streamOnce({
      ai,
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config,
      opts,
      state,
      label: "[genai] stream chunk",
    })
    return { text: state.text, events: [] }
  }

  const res: any = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config,
  })
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
    tryDebug(opts.debug, "[genai] non-stream response", {
      textPreview: String(res?.text ?? "").slice(0, 120),
      parts: partsDebug,
    })
  } catch {}
  return { text: res?.text ?? "", events: [] }
}

// Run a non-streaming tool-calling loop with Gemini. Falls back to plain text if no tools.
