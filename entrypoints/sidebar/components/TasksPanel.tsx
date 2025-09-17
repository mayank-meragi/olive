import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { BadgeCheck, ChevronDown, Circle } from 'lucide-react'
import type { Task } from '../types'

type TasksPanelProps = {
  tasks: Task[]
}

export function TasksPanel({
  tasks,
}: TasksPanelProps) {
  const [open, setOpen] = useState(() => tasks.length > 0)
  const prevCountRef = useRef(tasks.length)

  useEffect(() => {
    if (prevCountRef.current === 0 && tasks.length > 0) {
      setOpen(true)
    }
    prevCountRef.current = tasks.length
  }, [tasks.length])

  const sortedTasks = useMemo(() => tasks, [tasks])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tasks
        </div>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted"
            aria-label="Toggle tasks"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="overflow-hidden">
        <div className="space-y-3 border-t px-3 py-3">
          {sortedTasks.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No tasks yet.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTasks.map((task) => (
                <div key={task.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start gap-2">
                    {task.completed ? (
                      <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm ${
                            task.completed ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                      {task.subtasks.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {task.subtasks.map((sub) => (
                            <li key={sub.id} className="flex items-start gap-2">
                              {sub.completed ? (
                                <BadgeCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span
                                    className={`text-sm ${
                                      sub.completed ? 'text-muted-foreground line-through' : ''
                                    }`}
                                  >
                                    {sub.title}
                                  </span>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
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
