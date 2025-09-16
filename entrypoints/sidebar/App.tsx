import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useEffect, useRef, useState } from "react"
import { MessageList } from "./components/MessageList"
import { ChatInput } from "./components/ChatInput"
import { TabPicker } from "./components/TabPicker"
import { useScrollToBottom } from "./hooks/useScrollToBottom"
import { useTextareaAutoResize } from "./hooks/useTextareaAutoResize"
import { useStorageSync } from "./hooks/useStorageSync"
import { runChat } from "./lib/chatService"
import type { ChatMessage, TabCtx } from "./types"

export default function Sidebar() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement | null>(null)
  const [model, setModel] = useStorageSync<string>("oliveModel", "gemini-2.5-flash")
  const [thinking, setThinking] = useStorageSync<boolean>("oliveThinking", false)
  const stopRequested = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [autoRunTools, setAutoRunTools] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  const [allTabs, setAllTabs] = useState<Array<browser.tabs.Tab>>([])
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set())
  useScrollToBottom(listRef, messages.length)
  useTextareaAutoResize(textareaRef, draft)

  // When tab picker closes, return focus to the textarea
  useEffect(() => {
    if (tabPickerOpen) return
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [tabPickerOpen])

  // When tab picker closes, return focus to the textarea
  useEffect(() => {
    if (tabPickerOpen) return
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [tabPickerOpen])

  async function send(prompt: string) {
    // Build context block from selected tabs
    const selectedTabs = allTabs.filter((t) =>
      t.id ? selectedTabIds.has(t.id) : false
    )
    const contextBlock = selectedTabs.length
      ? "\n\n[Context Tabs]\n" +
        selectedTabs
          .map(
            (t, i) => `- ${t.title ?? "Untitled"}${t.url ? ` (${t.url})` : ""}`
          )
          .join("\n")
      : ""
    const fullPrompt = prompt + contextBlock
    // Optimistically add user message and an empty AI bubble we will fill by replacing text
    // Show only the typed text in the chat; context is appended only for the model
    const ctxTabsSummary: TabCtx[] = selectedTabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl,
    }))
    setMessages((prev) => [
      ...prev,
      { role: "user", text: prompt, ctxTabs: ctxTabsSummary },
      { role: "ai", text: "" },
    ])
    stopRequested.current = false
    setStreaming(true)
    try {
      // Build conversation history for the model (prior messages + prior tool events)
      const historyForModel = messages.map((m) => ({
        role: m.role === "ai" ? ("model" as const) : ("user" as const),
        text: m.text,
        toolEvents: (m as any).toolEvents as any,
      }))

      const { events } = await runChat({
        prompt: fullPrompt,
        model,
        thinkingEnabled: thinking,
        autoRunTools,
        history: historyForModel,
        callbacks: {
          onToolCall: (ev) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === "ai") {
                const arr = ((last as any).toolEventsLive ?? []) as any[]
                ;(last as any).toolEventsLive = [...arr, { ...ev, status: "calling" }]
              }
              return next
            })
          },
          onToolResult: (ev) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === "ai") {
                const arr = ((last as any).toolEventsLive ?? []) as any[]
                for (let i = arr.length - 1; i >= 0; i--) {
                  const it = arr[i]
                  if (it.name === ev.name && it.status === "calling") {
                    arr[i] = { ...it, ...ev, status: "done" }
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
              if (last && last.role === "ai") last.text = full
              return next
            })
          },
          onThinkingUpdate: (tfull) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === "ai") last.thinking = tfull
              return next
            })
          },
          shouldContinue: () => !stopRequested.current,
        },
      })
      // Attach tool events after streaming completes
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === "ai") (last as any).toolEvents = events
        return next
      })
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${e?.message ?? e}` },
      ])
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
        <MessageList messages={messages} thinking={thinking} />
      </div>
      <form
        className="sticky bottom-0 border-t bg-background p-2"
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          setDraft("")
          void send(text)
        }}
      >
        <TabPicker
          open={tabPickerOpen}
          onOpenChange={setTabPickerOpen}
          allTabs={allTabs}
          setAllTabs={setAllTabs}
          selectedTabIds={selectedTabIds}
          onToggle={(id) =>
            setSelectedTabIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          anchor={
            <ChatInput
              draft={draft}
              setDraft={setDraft}
              streaming={streaming}
              onSubmit={() => {
                const text = draft.trim()
                if (!text) return
                setDraft("")
                void send(text)
              }}
              onStop={() => (stopRequested.current = true)}
              textareaRef={textareaRef}
              onAtTrigger={() => setTabPickerOpen(true)}
            />
          }
        />
        {selectedTabIds.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {allTabs
              .filter((t) => (t.id ? selectedTabIds.has(t.id) : false))
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"
                >
                  {t.favIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.favIconUrl} alt="" className="h-3 w-3" />
                  ) : (
                    <div className="h-3 w-3 rounded-sm bg-background" />
                  )}
                  <span className="max-w-[200px] truncate">
                    {t.title ?? "Untitled"}
                  </span>
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
                <SelectItem value="gemini-2.5-flash">
                  Gemini 2.5 Flash
                </SelectItem>
                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Thinking</span>
            <Switch
              checked={thinking}
              onCheckedChange={(v) => setThinking(Boolean(v))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Auto-run tools
            </span>
            <Switch
              checked={autoRunTools}
              onCheckedChange={(v) => setAutoRunTools(Boolean(v))}
            />
          </div>
        </div>
      </form>
    </div>
  )
}
