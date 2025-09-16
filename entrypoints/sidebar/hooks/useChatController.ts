import type { ToolEvent } from "@/lib/genai"
import { useCallback, useEffect, useRef, useState } from "react"
import { runChat } from "../lib/chatService"
import type {
  ChatEntry,
  Conversation,
  TabCtx,
  ToolTimelineEntry,
} from "../types"
import { useScrollToBottom } from "./useScrollToBottom"
import { useStorageSync } from "./useStorageSync"
import { useTextareaAutoResize } from "./useTextareaAutoResize"

type PendingTool = { id: string; name: string }

const DEFAULT_CONVERSATION_TITLE = "New Chat"

function deriveConversationTitle(
  entries: ChatEntry[],
  fallback: string = DEFAULT_CONVERSATION_TITLE
) {
  const firstUserMessage = entries.find(
    (entry): entry is Extract<ChatEntry, { kind: "user" }> => entry.kind === "user"
  )
  if (!firstUserMessage) return fallback
  const trimmed = firstUserMessage.text.trim()
  if (!trimmed) return fallback
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed
}

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
  const [conversations, setConversations, conversationsReady] =
    useStorageSync<Conversation[]>("oliveConversations", [])
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null)
  const initialisedConversationRef = useRef(false)

  useScrollToBottom(listRef, messages.length)
  useTextareaAutoResize(textareaRef, draft)

  useEffect(() => {
    if (!conversationsReady) return
    if (initialisedConversationRef.current) return
    initialisedConversationRef.current = true

    if (conversations.length === 0) {
      const newId = makeId()
      const now = Date.now()
      setConversations([
        {
          id: newId,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: [],
          updatedAt: now,
        },
      ])
      setActiveConversationId(newId)
      return
    }

    const firstConversation = conversations[0]
    setActiveConversationId(firstConversation.id)
    setMessages(firstConversation.messages ?? [])
  }, [conversationsReady, conversations, setConversations])

  useEffect(() => {
    if (!conversationsReady) return
    if (!activeConversationId) return

    const activeExists = conversations.some(
      (conversation) => conversation.id === activeConversationId
    )
    if (activeExists || conversations.length === 0) return

    const fallback = conversations[0]
    if (fallback) {
      setActiveConversationId(fallback.id)
      setMessages(fallback.messages ?? [])
    } else {
      const newId = makeId()
      const now = Date.now()
      setConversations([
        {
          id: newId,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: [],
          updatedAt: now,
        },
      ])
      setActiveConversationId(newId)
      setMessages([])
    }
  }, [conversationsReady, conversations, activeConversationId, setConversations])

  useEffect(() => {
    if (!conversationsReady) return
    if (!activeConversationId) return

    setConversations((prev) => {
      const currentIdx = prev.findIndex(
        (conversation) => conversation.id === activeConversationId
      )
      const current = currentIdx >= 0 ? prev[currentIdx] : undefined
      const nextTitle = deriveConversationTitle(
        messages,
        current?.title ?? DEFAULT_CONVERSATION_TITLE
      )
      const needsUpdate =
        !current || current.messages !== messages || current.title !== nextTitle
      if (!needsUpdate) return prev

      const updatedConversation: Conversation = {
        id: activeConversationId,
        title: nextTitle,
        messages,
        updatedAt: Date.now(),
      }

      if (!current) {
        return [updatedConversation, ...prev]
      }

      const remaining = [
        ...prev.slice(0, currentIdx),
        ...prev.slice(currentIdx + 1),
      ]
      return [updatedConversation, ...remaining]
    })
  }, [
    messages,
    activeConversationId,
    conversationsReady,
    setConversations,
  ])

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

  const ensureActiveConversation = useCallback(() => {
    if (!conversationsReady) return activeConversationId
    if (activeConversationId) return activeConversationId
    const newId = makeId()
    const now = Date.now()
    setActiveConversationId(newId)
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: [],
        updatedAt: now,
      },
      ...prev,
    ])
    return newId
  }, [
    activeConversationId,
    conversationsReady,
    setActiveConversationId,
    setConversations,
  ])

  const startNewConversation = useCallback(() => {
    if (!conversationsReady) return
    const newId = makeId()
    const now = Date.now()
    setActiveConversationId(newId)
    setMessages([])
    setDraft("")
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: [],
        updatedAt: now,
      },
      ...prev,
    ])
  }, [conversationsReady, setConversations, setMessages, setDraft])

  const selectConversation = useCallback(
    (id: string) => {
      if (!conversationsReady) return
      if (id === activeConversationId) return
      const conversation = conversations.find((c) => c.id === id)
      if (!conversation) return
      setActiveConversationId(conversation.id)
      setMessages(conversation.messages ?? [])
      setDraft("")
    },
    [
      conversations,
      activeConversationId,
      conversationsReady,
      setMessages,
      setDraft,
    ]
  )

  const send = useCallback(
    async (prompt: string) => {
      if (!conversationsReady) return
      ensureActiveConversation()
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
    [
      allTabs,
      selectedTabIds,
      messages,
      model,
      thinking,
      autoRunTools,
      ensureActiveConversation,
      conversationsReady,
    ]
  )

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim()) return
      if (!conversationsReady) return
      setDraft("")
      void send(text.trim())
    },
    [send, conversationsReady]
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
    conversations,
    activeConversationId,
    selectConversation,
    startNewConversation,
    conversationsReady,
  }
}
