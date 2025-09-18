import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function TabPicker({
  open,
  onOpenChange,
  onToggle,
  allTabs,
  setAllTabs,
  selectedTabIds,
  anchor,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggle: (id: number) => void
  allTabs: Array<browser.tabs.Tab>
  setAllTabs: React.Dispatch<React.SetStateAction<Array<browser.tabs.Tab>>>
  selectedTabIds: Set<number>
  anchor: React.ReactNode
}) {
  const [tabQuery, setTabQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Load tabs when opened
  useEffect(() => {
    if (!open) return
    console.log('[TabPicker] open=true, querying tabs')
    ;(async () => {
      try {
        const tabs = await browser.tabs.query({})
        setAllTabs(tabs)
        console.log('[TabPicker] tabs loaded', { count: tabs.length })
      } catch {}
    })()
    setTabQuery('')
    setHighlightIndex(0)
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [open, setAllTabs])

  useEffect(() => {
    console.log('[TabPicker] open changed', { open })
  }, [open])

  // Debug: verify Popover content is mounted and visible when open
  useEffect(() => {
    if (!open) return
    const el = contentRef.current
    if (!el) {
      console.log('[TabPicker] contentRef not set')
      return
    }
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    console.log('[TabPicker] content rect/style', {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
    })
  }, [open])

  // Ensure highlighted item is visible
  useEffect(() => {
    const el = tabListRef.current?.querySelector(
      `[data-idx="${highlightIndex}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const filteredTabs = useMemo(() => {
    const q = tabQuery.trim().toLowerCase()
    if (!q) return allTabs
    return allTabs.filter(
      (t) => (t.title ?? '').toLowerCase().includes(q) || (t.url ?? '').toLowerCase().includes(q)
    )
  }, [allTabs, tabQuery])

  useEffect(() => {
    if (highlightIndex > Math.max(0, filteredTabs.length - 1)) {
      setHighlightIndex((i) => Math.min(i, Math.max(0, filteredTabs.length - 1)))
    }
  }, [filteredTabs.length, highlightIndex])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor>{anchor}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="z-[9999] w-[360px] p-0 border shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="tabpicker-content"
        ref={contentRef as any}
      >
        <div className="p-2 pb-0">
          <Input
            ref={searchRef}
            placeholder="Search tabs by title or URL"
            value={tabQuery}
            onChange={(e) => setTabQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlightIndex((i) => Math.min(i + 1, Math.max(0, filteredTabs.length - 1)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const t = filteredTabs[highlightIndex]
                const id = t?.id ?? -1
                if (id !== -1) onToggle(id)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onOpenChange(false)
              }
            }}
            className="h-8"
          />
        </div>
        <div ref={tabListRef} className="max-h-64 overflow-auto p-2 pt-1">
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
                    onToggle(id)
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
        <div className="flex items-center justify-between border-t p-2">
          <div className="text-xs text-muted-foreground">{selectedTabIds.size} selected</div>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
