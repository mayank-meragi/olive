import React from 'react'
import { MessageItem } from './MessageItem'
import { ThinkingItem } from './ThinkingItem'
import { ToolEventItem } from './ToolEventItem'
import { useChatControllerContext } from '../context/ChatControllerContext'
import { Button } from '@/components/ui/button'

export function MessageList() {
  const { messages, savedCommands, setDraft, textareaRef } = useChatControllerContext()
  const visible = messages.filter((m) => m.kind !== 'task_state')
  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center text-xs text-muted-foreground">
          Ask anything — or start with a preset command.
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {savedCommands.map((cmd) => (
            <Button
              key={cmd.id}
              variant="outline"
              size="sm"
              className="max-w-[220px] truncate"
              title={cmd.text}
              onClick={() => {
                setDraft(cmd.text)
                const ta = textareaRef.current
                setTimeout(() => {
                  try {
                    ta?.focus()
                    const caret = cmd.text.length
                    ta?.setSelectionRange(caret, caret)
                  } catch {}
                }, 0)
              }}
            >
              {cmd.name}
            </Button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <>
      {visible.map((entry) => {
        switch (entry.kind) {
          case 'user':
          case 'ai':
            return <MessageItem key={entry.id} entry={entry} />
          case 'thinking':
            return <ThinkingItem key={entry.id} entry={entry} />
          case 'tool':
            return <ToolEventItem key={entry.id} entry={entry} />
          default:
            return null
        }
      })}
    </>
  )
}
