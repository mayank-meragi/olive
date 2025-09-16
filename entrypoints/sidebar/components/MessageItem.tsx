import React from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { AiMessageEntry, UserMessageEntry } from '../types'

export function MessageItem({ entry }: { entry: AiMessageEntry | UserMessageEntry }) {
  const isUser = entry.kind === 'user'
  return (
    <div className={isUser ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
      <div
        className={
          isUser
            ? 'rounded-md bg-primary px-3 py-2 text-primary-foreground'
            : 'rounded-md bg-muted px-3 py-2 text-foreground'
        }
      >
        <MarkdownRenderer>{entry.text}</MarkdownRenderer>
      </div>

      {isUser && Array.isArray(entry.ctxTabs) && entry.ctxTabs.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.ctxTabs.map((t, idx) => (
            <div
              key={(t.id ?? idx) + (t.url ?? '')}
              className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"
            >
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
