import React from 'react'
import type { ToolEvent } from '@/lib/genai'

type Live = { name: string; status: 'calling' | 'done'; error?: string; result?: any }

export function ToolEvents({
  live,
  final,
}: {
  live?: Live[]
  final?: ToolEvent[]
}) {
  if ((!live || live.length === 0) && (!final || final.length === 0)) return null
  return (
    <div className="mb-1 space-y-1">
      {(live ?? []).map((ev, idx) => (
        <div key={`live-${idx}`} className="text-xs text-muted-foreground">
          {ev.status === 'calling'
            ? `Calling tool ${ev.name}…`
            : `Tool ${ev.name}: ${ev.error ? `Error - ${ev.error}` : 'Success'}`}
        </div>
      ))}
      {(final ?? []).map((ev, idx) => (
        <div key={`final-${idx}`} className="text-xs text-muted-foreground">
          Tool {ev.name}:{' '}
          {ev.error ? `Error - ${ev.error}` : ev.result?.ok ? 'Success' : 'Result'}
          {ev.result?.url ? ` — ${ev.result.url}` : ''}
        </div>
      ))}
    </div>
  )
}

