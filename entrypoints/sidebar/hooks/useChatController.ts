import type { ToolEvent } from "@/lib/genai"
import { useCallback, useEffect, useRef, useState } from "react"
import { runChat } from "../lib/chatService"
import type { ChatEntry, TabCtx, ToolTimelineEntry } from "../types"
import { useScrollToBottom } from "./useScrollToBottom"
import { useStorageSync } from "./useStorageSync"
import { useTextareaAutoResize } from "./useTextareaAutoResize"

type PendingTool = { id: string; name: string }

const makeId = (() => {
  let counter = 0
  return () => `${Date.now().toString(36)}-${(counter++).toString(36)}`
})()

export function useChatController() {
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [model, setModel] = useStorageSync<string>(
    "oliveModel",
    "gemini-2.5-flash"
  )
  const [thinking, setThinking] = useStorageSync<boolean>(
    "oliveThinking",
    false
  )
  const [autoRunTools, setAutoRunTools] = useState(true)
  const stopRequested = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  const [allTabs, setAllTabs] = useState<Array<Browser.tabs.Tab>>([])
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set())
  const lastAiIdRef = useRef<string | null>(null)
  const pendingToolIdsRef = useRef<PendingTool[]>([])

  useScrollToBottom(listRef, messages.length)
  useTextareaAutoResize(textareaRef, draft)

  useEffect(() => {
    if (tabPickerOpen) return
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [tabPickerOpen])

  const toggleTabSelection = useCallback((id: number) => {
    setSelectedTabIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const removeSelectedTab = useCallback((id: number) => {
    setSelectedTabIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const send = useCallback(
    async (prompt: string) => {
      const selectedTabs = allTabs.filter((t) =>
        t.id ? selectedTabIds.has(t.id) : false
      )
      const contextBlock = selectedTabs.length
        ? "\n\n[Context Tabs]\n" +
          selectedTabs
            .map(
              (t) => `- ${t.title ?? "Untitled"}${t.url ? ` (${t.url})` : ""}`
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
        Array<{
          role: "user" | "model"
          text?: string
          toolEvents?: ToolEvent[]
        }>
      >((acc, entry) => {
        if (entry.kind === "user") acc.push({ role: "user", text: entry.text })
        if (entry.kind === "ai")
          acc.push({
            role: "model",
            text: entry.text,
            toolEvents: entry.toolEvents,
          })
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
        setSelectedTabIds(() => new Set())
      }
    },
    [allTabs, selectedTabIds, messages, model, thinking, autoRunTools]
  )

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim()) return
      setDraft("")
      void send(text.trim())
    },
    [send]
  )

  const handleStop = useCallback(() => {
    stopRequested.current = true
  }, [])

  return {
    messages,
    draft,
    setDraft,
    listRef,
    textareaRef,
    streaming,
    model,
    setModel,
    thinking,
    setThinking,
    autoRunTools,
    setAutoRunTools,
    tabPickerOpen,
    setTabPickerOpen,
    allTabs,
    setAllTabs,
    selectedTabIds,
    toggleTabSelection,
    removeSelectedTab,
    handleSubmit,
    handleStop,
  }
}
