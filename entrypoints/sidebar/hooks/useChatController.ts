import type { ToolEvent } from "@/lib/genai"
import { updateActiveConversation, updateTasksSnapshot } from "@/lib/taskContext"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { runChat } from "../lib/chatService"
import type {
  ChatEntry,
  Conversation,
  TabCtx,
  Task,
  TaskStateEntry,
  ToolTimelineEntry,
} from "../types"
import { useScrollToBottom } from "./useScrollToBottom"
import { useStorageSync } from "./useStorageSync"
import { useTextareaAutoResize } from "./useTextareaAutoResize"

type PendingTool = { id: string; name: string }

const DEFAULT_CONVERSATION_TITLE = "New Chat"

const makeId = (() => {
  let counter = 0
  return () => `${Date.now().toString(36)}-${(counter++).toString(36)}`
})()

const cloneTaskList = (tasks: Task[]): Task[] =>
  tasks.map((task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
  }))

const taskListsEqual = (a: Task[], b: Task[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const taskA = a[i]
    const taskB = b[i]
    if (
      taskA.id !== taskB.id ||
      taskA.title !== taskB.title ||
      taskA.completed !== taskB.completed ||
      taskA.createdAt !== taskB.createdAt ||
      taskA.updatedAt !== taskB.updatedAt ||
      taskA.subtasks.length !== taskB.subtasks.length
    ) {
      return false
    }
    for (let j = 0; j < taskA.subtasks.length; j += 1) {
      const subA = taskA.subtasks[j]
      const subB = taskB.subtasks[j]
      if (
        subA.id !== subB.id ||
        subA.title !== subB.title ||
        subA.completed !== subB.completed ||
        subA.createdAt !== subB.createdAt ||
        subA.updatedAt !== subB.updatedAt
      ) {
        return false
      }
    }
  }
  return true
}

const createTaskSnapshotEntry = (tasks: Task[]): TaskStateEntry => ({
  id: makeId(),
  kind: "task_state",
  tasks: cloneTaskList(tasks),
})

const findLastIndex = <T>(
  items: T[],
  predicate: (item: T, index: number) => boolean
): number => {
  for (let idx = items.length - 1; idx >= 0; idx -= 1) {
    if (predicate(items[idx], idx)) return idx
  }
  return -1
}

const ensureTaskSnapshot = (
  messages: ChatEntry[] | undefined,
  legacyTasks?: Task[]
): ChatEntry[] => {
  const base = Array.isArray(messages) ? [...messages] : []
  const hasSnapshot = base.some((entry) => entry.kind === "task_state")
  if (hasSnapshot) return base
  const snapshot = Array.isArray(legacyTasks) ? legacyTasks : []
  base.push(createTaskSnapshotEntry(snapshot))
  return base
}

const extractTasksFromMessages = (entries: ChatEntry[]): Task[] => {
  for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
    const entry = entries[idx]
    if (entry.kind === "task_state") {
      return cloneTaskList(entry.tasks)
    }
  }
  return []
}

function deriveConversationTitle(
  entries: ChatEntry[],
  fallback: string = DEFAULT_CONVERSATION_TITLE
) {
  const firstUserMessage = entries.find(
    (entry): entry is Extract<ChatEntry, { kind: "user" }> =>
      entry.kind === "user"
  )
  if (!firstUserMessage) return fallback
  const trimmed = firstUserMessage.text.trim()
  if (!trimmed) return fallback
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed
}

