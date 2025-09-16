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
import type { ToolEvent } from "@/lib/genai"
import type { ChatEntry, TabCtx, ToolTimelineEntry } from "./types"

const makeId = (() => {
  let counter = 0
  return () => `${Date.now().toString(36)}-${(counter++).toString(36)}`
})()

export default function Sidebar() {
  const [messages, setMessages] = useState<ChatEntry[]>([])
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
  const lastAiIdRef = useRef<string | null>(null)
  const pendingToolIdsRef = useRef<Array<{ id: string; name: string }>>([])

  useScrollToBottom(listRef, messages.length)
  useTextareaAutoResize(textareaRef, draft)

  useEffect(() => {
    if (tabPickerOpen) return
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [tabPickerOpen])

  async function send(prompt: string) {
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
    const ctxTabsSummary: TabCtx[] = selectedTabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl,
    }))

    const historyForModel = messages.reduce<
      Array<{ role: "user" | "model"; text?: string; toolEvents?: ToolEvent[] }>
    >((acc, entry) => {
      if (entry.kind === "user") acc.push({ role: "user", text: entry.text })
      if (entry.kind === "ai")
        acc.push({ role: "model", text: entry.text, toolEvents: entry.toolEvents })
      return acc
    }, [])

    const userEntry: ChatEntry = {
      id: makeId(),
      kind: "user",
      text: prompt,
      ctxTabs: ctxTabsSummary,
    }
    setMessages((prev) => [...prev, userEntry])

    stopRequested.current = false
    setStreaming(true)
    lastAiIdRef.current = null
    pendingToolIdsRef.current = []

    try {
      const { events } = await runChat({
        prompt: fullPrompt,
        model,
        thinkingEnabled: thinking,
        autoRunTools,
        history: historyForModel,
        callbacks: {
          onToolCall: (ev) => {
            const toolId = makeId()
            pendingToolIdsRef.current.push({ id: toolId, name: ev.name })
            setMessages((prev) => [
              ...prev,
              {
                id: toolId,
                kind: "tool",
                displayName: ev.displayName ?? ev.name,
                name: ev.name,
                args: ev.args,
                status: "calling",
              } satisfies ToolTimelineEntry,
            ])
          },
          onToolResult: (ev) => {
            setMessages((prev) => {
              const next = [...prev]
              const queued = pendingToolIdsRef.current.shift()
              const updateEntry = (idx: number) => {
                const entry = next[idx] as ToolTimelineEntry
                next[idx] = {
                  ...entry,
                  displayName: ev.displayName ?? entry.displayName ?? ev.name,
                  status: "done",
                  result: ev.result,
                  error: ev.error,
                }
                return next
              }

              if (queued) {
                const idx = next.findIndex((entry) => entry.id === queued.id)
                if (idx >= 0 && next[idx]?.kind === "tool") {
                  return updateEntry(idx)
                }
              }

              const fallbackIdx = [...next]
                .reverse()
                .findIndex(
                  (entry) =>
                    entry.kind === "tool" &&
                    entry.status === "calling" &&
                    entry.name === ev.name
                )

              if (fallbackIdx !== -1) {
                const idx = next.length - 1 - fallbackIdx
                return updateEntry(idx)
              }

              next.push({
                id: makeId(),
                kind: "tool",
                displayName: ev.displayName ?? ev.name,
                name: ev.name,
                args: ev.args,
                status: "done",
                result: ev.result,
                error: ev.error,
              })
              return next
            })
          },
          onUpdate: (full) => {
            setMessages((prev) => {
              if (!full) return prev
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.kind === "ai") {
                next[next.length - 1] = { ...last, text: full }
                lastAiIdRef.current = last.id
                return next
              }
              const id = makeId()
              lastAiIdRef.current = id
              return [
                ...next,
                {
                  id,
                  kind: "ai",
                  text: full,
                },
              ]
            })
          },
          onThinkingUpdate: (tfull) => {
            if (!tfull) return
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.kind === "thinking") {
                next[next.length - 1] = { ...last, text: tfull }
                return next
              }
              return [
                ...next,
                { id: makeId(), kind: "thinking", text: tfull },
              ]
            })
          },
          shouldContinue: () => !stopRequested.current,
        },
      })
      setMessages((prev) => {
        const aiId = lastAiIdRef.current
        if (!aiId) return prev
        const idx = prev.findIndex((entry) => entry.id === aiId)
        if (idx === -1 || prev[idx]?.kind !== "ai") return prev
        const next = [...prev]
        next[idx] = { ...next[idx], toolEvents: events }
        return next
      })
    } catch (e: any) {
      setMessages((prev) => {
        const aiId = lastAiIdRef.current
        const message = `Error: ${e?.message ?? e}`
        if (aiId) {
          const idx = prev.findIndex((entry) => entry.id === aiId)
          if (idx >= 0 && prev[idx]?.kind === "ai") {
            const next = [...prev]
            next[idx] = { ...next[idx], text: message }
            return next
          }
        }
        const newId = makeId()
        lastAiIdRef.current = newId
        return [...prev, { id: newId, kind: "ai", text: message }]
      })
    } finally {
      setStreaming(false)
      setSelectedTabIds(new Set())
    }
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">Olive — AI Sidebar</div>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-auto p-3">
        <MessageList messages={messages} />
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
