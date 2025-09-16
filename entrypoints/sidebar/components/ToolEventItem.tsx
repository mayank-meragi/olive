import React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  const baseName = entry.displayName || entry.name
  const statusLabel =
    entry.status === 'calling'
      ? 'Running'
      : entry.error
        ? 'Failed'
        : 'Completed'

  return (
    <div className="mr-auto max-w-[80%] text-xs text-muted-foreground">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="w-full rounded-md border bg-muted px-3 py-2 text-left font-medium text-foreground">
          {baseName} {statusLabel}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 space-y-2 rounded-md border bg-background p-2">
            {entry.error && (
              <div className="text-xs text-red-600">Error: {entry.error}</div>
            )}
            {argsPreview && (
              <div>
                <div className="mb-1 font-semibold text-foreground">Input</div>
                <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px] text-foreground">
                  {argsPreview}
                </pre>
              </div>
            )}
            {resultPreview && (
              <div>
                <div className="mb-1 font-semibold text-foreground">Output</div>
                <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px] text-foreground">
                  {resultPreview}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