export function useChatController() {
  const logTasksDebug = useCallback((label: string, payload?: any) => {
    if (payload !== undefined) console.log(`[tasks] ${label}`, payload)
    else console.log(`[tasks] ${label}`)
  }, [])
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState("")
  const tasksRef = useRef<Task[]>([])
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
  const [conversations, setConversations, conversationsReady] = useStorageSync<
    Conversation[]
  >("oliveConversations", [])
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const initialisedConversationRef = useRef(false)

  useScrollToBottom(listRef, messages.length)
  useTextareaAutoResize(textareaRef, draft)

  const tasks = useMemo(() => extractTasksFromMessages(messages), [messages])

  useEffect(() => {
    tasksRef.current = tasks
    logTasksDebug("tasks derived updated", tasks)
  }, [tasks, logTasksDebug])

  useEffect(() => {
    if (!conversationsReady) return
    if (initialisedConversationRef.current) return
    initialisedConversationRef.current = true

    if (conversations.length === 0) {
      const newId = makeId()
      const now = Date.now()
      const initialMessages = ensureTaskSnapshot([], [])
      setConversations([
        {
          id: newId,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: initialMessages,
          updatedAt: now,
          tasks: [],
        },
      ])
      setActiveConversationId(newId)
      updateActiveConversation(newId)
      setMessages(initialMessages)
      return
    }

    const firstConversation = conversations[0]
    const inflatedMessages = ensureTaskSnapshot(
      firstConversation.messages,
      firstConversation.tasks
    )
    setActiveConversationId(firstConversation.id)
    updateActiveConversation(firstConversation.id)
    setMessages(inflatedMessages)
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
      updateActiveConversation(fallback.id)
      setMessages(ensureTaskSnapshot(fallback.messages, fallback.tasks))
    } else {
      const newId = makeId()
      const now = Date.now()
      const initialMessages = ensureTaskSnapshot([], [])
      setConversations([
        {
          id: newId,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: initialMessages,
          updatedAt: now,
          tasks: [],
        },
      ])
      setActiveConversationId(newId)
      updateActiveConversation(newId)
      setMessages(initialMessages)
    }
  }, [
    conversationsReady,
    conversations,
    activeConversationId,
    setConversations,
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
        current.title !== nextTitle
      if (!needsUpdate) return prev

      const updatedConversation: Conversation = {
        id: activeConversationId,
        title: nextTitle,
        messages,
        updatedAt: Date.now(),
        tasks: cloneTaskList(tasks),
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
    const initialMessages = ensureTaskSnapshot([], [])
    setActiveConversationId(newId)
    updateActiveConversation(newId)
    setMessages(initialMessages)
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: initialMessages,
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
    setMessages,
    setConversations,
  ])

  const startNewConversation = useCallback(() => {
    if (!conversationsReady) return
    const newId = makeId()
    const now = Date.now()
    const initialMessages = ensureTaskSnapshot([], [])
    setActiveConversationId(newId)
    updateActiveConversation(newId)
    setMessages(initialMessages)
    setDraft("")
    setConversations((prev) => [
      {
        id: newId,
        title: DEFAULT_CONVERSATION_TITLE,
        messages: initialMessages,
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
  ])

  const selectConversation = useCallback(
    (id: string) => {
      if (!conversationsReady) return
      if (id === activeConversationId) return
      const conversation = conversations.find((c) => c.id === id)
      if (!conversation) return
      setActiveConversationId(conversation.id)
      updateActiveConversation(conversation.id)
      setMessages(ensureTaskSnapshot(conversation.messages, conversation.tasks))
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

  const deleteConversation = useCallback(
    (id: string) => {
      if (!conversationsReady) return
      const nextList = conversations.filter((c) => c.id !== id)
      setConversations(nextList)
      if (activeConversationId === id) {
        const nextActive = nextList[0]?.id ?? null
        setActiveConversationId(nextActive)
        updateActiveConversation(nextActive)
        if (nextActive) {
          const conv = nextList.find((c) => c.id === nextActive)
          setMessages(ensureTaskSnapshot(conv?.messages, conv?.tasks))
        } else {
          setMessages([])
        }
        setDraft("")
      }
    },
    [conversationsReady, conversations, activeConversationId, setConversations]
  )

  // Keep the shared task context bridge updated with latest active id and tasks
  useEffect(() => {
    updateActiveConversation(activeConversationId ?? null)
    if (activeConversationId) {
      updateTasksSnapshot(activeConversationId, tasks)
    }
  }, [activeConversationId, tasks])

  const mutateTasks = useCallback(
    (mutator: (prev: Task[]) => Task[]) => {
      const previous = tasksRef.current
      const draft = mutator(cloneTaskList(previous))
      const normalized = cloneTaskList(draft)
      if (taskListsEqual(previous, normalized)) {
        logTasksDebug("mutateTasks noop", normalized)
        return previous
      }
      logTasksDebug("mutateTasks next", normalized)
      tasksRef.current = normalized
      setMessages((prev) => [...prev, createTaskSnapshotEntry(normalized)])
      return normalized
    },
    [logTasksDebug, setMessages]
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
        logTasksDebug("createTaskNode invalid title", title)
        return { ok: false, error: "Task title is required" }
      }
      if (!conversationsReady) {
        logTasksDebug("createTaskNode conversations not ready")
        return { ok: false, error: "Conversation state not ready" }
      }
      const convId = ensureActiveConversation()
      if (!convId) {
        logTasksDebug("createTaskNode missing conversation id")
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
      logTasksDebug("createTaskNode constructed task", task)
      const nextTasks = mutateTasks((prev) => [...prev, task])
      logTasksDebug("createTaskNode mutate result", nextTasks)
      return { ok: true, tasks: nextTasks, task }
    },
    [conversationsReady, ensureActiveConversation, mutateTasks, logTasksDebug]
  )

  const addSubtask = useCallback(
    (taskId: string, title: string, completed?: boolean) => {
      const trimmed = (title ?? "").trim()
      if (!trimmed) return { ok: false, error: "Subtask title is required" }
      if (!conversationsReady || !activeConversationId) {
        logTasksDebug("addSubtask missing conversation", { taskId, title })
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
        logTasksDebug("addSubtask parent not found", { taskId, title })
        return { ok: false, error: "Parent task not found" }
      }
      logTasksDebug("addSubtask created", createdSubtask)
      return { ok: true, tasks: nextTasks, subtask: createdSubtask }
    },
    [mutateTasks, conversationsReady, activeConversationId, logTasksDebug]
  )

  const removeTask = useCallback(
    (id: string) => {
      if (!id) return { ok: false, error: "Task id is required" }
      if (!conversationsReady || !activeConversationId) {
        logTasksDebug("removeTask missing conversation", { id })
        return { ok: false, error: "No active conversation" }
      }
      let success = false
      const nextTasks = mutateTasks((prev) => {
        const idx = prev.findIndex((task) => task.id === id)
        if (idx === -1) return prev
        success = true
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
      })
      if (!success) {
        logTasksDebug("removeTask not found", { id })
        return { ok: false, error: "Task not found" }
      }
      logTasksDebug("removeTask success", { id, tasks: nextTasks })
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId, logTasksDebug]
  )

  const removeSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      if (!taskId || !subtaskId) {
        return { ok: false, error: "Task id and subtask id are required" }
      }
      if (!conversationsReady || !activeConversationId) {
        logTasksDebug("removeSubtask missing conversation", {
          taskId,
          subtaskId,
        })
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
      if (!success) {
        logTasksDebug("removeSubtask not found", { taskId, subtaskId })
        return { ok: false, error: "Subtask not found" }
      }
      logTasksDebug("removeSubtask success", {
        taskId,
        subtaskId,
        tasks: nextTasks,
      })
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId, logTasksDebug]
  )

  const addTask = useCallback(
    (title: string, subtasks?: Array<{ title: string; completed?: boolean }>) =>
      createTaskNode({ title, completed: false, subtasks }),
    [createTaskNode]
  )

  const addTasksBatch = useCallback(
    (
      tasksBatch: Array<{
        title: string
        completed?: boolean
        subtasks?: Array<{ title: string; completed?: boolean }>
      }>
    ) => {
      if (!tasksBatch.length) return { ok: true, tasks }
      if (!conversationsReady)
        return { ok: false, error: "Conversation state not ready" }
      const convId = ensureActiveConversation()
      if (!convId) return { ok: false, error: "Unable to resolve conversation" }
      let next = tasks
      for (const entry of tasksBatch) {
        const { title, completed, subtasks } = entry ?? {}
        const result = createTaskNode({
          title: title ?? "",
          completed,
          subtasks,
        })
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
        logTasksDebug("toggleTaskCompletion missing conversation", { id, done })
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
      if (!success) {
        logTasksDebug("toggleTaskCompletion task not found", { id })
        return { ok: false, error: "Task not found" }
      }
      logTasksDebug("toggleTaskCompletion success", {
        id,
        done,
        tasks: nextTasks,
      })
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId, logTasksDebug]
  )

  const toggleSubtaskCompletion = useCallback(
    (taskId: string, subtaskId: string, done?: boolean) => {
      if (!taskId || !subtaskId) {
        return { ok: false, error: "Task id and subtask id are required" }
      }
      if (!conversationsReady || !activeConversationId) {
        logTasksDebug("toggleSubtaskCompletion missing conversation", {
          taskId,
          subtaskId,
          done,
        })
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
      if (!success) {
        logTasksDebug("toggleSubtaskCompletion not found", {
          taskId,
          subtaskId,
        })
        return { ok: false, error: "Subtask not found" }
      }
      logTasksDebug("toggleSubtaskCompletion success", {
        taskId,
        subtaskId,
        done,
        tasks: nextTasks,
      })
      return { ok: true, tasks: nextTasks }
    },
    [mutateTasks, conversationsReady, activeConversationId, logTasksDebug]
  )

  const listTasks = useCallback(() => {
    if (!conversationsReady) {
      return { ok: true, tasks: [] as Task[] }
    }
    const currentId = activeConversationId ?? ensureActiveConversation()
    logTasksDebug("listTasks source", {
      conversationId: currentId,
      tasks: tasks,
    })
    return {
      ok: true,
      tasks: tasks.map((task) => ({
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
    tasks,
    logTasksDebug,
  ])

  const buildTaskListText = useCallback(() => {
    const { tasks } = listTasks()
    logTasksDebug("buildTaskListText tasks snapshot", tasks)
    if (!tasks.length) return "Current Task List: (none)"
    const lines: string[] = []
    tasks.forEach((task, idx) => {
      lines.push(`${idx + 1}. ${task.completed ? "[x]" : "[ ]"} ${task.title}`)
      if (task.subtasks.length) {
        task.subtasks.forEach((sub, subIdx) => {
          lines.push(
            `    ${idx + 1}.${subIdx + 1} ${sub.completed ? "[x]" : "[ ]"} ${sub.title}`
          )
        })
      }
    })
    const text = `Current Task List (latest):\n${lines.join("\n")}`
    logTasksDebug("buildTaskListText output", text)
    return text
  }, [listTasks, logTasksDebug])

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
      }) => {
        logTasksDebug("taskToolClient.createTask input", {
          title,
          completed,
          subtasks,
        })
        const result = createTaskNode({ title, completed, subtasks })
        logTasksDebug("taskToolClient.createTask result", result)
        return result
      },
      createTasks: async ({
        tasks: batch,
      }: {
        tasks: Array<{
          title: string
          completed?: boolean
          subtasks?: Array<{ title: string; completed?: boolean }>
        }>
      }) => {
        logTasksDebug("taskToolClient.createTasks input", batch)
        const result = addTasksBatch(Array.isArray(batch) ? batch : [])
        logTasksDebug("taskToolClient.createTasks result", result)
        return result
      },
      createSubtask: async ({
        taskId,
        title,
        completed,
      }: {
        taskId: string
        title: string
        completed?: boolean
      }) => {
        logTasksDebug("taskToolClient.createSubtask input", {
          taskId,
          title,
          completed,
        })
        const result = addSubtask(taskId, title, completed)
        logTasksDebug("taskToolClient.createSubtask result", result)
        return result
      },
      deleteTask: async ({
        taskId,
        parentTaskId,
      }: {
        taskId: string
        parentTaskId?: string
      }) => {
        logTasksDebug("taskToolClient.deleteTask input", {
          taskId,
          parentTaskId,
        })
        const result = parentTaskId
          ? removeSubtask(parentTaskId, taskId)
          : removeTask(taskId)
        logTasksDebug("taskToolClient.deleteTask result", result)
        return result
      },
      markTaskDone: async ({
        taskId,
        parentTaskId,
        done,
      }: {
        taskId: string
        parentTaskId?: string
        done?: boolean
      }) => {
        logTasksDebug("taskToolClient.markTaskDone input", {
          taskId,
          parentTaskId,
          done,
        })
        const result = parentTaskId
          ? toggleSubtaskCompletion(parentTaskId, taskId, done)
          : toggleTaskCompletion(taskId, done)
        logTasksDebug("taskToolClient.markTaskDone result", result)
        return result
      },
      listTasks: async () => {
        logTasksDebug("taskToolClient.listTasks invoked")
        const result = listTasks()
        logTasksDebug("taskToolClient.listTasks result", result)
        return result
      },
    }),
    [
      createTaskNode,
      addSubtask,
      removeTask,
      removeSubtask,
      toggleTaskCompletion,
      toggleSubtaskCompletion,
      listTasks,
      logTasksDebug,
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
        logTasksDebug("send invoking runChat", {
          prompt: fullPrompt,
          model,
          thinking,
          autoRunTools,
          historyForModel,
        })
        const { events } = await runChat({
          prompt: fullPrompt,
          model,
          thinkingEnabled: thinking,
          autoRunTools,
          history: historyForModel,
          taskClient: taskToolClient,
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
                const lastIdx = next.length - 1
                const last = lastIdx >= 0 ? next[lastIdx] : undefined
                if (last && last.kind === "ai") {
                  const existing = last as Extract<ChatEntry, { kind: "ai" }>
                  next[lastIdx] = { ...existing, text: full }
                  lastAiIdRef.current = existing.id
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
                const lastIdx = next.length - 1
                const last = lastIdx >= 0 ? next[lastIdx] : undefined
                if (last && last.kind === "thinking") {
                  const existing = last as Extract<ChatEntry, { kind: "thinking" }>
                  next[lastIdx] = { ...existing, text: tfull }
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
      logTasksDebug,
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

  const editAndResendUserMessage = useCallback(
    (id: string, newText: string) => {
      const trimmed = (newText ?? "").trim()
      if (!trimmed) return
      if (!conversationsReady) return
      // Truncate all messages from the specified user message onward
      setMessages((prev) => {
        const idx = prev.findIndex((e) => e.id === id && e.kind === "user")
        if (idx === -1) return prev
        return prev.slice(0, idx)
      })
      setDraft("")
      // Defer send to allow state to apply so history is rebuilt from truncated messages
      setTimeout(() => {
        void send(trimmed)
      }, 0)
    },
    [conversationsReady, send]
  )

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
    editAndResendUserMessage,
    conversations,
    activeConversationId,
    selectConversation,
    deleteConversation,
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
