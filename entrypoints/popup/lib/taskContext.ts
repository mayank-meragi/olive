// A lightweight in-memory bridge for the latest active conversation and tasks.
// Sidebar code should call the update functions; genai.ts reads from here
// right before each request/iteration to ensure fresh task context.

export type Subtask = {
  id: string
  title: string
  completed: boolean
}

export type Task = {
  id: string
  title: string
  completed: boolean
  subtasks: Subtask[]
}

const state: {
  activeConversationId: string | null
  tasksByConversation: Map<string, Task[]>
} = {
  activeConversationId: null,
  tasksByConversation: new Map(),
}

const cloneTasks = (tasks: Task[]): Task[] =>
  tasks.map((t) => ({
    id: t.id,
    title: t.title,
    completed: !!t.completed,
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks.map((s) => ({ id: s.id, title: s.title, completed: !!s.completed }))
      : [],
  }))

export function updateActiveConversation(id: string | null) {
  state.activeConversationId = id ?? null
}

export function updateTasksSnapshot(conversationId: string, tasks: Task[]) {
  state.tasksByConversation.set(conversationId, cloneTasks(tasks))
}

export function getActiveConversationId(): string | null {
  return state.activeConversationId
}

export function getTasksForConversation(conversationId: string): Task[] {
  return state.tasksByConversation.get(conversationId) ?? []
}

export function buildTaskListTextForConversation(conversationId: string): string {
  const tasks = getTasksForConversation(conversationId)
  if (!tasks.length) return 'Current Task List: (none)'
  const lines: string[] = []
  tasks.forEach((task, idx) => {
    lines.push(`${idx + 1}. ${task.completed ? '[x]' : '[ ]'} ${task.title}`)
    if (task.subtasks.length) {
      task.subtasks.forEach((sub, subIdx) => {
        lines.push(`    ${idx + 1}.${subIdx + 1} ${sub.completed ? '[x]' : '[ ]'} ${sub.title}`)
      })
    }
  })
  return `Current Task List (latest):\n${lines.join('\n')}`
}

export function getLatestTaskInstruction(): { text: string } | undefined {
  const convId = getActiveConversationId()
  if (!convId) return undefined
  const text = buildTaskListTextForConversation(convId)
  return { text }
}

