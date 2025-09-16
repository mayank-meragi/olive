import React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { ChatMessage } from '../types'

export function MessageItem({ m }: { m: ChatMessage }) {
  return (
    <div className={m.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
      {m.role === 'ai' && m.thinking && (
        <div className="mb-1">
          <Collapsible>
            <CollapsibleTrigger className="text-xs text-muted-foreground underline">
              Thinking
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 rounded-md border bg-background p-2 text-sm">
                <MarkdownRenderer>{m.thinking}</MarkdownRenderer>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <div className={m.role === 'user' ? 'rounded-md bg-primary px-3 py-2 text-primary-foreground' : 'rounded-md bg-muted px-3 py-2 text-foreground'}>
        <MarkdownRenderer>{m.text}</MarkdownRenderer>
      </div>

      {Array.isArray(m.ctxTabs) && m.ctxTabs.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {m.ctxTabs.map((t, idx) => (
            <div key={(t.id ?? idx) + (t.url ?? '')} className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs">
              {t.favIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.favIconUrl} alt="" className="h-3 w-3" />
              ) : (
                <div className="h-3 w-3 rounded-sm bg-background" />
              )}
              <span className="max-w-[200px] truncate">{t.title ?? 'Untitled'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
