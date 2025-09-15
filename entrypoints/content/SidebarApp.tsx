import React, { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SidebarApp() {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([])
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="pointer-events-auto fixed inset-y-0 right-0 flex w-[360px] flex-col border-l bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">Olive — AI Sidebar</div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Collapse' : 'Expand'}
        </Button>
      </div>
      {open && (
        <>
          <div ref={listRef} className="flex-1 space-y-2 overflow-auto p-3">
            {messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground">Say hello to start chatting.</div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[80%] rounded-md bg-primary px-3 py-2 text-primary-foreground'
                      : 'mr-auto max-w-[80%] rounded-md bg-muted px-3 py-2 text-foreground'
                  }
                >
                  {m.text}
                </div>
              ))
            )}
          </div>
          <form
            className="sticky bottom-0 flex gap-2 border-t bg-background p-2"
            onSubmit={(e) => {
              e.preventDefault()
              const text = draft.trim()
              if (!text) return
              setMessages((prev) => [...prev, { role: 'user', text }])
              setDraft('')
              // TODO: call Gemini with stored API key and append AI response
            }}
          >
            <Input
              placeholder="Ask anything..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit">Send</Button>
          </form>
        </>
      )}
    </div>
  )
}

