import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn, TaskToolClient } from "./types"

function normalizeSubtasks(subtasks: any[] | undefined) {
  if (!Array.isArray(subtasks)) return undefined
  return subtasks.map((entry) => ({
    title: String(entry?.title ?? ""),
    completed:
      typeof entry?.completed === "boolean" ? entry.completed : undefined,
  }))
}

export function createTaskTools({
  mustAllow,
  taskClient,
}: {
  mustAllow: MustAllowFn
  taskClient?: TaskToolClient
}): Record<string, ToolDefinition> {
  if (!taskClient) return {}

  const createTaskTool: ToolDefinition = {
    name: "create_task",
    displayName: "Create Task",
    description:
      "Create a task in the active Olive conversation, optionally with subtasks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: "Short description of the task or subtask.",
        },
        completed: {
          type: Type.BOOLEAN,
          description: "Set true to immediately mark the task/subtask as done.",
        },
        subtasks: {
          type: Type.ARRAY,
          description:
            "Optional array of subtasks to create along with the task.",
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "Subtask description.",
              },
              completed: {
                type: Type.BOOLEAN,
                description: "Set true to mark the subtask done.",
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["title"],
    },
    handler: async ({ title, completed, subtasks }) => {
      mustAllow()
      return await taskClient.createTask({
        title: String(title ?? ""),
        completed: typeof completed === "boolean" ? completed : undefined,
        subtasks: normalizeSubtasks(subtasks),
      })
    },
  }

  const tools: Record<string, ToolDefinition> = {
    [createTaskTool.name]: createTaskTool,
  }

  if (typeof taskClient.createTasks === "function") {
    tools.create_tasks = {
      name: "create_tasks",
      displayName: "Create Multiple Tasks",
      description:
        "Create multiple tasks (each optionally with subtasks) in a single call.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            description: "Array of task definitions to create.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Task description." },
                completed: {
                  type: Type.BOOLEAN,
                  description: "Set true to mark the task done.",
                },
                subtasks: {
                  type: Type.ARRAY,
                  description: "Optional array of subtasks for this task.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: {
                        type: Type.STRING,
                        description: "Subtask description.",
                      },
                      completed: {
                        type: Type.BOOLEAN,
                        description: "Set true to mark the subtask done.",
                      },
                    },
                    required: ["title"],
                  },
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
      handler: async ({ tasks }) => {
        mustAllow()
        const normalized = Array.isArray(tasks)
          ? tasks.map((task: any) => ({
              title: String(task?.title ?? ""),
              completed:
                typeof task?.completed === "boolean"
                  ? task.completed
                  : undefined,
              subtasks: normalizeSubtasks(task?.subtasks),
            }))
          : []
        return await taskClient.createTasks?.({ tasks: normalized })
      },
    }
  }

  tools.create_subtask = {
    name: "create_subtask",
    displayName: "Create Subtask",
    description: "Create a subtask under an existing task.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: "Parent task id where the subtask should be added.",
        },
        title: {
          type: Type.STRING,
          description: "Subtask description.",
        },
        completed: {
          type: Type.BOOLEAN,
          description: "Set true to mark the subtask as done immediately.",
        },
      },
      required: ["taskId", "title"],
    },
    handler: async ({ taskId, title, completed }) => {
      mustAllow()
      return await taskClient.createSubtask({
        taskId: String(taskId ?? ""),
        title: String(title ?? ""),
        completed: typeof completed === "boolean" ? completed : undefined,
      })
    },
  }

  tools.delete_task = {
    name: "delete_task",
    displayName: "Delete Task",
    description: "Delete a task or subtask by id in the active conversation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: "Id of the task or subtask to delete.",
        },
        parentTaskId: {
          type: Type.STRING,
          description: "If deleting a subtask, provide the parent task id.",
        },
      },
      required: ["taskId"],
    },
    handler: async ({ taskId, parentTaskId }) => {
      mustAllow()
      return await taskClient.deleteTask({
        taskId: String(taskId ?? ""),
        parentTaskId:
          typeof parentTaskId === "string" ? parentTaskId : undefined,
      })
    },
  }

  tools.mark_task_done = {
    name: "mark_task_done",
    displayName: "Mark Task Done",
    description:
      "Mark a task or subtask complete/incomplete. Provide done=false to reopen the task.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: "Id of the task or subtask to update.",
        },
        parentTaskId: {
          type: Type.STRING,
          description: "If updating a subtask, provide the parent task id.",
        },
        done: {
          type: Type.BOOLEAN,
          description:
            "Set to true for done, false for not done. Omit to toggle.",
        },
      },
      required: ["taskId"],
    },
    handler: async ({ taskId, parentTaskId, done }) => {
      mustAllow()
      return await taskClient.markTaskDone({
        taskId: String(taskId ?? ""),
        parentTaskId:
          typeof parentTaskId === "string" ? parentTaskId : undefined,
        done: typeof done === "boolean" ? done : undefined,
      })
    },
  }

  // Intentionally no list_tasks tool. The model receives an up-to-date
  // task context via system instructions.

  return tools
}
