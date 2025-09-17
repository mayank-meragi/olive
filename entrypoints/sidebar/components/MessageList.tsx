import React from 'react'
import { MessageItem } from './MessageItem'
import { ThinkingItem } from './ThinkingItem'
import { ToolEventItem } from './ToolEventItem'
import { useChatControllerContext } from '../context/ChatControllerContext'

export function MessageList() {
  const { messages } = useChatControllerContext()
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground">
        Ask anything to start chatting.
      </div>
    )
  }
  return (
    <>
      {messages.map((entry) => {
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
