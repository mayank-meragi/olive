import type { ToolEvent } from "@/lib/genai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { runChat } from "../lib/chatService"
import type {
  ChatEntry,
  Conversation,
  TabCtx,
  Task,
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
  const [tasks, setTasks] = useState<Task[]>([])
  const tasksRef = useRef<Task[]>([])
  const setTasksState = useCallback(
    (next: Task[]) => {
      tasksRef.current = next
      setTasks(next)
    },
    [setTasks]
  )
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
    tasksRef.current = tasks
  }, [tasks])

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
          tasks: [],
        },
      ])
      setActiveConversationId(newId)
      setTasksState([])
      return
    }

    const firstConversation = conversations[0]
    setActiveConversationId(firstConversation.id)
    setMessages(firstConversation.messages ?? [])
    setTasksState(firstConversation.tasks ?? [])
  }, [conversationsReady, conversations, setConversations, setTasksState])

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
      setTasksState(fallback.tasks ?? [])
    } else {
      const newId = makeId()
      const now = Date.now()
      setConversations([
        {
          id: newId,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: [],
          updatedAt: now,
          tasks: [],
        },
      ])
      setActiveConversationId(newId)
      setMessages([])
      setTasksState([])
    }
  }, [
    conversationsReady,
    conversations,
    activeConversationId,
    setConversations,
    setTasksState,
  ])

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
        !current ||
        current.messages !== messages ||
        current.title !== nextTitle ||
        current.tasks !== tasksRef.current
      if (!needsUpdate) return prev

      const updatedConversation: Conversation = {
        id: activeConversationId,
        title: nextTitle,
        messages,
        updatedAt: Date.now(),
        tasks: tasksRef.current,
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
    tasks,
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
    setTasksState([])
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: [],
        updatedAt: now,
        tasks: [],
      },
      ...prev,
    ])
    return newId
  }, [
    activeConversationId,
    conversationsReady,
    setActiveConversationId,
    setTasksState,
    setConversations,
  ])

  const startNewConversation = useCallback(() => {
    if (!conversationsReady) return
    const newId = makeId()
    const now = Date.now()
    setActiveConversationId(newId)
    setMessages([])
    setDraft("")
    setTasksState([])
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: [],
        updatedAt: now,
        tasks: [],
      },
      ...prev,
    ])
  }, [
    conversationsReady,
    setConversations,
    setMessages,
    setDraft,
    setTasksState,
  ])

  const selectConversation = useCallback(
    (id: string) => {
      if (!conversationsReady) return
      if (id === activeConversationId) return
      const conversation = conversations.find((c) => c.id === id)
      if (!conversation) return
      setActiveConversationId(conversation.id)
      setMessages(conversation.messages ?? [])
      setDraft("")
      setTasksState(conversation.tasks ?? [])
    },
    [
      conversations,
      activeConversationId,
      conversationsReady,
      setMessages,
      setDraft,
      setTasksState,
    ]
  )

  const mutateTasks = useCallback(
    (mutator: (prev: Task[]) => Task[]) => {
      let snapshot: Task[] | null = null
      setTasks((prev) => {
        const result = mutator(prev)
        snapshot = result
        return result
      })
      if (snapshot) {
        tasksRef.current = snapshot
        return snapshot
      }
      return tasksRef.current
    },
    []
  )

  const createTaskNode = useCallback(
    ({
      title,
      completed,
      subtasks,
    }: {
      title: string
      completed?: boolean
      subtasks?: Array<{ title: string; completed?: boolean }>
    }) => {
      const trimmed = (title ?? "").trim()
      if (!trimmed) {
        return { ok: false, error: "Task title is required" }
      }
      if (!conversationsReady) {
        return { ok: false, error: "Conversation state not ready" }
      }
      const convId = ensureActiveConversation()
      if (!convId) {
        return { ok: false, error: "Unable to resolve conversation" }
      }
      const now = Date.now()
      const targetCompleted = Boolean(completed)
      const task: Task = {
        id: makeId(),
        title: trimmed,
        completed: targetCompleted,
        createdAt: now,
        updatedAt: now,
        subtasks: Array.isArray(subtasks)
          ? subtasks
              .map((entry) => {
                const subTrim = (entry?.title ?? "").trim()
                if (!subTrim) return null
                return {
                  id: makeId(),
                  title: subTrim,
                  completed: Boolean(entry?.completed),
                  createdAt: now,
                  updatedAt: now,
                }
              })
              .filter((sub): sub is Task["subtasks"][number] => sub != null)
          : [],
      }
      const nextTasks = mutateTasks((prev) => [...prev, task])
      return { ok: true, tasks: nextTasks, task }
    },
    [conversationsReady, ensureActiveConversation, mutateTasks]
  )

  const addSubtask = useCallback(
    (taskId: string, title: string, completed?: boolean) => {
      const trimmed = (title ?? "").trim()
      if (!trimmed) return { ok: false, error: "Subtask title is required" }
      if (!conversationsReady || !activeConversationId) {
        return { ok: false, error: "No active conversation" }
      }
      const now = Date.now()
      let success = false
      let createdSubtask: Task["subtasks"][number] | undefined
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === taskId)
        if (idx === -1) return prev
        success = true
        const parent = prev[idx]
        const subtask: Task["subtasks"][number] = {
          id: makeId(),
          title: trimmed,
          completed: Boolean(completed),
          createdAt: now,
          updatedAt: now,
        }
        createdSubtask = subtask
        const updated: Task = {
          ...parent,
          subtasks: [...parent.subtasks, subtask],
          updatedAt: now,
        }
        const next = [...prev]
        next[idx] = updated
        return next
      })

      if (!success) {
        return { ok: false, error: "Parent task not found" }
      }
      return { ok: true, tasks: nextTasks, subtask: createdSubtask }
    },
    [mutateTasks, conversationsReady, activeConversationId]
  )

  const removeTask = useCallback(
    (id: string) => {
      if (!id) return { ok: false, error: "Task id is required" }
      if (!conversationsReady || !activeConversationId) {
        return { ok: false, error: "No active conversation" }
      }
      let success = false
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === id)
        if (idx === -1) return prev
        success = true
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
      })
      if (!success) return { ok: false, error: "Task not found" }
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId]
  )

  const removeSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      if (!taskId || !subtaskId) {
        return { ok: false, error: "Task id and subtask id are required" }
      }
      if (!conversationsReady || !activeConversationId) {
        return { ok: false, error: "No active conversation" }
      }
      let success = false
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === taskId)
        if (idx === -1) return prev
        const parent = prev[idx]
        const subIdx = parent.subtasks.findIndex((s) => s.id === subtaskId)
        if (subIdx === -1) return prev
        success = true
        const updated: Task = {
          ...parent,
          subtasks: [
            ...parent.subtasks.slice(0, subIdx),
            ...parent.subtasks.slice(subIdx + 1),
          ],
          updatedAt: Date.now(),
        }
        const next = [...prev]
        next[idx] = updated
        return next
      })
      if (!success) return { ok: false, error: "Subtask not found" }
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId]
  )

  const addTask = useCallback(
    (title: string, subtasks?: Array<{ title: string; completed?: boolean }>) =>
      createTaskNode({ title, completed: false, subtasks }),
    [createTaskNode]
  )

  const addTasksBatch = useCallback(
    (tasksBatch: Array<{ title: string; completed?: boolean; subtasks?: Array<{ title: string; completed?: boolean }> }>) => {
      if (!tasksBatch.length) return { ok: true, tasks }
      if (!conversationsReady) return { ok: false, error: "Conversation state not ready" }
      const convId = ensureActiveConversation()
      if (!convId) return { ok: false, error: "Unable to resolve conversation" }
      let next = tasks
      for (const entry of tasksBatch) {
        const { title, completed, subtasks } = entry ?? {}
        const result = createTaskNode({ title: title ?? "", completed, subtasks })
        if (!result.ok) return result
        next = result.tasks
      }
      return { ok: true, tasks: next }
    },
    [tasks, conversationsReady, ensureActiveConversation, createTaskNode]
  )

  const toggleTaskCompletion = useCallback(
    (id: string, done?: boolean) => {
      if (!id) return { ok: false, error: "Task id is required" }
      if (!conversationsReady || !activeConversationId) {
        return { ok: false, error: "No active conversation" }
      }
      const now = Date.now()
      let success = false
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === id)
        if (idx === -1) return prev
        success = true
        const task = prev[idx]
        const nextDone = typeof done === "boolean" ? done : !task.completed
        const updated: Task = {
          ...task,
          completed: nextDone,
          updatedAt: now,
        }
        const next = [...prev]
        next[idx] = updated
        return next
      })
      if (!success) return { ok: false, error: "Task not found" }
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId]
  )

  const toggleSubtaskCompletion = useCallback(
    (taskId: string, subtaskId: string, done?: boolean) => {
      if (!taskId || !subtaskId) {
        return { ok: false, error: "Task id and subtask id are required" }
      }
      if (!conversationsReady || !activeConversationId) {
        return { ok: false, error: "No active conversation" }
      }
      const now = Date.now()
      let success = false
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === taskId)
        if (idx === -1) return prev
        const parent = prev[idx]
        const subIdx = parent.subtasks.findIndex((s) => s.id === subtaskId)
        if (subIdx === -1) return prev
        success = true
        const sub = parent.subtasks[subIdx]
        const nextDone = typeof done === "boolean" ? done : !sub.completed
        const updatedSub = {
          ...sub,
          completed: nextDone,
          updatedAt: now,
        }
        const updatedParent: Task = {
          ...parent,
          subtasks: [
            ...parent.subtasks.slice(0, subIdx),
            updatedSub,
            ...parent.subtasks.slice(subIdx + 1),
          ],
          updatedAt: now,
        }
        const next = [...prev]
        next[idx] = updatedParent
        return next
      })
      if (!success) return { ok: false, error: "Subtask not found" }
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId]
  )

  const listTasks = useCallback(() => {
    if (!conversationsReady) {
      return { ok: true, tasks: [] as Task[] }
    }
    const currentId = activeConversationId ?? ensureActiveConversation()
    const activeConversation = conversations.find((c) => c.id === currentId)
    const source = activeConversation?.tasks ?? tasksRef.current
    return {
      ok: true,
      tasks: source.map((task) => ({
        id: task.id,
        title: task.title,
        completed: task.completed,
        subtasks: task.subtasks.map((sub) => ({
          id: sub.id,
          title: sub.title,
          completed: sub.completed,
        })),
      })),
    }
  }, [
    conversationsReady,
    activeConversationId,
    ensureActiveConversation,
    conversations,
    tasksRef,
  ])

  const buildTaskListText = useCallback(() => {
    const { tasks } = listTasks()
    if (!tasks.length) return 'Current Task List: (none)'
    const lines: string[] = []
    tasks.forEach((task, idx) => {
      lines.push(`${idx + 1}. ${task.completed ? '[x]' : '[ ]'} ${task.title}`)
      if (task.subtasks.length) {
        task.subtasks.forEach((sub, subIdx) => {
          lines.push(
            `    ${idx + 1}.${subIdx + 1} ${sub.completed ? '[x]' : '[ ]'} ${sub.title}`,
          )
        })
      }
    })
    return `Current Task List (latest):\n${lines.join('\n')}`
  }, [listTasks])

  const taskToolClient = useMemo(
    () => ({
      createTask: async ({
        title,
        completed,
        subtasks,
      }: {
        title: string
        completed?: boolean
        subtasks?: Array<{ title: string; completed?: boolean }>
      }) => createTaskNode({ title, completed, subtasks }),
      createTasks: async ({
        tasks: batch,
      }: {
        tasks: Array<{
          title: string
          completed?: boolean
          subtasks?: Array<{ title: string; completed?: boolean }>
        }>
      }) => addTasksBatch(Array.isArray(batch) ? batch : []),
      createSubtask: async ({
        taskId,
        title,
        completed,
      }: {
        taskId: string
        title: string
        completed?: boolean
      }) => addSubtask(taskId, title, completed),
      deleteTask: async ({
        taskId,
        parentTaskId,
      }: {
        taskId: string
        parentTaskId?: string
      }) =>
        parentTaskId ? removeSubtask(parentTaskId, taskId) : removeTask(taskId),
      markTaskDone: async ({
        taskId,
        parentTaskId,
        done,
      }: {
        taskId: string
        parentTaskId?: string
        done?: boolean
      }) =>
        parentTaskId
          ? toggleSubtaskCompletion(parentTaskId, taskId, done)
          : toggleTaskCompletion(taskId, done),
      listTasks: async () => listTasks(),
    }),
    [
      createTaskNode,
      addSubtask,
      removeTask,
      removeSubtask,
      toggleTaskCompletion,
      toggleSubtaskCompletion,
      listTasks,
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
      taskClient: taskToolClient,
      systemInstructionExtras: [{ text: buildTaskListText() }],
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
      taskToolClient,
      buildTaskListText,
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
    tasks,
    addTask,
    addSubtask,
    removeTask,
    removeSubtask,
    toggleTaskCompletion,
    toggleSubtaskCompletion,
  }
}
