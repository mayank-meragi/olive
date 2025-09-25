import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SavedCommand } from '../types'

export type PickerMode = 'tabs' | 'commands'

export function UnifiedPicker({
  open,
  mode,
  onOpenChange,
  anchor,
  // Tabs props
  allTabs,
  setAllTabs,
  selectedTabIds,
  onToggleTab,
  // Commands props
  savedCommands,
  setSavedCommands,
  onSelectCommand,
}: {
  open: boolean
  mode: PickerMode
  onOpenChange: (v: boolean) => void
  anchor: React.ReactElement
  allTabs: Array<browser.tabs.Tab>
  setAllTabs: React.Dispatch<React.SetStateAction<Array<browser.tabs.Tab>>>
  selectedTabIds: Set<number>
  onToggleTab: (id: number) => void
  savedCommands: SavedCommand[]
  setSavedCommands: React.Dispatch<React.SetStateAction<SavedCommand[]>>
  onSelectCommand: (cmd: SavedCommand) => void
}) {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [addingCmd, setAddingCmd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newText, setNewText] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlightIndex(0)
    setAddingCmd(false)
    if (mode === 'tabs') {
      ;(async () => {
        try {
          const tabs = await browser.tabs.query({})
          setAllTabs(tabs)
        } catch {}
      })()
    }
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [open, mode, setAllTabs])

  const filteredTabs = useMemo(() => {
    if (mode !== 'tabs') return []
    const q = query.trim().toLowerCase()
    if (!q) return allTabs
    return allTabs.filter(
      (t) => (t.title ?? '').toLowerCase().includes(q) || (t.url ?? '').toLowerCase().includes(q)
    )
  }, [mode, allTabs, query])

  const filteredCmds = useMemo(() => {
    if (mode !== 'commands') return []
    const q = query.trim().toLowerCase()
    if (!q) return savedCommands
    return savedCommands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.text.toLowerCase().includes(q)
    )
  }, [mode, query, savedCommands])

  useEffect(() => {
    const len = mode === 'tabs' ? filteredTabs.length : filteredCmds.length
    if (highlightIndex > Math.max(0, len - 1)) {
      setHighlightIndex((i) => Math.min(i, Math.max(0, len - 1)))
    }
  }, [filteredTabs.length, filteredCmds.length, highlightIndex, mode])

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-idx="${highlightIndex}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const handleAddCommand = () => {
    const name = newName.trim()
    const text = newText.trim()
    const type = newType.trim()
    if (!name || !text) return
    setSavedCommands((prev) => [{ id: makeId(), name, type, text }, ...prev])
    setNewName('')
    setNewType('')
    setNewText('')
    setAddingCmd(false)
  }

  const onEnter = () => {
    if (mode === 'tabs') {
      const t = filteredTabs[highlightIndex]
      const id = t?.id ?? -1
      if (id !== -1) onToggleTab(id)
    } else {
      const cmd = filteredCmds[highlightIndex]
      if (cmd) onSelectCommand(cmd)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor>{anchor}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="z-[9999] w-[360px] p-0 border shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 pb-0">
          <Input
            ref={searchRef}
            placeholder={mode === 'tabs' ? 'Search tabs by title or URL' : 'Search saved commands or add new'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (mode === 'commands' && addingCmd) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                const len = mode === 'tabs' ? filteredTabs.length : filteredCmds.length
                setHighlightIndex((i) => Math.min(i + 1, Math.max(0, len - 1)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                onEnter()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onOpenChange(false)
              }
            }}
            className="h-8"
          />
        </div>

        {mode === 'tabs' ? (
          <div ref={listRef} className="max-h-64 overflow-auto p-2 pt-1">
            <div className="mb-2 px-1 text-xs text-muted-foreground">Add tabs as context</div>
            {filteredTabs.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No tabs found</div>
            ) : (
              filteredTabs.map((t, i) => {
                const id = t.id ?? -1
                const selected = id !== -1 && selectedTabIds.has(id)
                const highlighted = i === highlightIndex
                return (
                  <button
                    key={id + (t.url ?? '')}
                    type="button"
                    className={
                      'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent ' +
                      (selected ? 'bg-accent ' : '') +
                      (highlighted ? 'outline outline-1 outline-primary' : '')
                    }
                    data-idx={i}
                    onClick={() => {
                      if (id === -1) return
                      onToggleTab(id)
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                  >
                    {t.favIconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.favIconUrl} alt="" className="h-4 w-4 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 shrink-0 rounded-sm bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.title ?? 'Untitled'}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.url ?? ''}</div>
                    </div>
                    {selected ? (
                      <span className="text-xs text-primary">Added</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Add</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-2 pt-1">
              <div className="text-xs text-muted-foreground">Saved Commands</div>
              <Button
                type="button"
                size="sm"
                variant={addingCmd ? 'default' : 'outline'}
                onClick={() => setAddingCmd((v) => !v)}
              >
                {addingCmd ? 'Cancel' : 'New'}
              </Button>
            </div>
            {addingCmd && (
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
                    onClick={() => setAddingCmd(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCommand}
                    disabled={!newName.trim() || !newText.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
            <div ref={listRef} className="max-h-64 overflow-auto p-2 pt-1">
              {filteredCmds.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">No commands saved</div>
              ) : (
                filteredCmds.map((c, i) => (
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
          </>
        )}
        <div className="flex items-center justify-end border-t p-2">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

