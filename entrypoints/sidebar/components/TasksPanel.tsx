import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { Task } from '../types'

type TasksPanelProps = {
  tasks: Task[]
  onAddTask: (title: string) => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleTask: (taskId: string, done?: boolean) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done?: boolean) => void
  onDeleteTask: (taskId: string) => void
  onDeleteSubtask: (taskId: string, subtaskId: string) => void
  disabled?: boolean
}

export function TasksPanel({
  tasks,
  onAddTask,
  onAddSubtask,
  onToggleTask,
  onToggleSubtask,
  onDeleteTask,
  onDeleteSubtask,
  disabled = false,
}: TasksPanelProps) {
  const [open, setOpen] = useState(() => tasks.length > 0)
  const [newTask, setNewTask] = useState('')
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({})
  const prevCountRef = useRef(tasks.length)

  useEffect(() => {
    if (prevCountRef.current === 0 && tasks.length > 0) {
      setOpen(true)
    }
    prevCountRef.current = tasks.length
  }, [tasks.length])

  const sortedTasks = useMemo(() => tasks, [tasks])

  const handleAddTask = () => {
    const trimmed = newTask.trim()
    if (!trimmed) return
    onAddTask(trimmed)
    setNewTask('')
  }

  const handleAddSubtask = (taskId: string) => {
    const value = (subtaskDrafts[taskId] ?? '').trim()
    if (!value) return
    onAddSubtask(taskId, value)
    setSubtaskDrafts((prev) => ({ ...prev, [taskId]: '' }))
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tasks
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={disabled}
            aria-label="Add task"
            onClick={() => {
              if (disabled) return
              if (!newTask.trim()) {
                setOpen(true)
              } else {
                handleAddTask()
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Toggle tasks"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="overflow-hidden">
        <div className="space-y-3 border-t px-3 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!disabled) handleAddTask()
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task"
              disabled={disabled}
            />
            <Button type="submit" size="sm" disabled={disabled || !newTask.trim()}>
              Add
            </Button>
          </form>
          {sortedTasks.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No tasks yet.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTasks.map((task) => (
                <div key={task.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border"
                      checked={task.completed}
                      onChange={(event) =>
                        onToggleTask(task.id, event.currentTarget.checked)
                      }
                      disabled={disabled}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm ${
                            task.completed ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => onDeleteTask(task.id)}
                            disabled={disabled}
                            aria-label="Delete task"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {task.subtasks.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {task.subtasks.map((sub) => (
                            <li key={sub.id} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border"
                                checked={sub.completed}
                                onChange={(event) =>
                                  onToggleSubtask(
                                    task.id,
                                    sub.id,
                                    event.currentTarget.checked,
                                  )
                                }
                                disabled={disabled}
                              />
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span
                                    className={`text-sm ${
                                      sub.completed ? 'text-muted-foreground line-through' : ''
                                    }`}
                                  >
                                    {sub.title}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground"
                                    onClick={() => onDeleteSubtask(task.id, sub.id)}
                                    disabled={disabled}
                                    aria-label="Delete subtask"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form
                        className="mt-3 flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!disabled) handleAddSubtask(task.id)
                        }}
                      >
                        <Input
                          value={subtaskDrafts[task.id] ?? ''}
                          onChange={(e) =>
                            setSubtaskDrafts((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="Add a subtask"
                          disabled={disabled}
                          className="h-8"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            disabled || !(subtaskDrafts[task.id] ?? '').trim().length
                          }
                        >
                          Add
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
