import { GoogleGenAI } from "@google/genai"

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
}

export async function generateWithGemini(
  prompt: string,
  opts: GenerateOptions = {}
) {
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
    })
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
    return full
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
  return res?.text ?? ""
}
