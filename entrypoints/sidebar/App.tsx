import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { generateWithGemini } from '@/lib/genai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ArrowUp, Square } from 'lucide-react'

export default function Sidebar() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string; thinking?: string }>>([])
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const [model, setModel] = useState<string>('gemini-2.5-flash')
  const [thinking, setThinking] = useState<boolean>(false)
  const stopRequested = useRef(false)
  const [streaming, setStreaming] = useState(false)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    ;(async () => {
      const { oliveModel, oliveThinking } = await browser.storage.local.get(['oliveModel', 'oliveThinking'])
      if (oliveModel && typeof oliveModel === 'string') setModel(oliveModel)
      if (typeof oliveThinking === 'boolean') setThinking(oliveThinking)
    })()
  }, [])

  useEffect(() => {
    void browser.storage.local.set({ oliveModel: model })
  }, [model])
  useEffect(() => {
    void browser.storage.local.set({ oliveThinking: thinking })
  }, [thinking])

  async function send(prompt: string) {
    // Optimistically add user message and an empty AI bubble we will fill by replacing text
    setMessages((prev) => [...prev, { role: 'user', text: prompt }, { role: 'ai', text: '' }])
    stopRequested.current = false
    setStreaming(true)
    try {
      await generateWithGemini(prompt, {
        stream: true,
        onUpdate: (full) => {
          // Replace last message text with the full accumulated text to avoid any duplication
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'ai') last.text = full
            return next
          })
        },
        onThinkingUpdate: (tfull) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'ai') last.thinking = tfull
            return next
          })
        },
        model,
        thinkingEnabled: thinking,
        debug: true,
        shouldContinue: () => !stopRequested.current,
      })
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'ai', text: `Error: ${e?.message ?? e}` }])
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">Olive — AI Sidebar</div>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-auto p-3">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground">Ask anything to start chatting.</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
              {/* Show thinking above the final answer for AI messages */}
              {m.role === 'ai' && thinking && m.thinking && (
                <div className="mb-1">
                  <Collapsible>
                    <CollapsibleTrigger className="text-xs text-muted-foreground underline">
                      Show thinking
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-1 rounded-md border bg-background p-2 text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.thinking}</ReactMarkdown>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              <div
                className={
                  m.role === 'user'
                    ? 'rounded-md bg-primary px-3 py-2 text-primary-foreground'
                    : 'rounded-md bg-muted px-3 py-2 text-foreground'
                }
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => <p className="mb-2 leading-relaxed" {...props} />,
                    ul: ({ node, ...props }) => <ul className="mb-2 list-disc pl-5" {...props} />,
                    ol: ({ node, ...props }) => <ol className="mb-2 list-decimal pl-5" {...props} />,
                    li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                    code: ({ inline, className, ...props }) => (
                      <code className={'rounded bg-accent px-1 py-0.5 font-mono text-xs ' + (className ?? '')} {...props} />
                    ),
                    pre: ({ node, ...props }) => (
                      <pre className="mb-2 max-w-full overflow-auto rounded-md bg-accent p-2" {...props} />
                    ),
                    h1: (p) => <h1 className="mb-2 text-xl font-semibold" {...p} />,
                    h2: (p) => <h2 className="mb-2 text-lg font-semibold" {...p} />,
                    h3: (p) => <h3 className="mb-2 text-base font-semibold" {...p} />,
                  }}
                >
                  {m.text}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="sticky bottom-0 border-t bg-background p-2"
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          setDraft('')
          void send(text)
        }}
      >
        <div className="flex gap-2">
          <Input
            placeholder="Ask anything..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (!streaming) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
              }
            }}
          />
          {streaming ? (
            <Button type="button" size="icon" onClick={() => (stopRequested.current = true)} title="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" title="Send">
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex w-[70%] items-center gap-2">
            <span className="text-xs text-muted-foreground">Model</span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Thinking</span>
            <Switch checked={thinking} onCheckedChange={(v) => setThinking(Boolean(v))} />
          </div>
        </div>
      </form>
    </div>
  )
}
