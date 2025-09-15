import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { generateWithGemini, type ToolEvent } from '@/lib/genai'
import { buildBrowserTools } from '@/lib/tools'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { ArrowUp, Square } from 'lucide-react'

type TabCtx = { id?: number; title?: string; url?: string; favIconUrl?: string }

export default function Sidebar() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string; thinking?: string; ctxTabs?: TabCtx[] }>>([])
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const [model, setModel] = useState<string>('gemini-2.5-flash')
  const [thinking, setThinking] = useState<boolean>(false)
  const stopRequested = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [autoRunTools, setAutoRunTools] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  const [allTabs, setAllTabs] = useState<Array<browser.tabs.Tab>>([])
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set())
  const [tabQuery, setTabQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)

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

  // Load tabs when the popover opens
  useEffect(() => {
    if (!tabPickerOpen) return
    ;(async () => {
      try {
        const tabs = await browser.tabs.query({})
        setAllTabs(tabs)
      } catch (err) {
        // ignore
      }
    })()
    // Reset search and highlight and focus the search box
    setTabQuery('')
    setHighlightIndex(0)
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [tabPickerOpen])

  // When tab picker closes, return focus to the textarea
  useEffect(() => {
    if (tabPickerOpen) return
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [tabPickerOpen])

  const filteredTabs = useMemo(() => {
    const q = tabQuery.trim().toLowerCase()
    if (!q) return allTabs
    return allTabs.filter((t) =>
      (t.title ?? '').toLowerCase().includes(q) || (t.url ?? '').toLowerCase().includes(q),
    )
  }, [allTabs, tabQuery])

  useEffect(() => {
    // Keep highlightIndex within bounds when filtering
    if (highlightIndex > Math.max(0, filteredTabs.length - 1)) {
      setHighlightIndex((i) => Math.min(i, Math.max(0, filteredTabs.length - 1)))
    }
  }, [filteredTabs.length, highlightIndex])

  useEffect(() => {
    // Ensure highlighted item is visible
    const el = tabListRef.current?.querySelector(`[data-idx="${highlightIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Auto-resize the textarea as the user types, up to a max height
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = 160 // px ~ max-h-40
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
  }, [draft])

  useEffect(() => {
    void browser.storage.local.set({ oliveModel: model })
  }, [model])
  useEffect(() => {
    void browser.storage.local.set({ oliveThinking: thinking })
  }, [thinking])

  async function send(prompt: string) {
    // Build context block from selected tabs
    const selectedTabs = allTabs.filter((t) => (t.id ? selectedTabIds.has(t.id) : false))
    const contextBlock = selectedTabs.length
      ? '\n\n[Context Tabs]\n' +
        selectedTabs
          .map((t, i) => `- ${t.title ?? 'Untitled'}${t.url ? ` (${t.url})` : ''}`)
          .join('\n')
      : ''
    const fullPrompt = prompt + contextBlock
    // Optimistically add user message and an empty AI bubble we will fill by replacing text
    // Show only the typed text in the chat; context is appended only for the model
    const ctxTabsSummary: TabCtx[] = selectedTabs.map((t) => ({ id: t.id, title: t.title, url: t.url, favIconUrl: t.favIconUrl }))
    setMessages((prev) => [...prev, { role: 'user', text: prompt, ctxTabs: ctxTabsSummary }, { role: 'ai', text: '' }])
    stopRequested.current = false
    setStreaming(true)
    try {
      // Build tab tools (open/close/switch/navigate/reload)
      const tools = buildBrowserTools({ autoRun: autoRunTools })
      // Build conversation history for the model (prior messages + prior tool events)
      const historyForModel = messages.map((m) => ({
        role: m.role === 'ai' ? ('model' as const) : ('user' as const),
        text: m.text,
        toolEvents: (m as any).toolEvents as any,
      }))

      // Stream text while enabling tool calls via unified method
      const { text, events } = await generateWithGemini(fullPrompt, {
        model,
        thinkingEnabled: thinking,
        debug: true,
        tools,
        history: historyForModel,
        onToolCall: (ev) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'ai') {
              const arr = ((last as any).toolEventsLive ?? []) as any[]
              ;(last as any).toolEventsLive = [...arr, { ...ev, status: 'calling' }]
            }
            return next
          })
        },
        onToolResult: (ev) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'ai') {
              const arr = ((last as any).toolEventsLive ?? []) as any[]
              for (let i = arr.length - 1; i >= 0; i--) {
                const it = arr[i]
                if (it.name === ev.name && it.status === 'calling') {
                  arr[i] = { ...it, ...ev, status: 'done' }
                  break
                }
              }
              ;(last as any).toolEventsLive = [...arr]
            }
            return next
          })
        },
        onUpdate: (full) => {
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
        shouldContinue: () => !stopRequested.current,
      })
      // Attach tool events after streaming completes
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'ai') (last as any).toolEvents = events as ToolEvent[]
        return next
      })
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'ai', text: `Error: ${e?.message ?? e}` }])
    } finally {
      setStreaming(false)
      // Clear selection after sending
      setSelectedTabIds(new Set())
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
              {/* Live tool calls and final tool events shown before the AI response */}
              {m.role === 'ai' && (((m as any).toolEventsLive && (m as any).toolEventsLive.length > 0) || ((m as any).toolEvents && (m as any).toolEvents.length > 0)) && (
                <div className="mb-1 space-y-1">
                  {((m as any).toolEventsLive ?? []).map((ev: any, idx: number) => (
                    <div key={`live-${idx}`} className="text-xs text-muted-foreground">
                      {ev.status === 'calling'
                        ? `Calling tool ${ev.name}…`
                        : `Tool ${ev.name}: ${ev.error ? `Error - ${ev.error}` : 'Success'}`}
                    </div>
                  ))}
                  {((m as any).toolEvents ?? []).map((ev: ToolEvent, idx: number) => (
                    <div key={`final-${idx}`} className="text-xs text-muted-foreground">
                      Tool {ev.name}: {ev.error ? `Error - ${ev.error}` : ev.result?.ok ? 'Success' : 'Result'}
                      {ev.result?.url ? ` — ${ev.result.url}` : ''}
                    </div>
                  ))}
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
              {m.role === 'user' && m.ctxTabs && m.ctxTabs.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
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
          <Popover open={tabPickerOpen} onOpenChange={setTabPickerOpen}>
            <PopoverAnchor asChild>
              <textarea
                ref={textareaRef}
                placeholder="Ask anything... Press @ to add tabs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Open tab picker on '@'
                  if (e.key === '@') {
                    e.preventDefault()
                    setTabPickerOpen(true)
                    return
                  }
                  // Submit on Cmd/Ctrl+Enter; allow Enter for newlines
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    if (!streaming) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
                  }
                }}
                rows={1}
                className="flex w-full min-h-[36px] max-h-40 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </PopoverAnchor>
            <PopoverContent className="w-[360px] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="p-2 pb-0">
                <Input
                  ref={searchRef}
                  placeholder="Search tabs by title or URL"
                  value={tabQuery}
                  onChange={(e) => setTabQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setHighlightIndex((i) => Math.min(i + 1, Math.max(0, filteredTabs.length - 1)))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setHighlightIndex((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const t = filteredTabs[highlightIndex]
                      const id = t?.id ?? -1
                      if (id !== -1) {
                        setSelectedTabIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(id)) next.delete(id)
                          else next.add(id)
                          return next
                        })
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setTabPickerOpen(false)
                    }
                  }}
                  className="h-8"
                />
              </div>
              <div ref={tabListRef} className="max-h-64 overflow-auto p-2 pt-1">
                <div className="mb-2 px-1 text-xs text-muted-foreground">Add tabs as context</div>
                {filteredTabs.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">No tabs found</div>
                ) : (
                  filteredTabs.map((t, i) => {
                    const id = t.id ?? -1
                    const selected = id !== -1 && selectedTabIds.has(id)
                    const highlighted = i === highlightIndex
                    return (
                      <button
                        key={id + (t.url ?? '')}
                        type="button"
                        className={
                          'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent ' +
                          (selected ? 'bg-accent ' : '') +
                          (highlighted ? 'outline outline-1 outline-primary' : '')
                        }
                        data-idx={i}
                        onClick={() => {
                          if (id === -1) return
                          setSelectedTabIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }}
                        onMouseEnter={() => setHighlightIndex(i)}
                      >
                        {/* Favicon */}
                        {t.favIconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.favIconUrl} alt="" className="h-4 w-4 shrink-0" />
                        ) : (
                          <div className="h-4 w-4 shrink-0 rounded-sm bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{t.title ?? 'Untitled'}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.url ?? ''}</div>
                        </div>
                        {selected ? (
                          <span className="text-xs text-primary">Added</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Add</span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="flex items-center justify-between border-t p-2">
                <div className="text-xs text-muted-foreground">
                  {selectedTabIds.size} selected
                </div>
                <Button type="button" size="sm" onClick={() => setTabPickerOpen(false)}>
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
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
        {selectedTabIds.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {allTabs
              .filter((t) => (t.id ? selectedTabIds.has(t.id) : false))
              .map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs">
                  {t.favIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.favIconUrl} alt="" className="h-3 w-3" />
                  ) : (
                    <div className="h-3 w-3 rounded-sm bg-background" />
                  )}
                  <span className="max-w-[200px] truncate">{t.title ?? 'Untitled'}</span>
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (t.id == null) return
                      setSelectedTabIds((prev) => {
                        const next = new Set(prev)
                        next.delete(t.id as number)
                        return next
                      })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        )}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto-run tools</span>
            <Switch checked={autoRunTools} onCheckedChange={(v) => setAutoRunTools(Boolean(v))} />
          </div>
        </div>
      </form>
    </div>
  )
}
