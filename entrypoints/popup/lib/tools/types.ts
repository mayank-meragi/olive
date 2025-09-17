import type { ToolDefinition, ToolRegistry } from '../genai'

export type TaskCreationInput = {
  title: string
  completed?: boolean
  subtasks?: Array<{ title: string; completed?: boolean }>
}

export type TaskBatchCreationInput = {
  tasks: TaskCreationInput[]
}

export type SubtaskCreationInput = {
  taskId: string
  title: string
  completed?: boolean
}

export type TaskDeletionInput = {
  taskId: string
  parentTaskId?: string
}

export type TaskCompletionInput = {
  taskId: string
  parentTaskId?: string
  done?: boolean
}

export type TaskListResult = {
  ok: true
  tasks: Array<{
    id: string
    title: string
    completed: boolean
    subtasks: Array<{ id: string; title: string; completed: boolean }>
  }>
}

export type TaskToolClient = {
  createTask: (input: TaskCreationInput) => Promise<any>
  createTasks?: (input: TaskBatchCreationInput) => Promise<any>
  createSubtask: (input: SubtaskCreationInput) => Promise<any>
  deleteTask: (input: TaskDeletionInput) => Promise<any>
  markTaskDone: (input: TaskCompletionInput) => Promise<any>
  listTasks: () => Promise<TaskListResult>
}

export type MustAllowFn = () => void

export type ToolMap = ToolRegistry
export type ToolDef = ToolDefinition
