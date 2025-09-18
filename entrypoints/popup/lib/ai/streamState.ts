import type { GenerateOptions } from './types'
import { tryDebug } from './debug'

type ThoughtState = {
  full: string
  signaturelessFull: string
  signatureParts: Map<string, string>
}

type StreamState = {
  text: string
  thoughts: ThoughtState
}

export const createStreamState = (): StreamState => ({
  text: '',
  thoughts: {
    full: '',
    signaturelessFull: '',
    signatureParts: new Map<string, string>(),
  },
})

export const computeDelta = (
  previous: string,
  next: string | undefined | null,
): { delta?: string; full: string } => {
  if (typeof next !== 'string') return { full: previous }
  if (next === previous) return { full: previous }
  if (next === '') return { full: previous }
  if (!previous) return { delta: next, full: next }

  if (next.startsWith(previous)) {
    const delta = next.slice(previous.length)
    return { delta: delta || undefined, full: next }
  }

  if (previous.startsWith(next)) {
    return { full: next }
  }

  const maxPrefix = Math.min(previous.length, next.length)
  let shared = 0
  while (shared < maxPrefix && previous[shared] === next[shared]) shared += 1

  if (shared === 0) {
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
    if (!Array.isArray(candidateParts)) continue
    for (const part of candidateParts) {
      if (part && part.thought === true) parts.push(part)
    }
  }
  return parts
}

export const applyTextChunk = (
  state: StreamState,
  chunk: any,
  opts: GenerateOptions,
) => {
  const { delta, full } = computeDelta(state.text, chunk?.text)
  if (typeof delta === 'string' && delta.length) {
    opts.onChunk?.(delta)
  }
  if (full !== state.text) {
    state.text = full
    opts.onUpdate?.(state.text)
  }
}

export const applyThoughtChunk = (
  state: ThoughtState,
  chunk: any,
  opts: GenerateOptions,
) => {
  const parts = extractThoughtParts(chunk)
  if (!parts.length) return

  let deltaAggregate = ''
  const signaturelessParts: string[] = []

  for (const part of parts) {
    const text = typeof part?.text === 'string' ? String(part.text) : ''
    if (!text) continue
    const signature =
      typeof part?.thoughtSignature === 'string'
        ? part.thoughtSignature
        : undefined
    if (signature) {
      const prev = state.signatureParts.get(signature) ?? ''
      const { delta, full } = computeDelta(prev, text)
      state.signatureParts.set(signature, full)
      if (typeof delta === 'string' && delta.length) {
        deltaAggregate += delta
      } else if (!prev && full) {
        deltaAggregate += full
      }
    } else {
      signaturelessParts.push(text)
    }
  }

  if (signaturelessParts.length) {
    const joined = signaturelessParts.join('')
    const prev = state.signaturelessFull
    const { delta, full } = computeDelta(prev, joined)
    state.signaturelessFull = full
    if (typeof delta === 'string' && delta.length) {
      deltaAggregate += delta
    } else if (!prev && full) {
      deltaAggregate += full
    }
  }

  if (!deltaAggregate) return

  state.full += deltaAggregate
  opts.onThinkingChunk?.(deltaAggregate)
  opts.onThinkingUpdate?.(state.full)
}

export const debugChunkParts = (
  chunk: any,
  opts: GenerateOptions,
  label: string,
) => {
  if (!opts.debug) return
  try {
    const candidates: any[] = Array.isArray(chunk?.candidates)
      ? (chunk as any).candidates.flatMap((c: any) =>
          Array.isArray(c?.content?.parts) ? c.content.parts : [],
        )
      : []
    const partsDebug = candidates.map((p: any) => ({
      thought: !!p?.thought,
      hasText: typeof p?.text === 'string',
      textPreview:
        typeof p?.text === 'string' ? String(p.text).slice(0, 80) : undefined,
    }))
    const textPreview =
      typeof chunk?.text === 'string'
        ? String((chunk as any).text).slice(0, 120)
        : undefined
    tryDebug(opts.debug, label, {
      textPreview,
      parts: partsDebug,
    })
  } catch {
    // swallow debug errors
  }
}

export type { StreamState, ThoughtState }
