import { ToolEvent } from "@/lib/genai"

export type TabCtx = {
  id?: number
  title?: string
  url?: string
  favIconUrl?: string
}

export type TimelineKind = "user" | "ai" | "thinking" | "tool"

export type TimelineEntryBase = {
  id: string
  kind: TimelineKind
}

export type Subtask = {
  id: string
  title: string
  completed: boolean
  createdAt: number
  updatedAt: number
}

export type Task = {
  id: string
  title: string
  completed: boolean
  createdAt: number
  updatedAt: number
  subtasks: Subtask[]
}

export type UserMessageEntry = TimelineEntryBase & {
  kind: "user"
  text: string
  ctxTabs?: TabCtx[]
  toolEvents?: import("@/lib/genai").ToolEvent[]
}

export type AiMessageEntry = TimelineEntryBase & {
  kind: "ai"
  text: string
  toolEvents?: import("@/lib/genai").ToolEvent[]
}

export type ThinkingEntry = TimelineEntryBase & {
  kind: "thinking"
  text: string
  toolEvents?: import("@/lib/genai").ToolEvent[]
}

export type ToolTimelineEntry = TimelineEntryBase & {
  kind: "tool"
  displayName?: string
  name: string
  args: any
  status: "calling" | "done"
  result?: any
  error?: string
  toolEvents?: ToolEvent[]
  text?: string
}

export type TaskStateEntry = TimelineEntryBase & {
  kind: "task_state"
  tasks: Task[]
}

export type ChatEntry =
  | UserMessageEntry
  | AiMessageEntry
  | ThinkingEntry
  | ToolTimelineEntry
  | TaskStateEntry

export type Conversation = {
  id: string
  title: string
  messages: ChatEntry[]
  updatedAt: number
  tasks?: Task[]
}

export type SavedCommand = {
  id: string
  name: string
  type: string
  text: string
}
