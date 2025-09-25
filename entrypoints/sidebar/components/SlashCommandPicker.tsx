import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SavedCommand } from '../types'

export function SlashCommandPicker({
  open,
  onOpenChange,
  savedCommands,
  setSavedCommands,
  onSelectCommand,
  anchorRef,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  savedCommands: SavedCommand[]
  setSavedCommands: React.Dispatch<React.SetStateAction<SavedCommand[]>>
  onSelectCommand: (cmd: SavedCommand) => void
  anchorRef: React.RefObject<HTMLElement | HTMLTextAreaElement | null>
}) {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newText, setNewText] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlightIndex(0)
    setAdding(false)
    const anchor = anchorRef.current
    if (anchor) {
      const rect = anchor.getBoundingClientRect()
      setPos({ top: rect.top - 8, left: rect.left })
    }
    const onWin = () => {
      const a = anchorRef.current
      if (!a) return
      const rect = a.getBoundingClientRect()
      setPos({ top: rect.top - 8, left: rect.left })
    }
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, anchorRef])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return savedCommands
    return savedCommands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.text.toLowerCase().includes(q)
    )
  }, [query, savedCommands])

  useEffect(() => {
    if (highlightIndex > Math.max(0, filtered.length - 1)) {
      setHighlightIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
    }
  }, [filtered.length, highlightIndex])

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-idx="${highlightIndex}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const handleAdd = () => {
    const name = newName.trim()
    const text = newText.trim()
    const type = newType.trim()
    if (!name || !text) return
    setSavedCommands((prev) => [{ id: makeId(), name, type, text }, ...prev])
    setNewName('')
    setNewType('')
    setNewText('')
    setAdding(false)
  }

  if (!open) return null
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed z-[9999] w-[360px] rounded-md border bg-popover text-popover-foreground shadow-lg"
        style={{ top: pos ? Math.max(8, pos.top) : 80, left: pos ? pos.left : 8 }}
      >
        <div className="p-2 pb-0">
          <Input
            ref={searchRef}
            placeholder="Search saved commands or add new"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (adding) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlightIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = filtered[highlightIndex]
                if (cmd) onSelectCommand(cmd)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onOpenChange(false)
              }
            }}
            className="h-8"
          />
        </div>
        <div className="flex items-center justify-between p-2 pt-1">
          <div className="text-xs text-muted-foreground">Saved Commands</div>
          <Button
            type="button"
            size="sm"
            variant={adding ? 'default' : 'outline'}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? 'Cancel' : 'New'}
          </Button>
        </div>
        {adding && (
          <div className="border-t p-2 space-y-2">
            <Input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8"
            />
            <Input
              placeholder="Type (optional)"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="h-8"
            />
            <textarea
              placeholder="Text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAdding(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={!newName.trim() || !newText.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        )}
        <div ref={listRef} className="max-h-64 overflow-auto p-2 pt-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No commands saved</div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                data-idx={i}
                onMouseEnter={() => setHighlightIndex(i)}
                className={
                  'flex w-full items-start gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent ' +
                  (i === highlightIndex ? 'outline outline-1 outline-primary' : '')
                }
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => onSelectCommand(c)}
                  title={c.text}
                >
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.type || 'Command'}</div>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSavedCommands((prev) => prev.filter((x) => x.id !== c.id))
                  }}
                  title="Delete"
                >
                  ✕
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-end border-t p-2">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </div>
    </>,
    document.body
  )
}
