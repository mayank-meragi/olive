import React from 'react'
import type { ChatMessage } from '../types'
import { ToolEvents } from './ToolEvents'
import { MessageItem } from './MessageItem'

export function MessageList({ messages, thinking }: { messages: ChatMessage[]; thinking: boolean }) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground">Ask anything to start chatting.</div>
    )
  }
  return (
    <>
      {messages.map((m, i) => (
        <div key={i}>
          {/* Tool events above AI response if present */}
          {m.role === 'ai' && (
            <ToolEvents live={(m as any).toolEventsLive} final={(m as any).toolEvents} />
          )}
          <MessageItem m={{ ...m, thinking: m.role === 'ai' && thinking ? m.thinking : undefined }} />
        </div>
      ))}
    </>
  )
}

