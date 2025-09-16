import React from 'react'
import type { ToolTimelineEntry } from '../types'

const jsonPreview = (value: any, max = 160) => {
  try {
    const str = JSON.stringify(value, null, 2)
    if (!str) return undefined
    return str.length > max ? `${str.slice(0, max)}…` : str
  } catch {
    return undefined
  }
}

export function ToolEventItem({ entry }: { entry: ToolTimelineEntry }) {
  const argsPreview = jsonPreview(entry.args)
  const resultPreview = jsonPreview(entry.result)
  const statusLine = entry.status === 'calling'
    ? 'Running…'
    : entry.error
      ? `Error — ${entry.error}`
      : 'Completed'

  return (
    <div className="mr-auto max-w-[80%] text-xs text-muted-foreground">
      <div className="rounded-md border bg-muted px-3 py-2">
        <div className="font-medium text-foreground">Tool {entry.name}</div>
        <div className="mt-1">Status: {statusLine}</div>
        {argsPreview && (
          <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px] text-foreground">
            {argsPreview}
          </pre>
        )}
        {resultPreview && (
          <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px] text-foreground">
            {resultPreview}
          </pre>
        )}
      </div>
    </div>
  )
}
