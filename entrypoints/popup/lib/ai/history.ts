import type { GenerateOptions, ToolEvent } from './types'

export const buildHistoryContents = (opts: GenerateOptions) => {
  console.log('[history] buildHistoryContents input', opts.history)
  const contents: any[] = []
  if (!Array.isArray(opts.history)) return contents
  for (const h of opts.history) {
    const role = h.role === 'user' ? 'user' : 'model'
    const text = typeof h.text === 'string' ? h.text : ''
    if (text) contents.push({ role, parts: [{ text }] })
    if (Array.isArray(h.toolEvents)) {
      for (const ev of h.toolEvents as ToolEvent[]) {
        const response =
          ev?.result ?? (ev?.error ? { ok: false, error: ev.error } : { ok: true })
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: ev.name, response } }],
        })
      }
    }
  }
  console.log('[history] buildHistoryContents output', contents)
  return contents
}
