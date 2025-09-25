import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useEffect, useMemo, useState } from "react"
import { ChatInput } from "./ChatInput"
import { UnifiedPicker, type PickerMode } from "./UnifiedPicker"
import { useChatControllerContext } from "../context/ChatControllerContext"

export function ChatComposer() {
  const {
    draft,
    setDraft,
    streaming,
    handleSubmit,
    handleStop,
    textareaRef,
    tabPickerOpen,
    setTabPickerOpen,
    allTabs,
    setAllTabs,
    selectedTabIds,
    toggleTabSelection,
    removeSelectedTab,
    model,
    setModel,
    thinking,
    setThinking,
    autoRunTools,
    setAutoRunTools,
    savedCommands,
    setSavedCommands,
  } = useChatControllerContext()
  const selectedTabs = useMemo(
    () => allTabs.filter((t) => (t.id ? selectedTabIds.has(t.id) : false)),
    [allTabs, selectedTabIds]
  )
  const [pickerMode, setPickerMode] = useState<PickerMode>('tabs')

  useEffect(() => {
    console.log('[ChatComposer] tabPickerOpen state changed', { tabPickerOpen })
  }, [tabPickerOpen])

  return (
    <form
      className="sticky bottom-0 m-2 rounded-lg border bg-background p-2"
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit(draft)
      }}
    >
      <UnifiedPicker
        open={tabPickerOpen}
        mode={pickerMode}
        onOpenChange={setTabPickerOpen}
        anchor={
          <ChatInput
            draft={draft}
            setDraft={setDraft}
            streaming={streaming}
            onSubmit={() => handleSubmit(draft)}
            onStop={handleStop}
            textareaRef={textareaRef}
            onAtTrigger={() => {
              console.log('[ChatComposer] onAtTrigger -> open picker (tabs)')
              setPickerMode('tabs')
              setTabPickerOpen(true)
            }}
            onSlashTrigger={() => {
              console.log('[ChatComposer] onSlashTrigger -> open picker (commands)')
              setPickerMode('commands')
              setTabPickerOpen(true)
            }}
          />
        }
        allTabs={allTabs}
        setAllTabs={setAllTabs}
        selectedTabIds={selectedTabIds}
        onToggleTab={toggleTabSelection}
        savedCommands={savedCommands}
        setSavedCommands={setSavedCommands}
        onSelectCommand={(cmd) => {
          const ta = textareaRef.current
          const text = cmd.text
          if (!ta) {
            setDraft((prev) => (prev ? prev + '\n' + text : text))
            setTabPickerOpen(false)
            return
          }
          const start = ta.selectionStart ?? draft.length
          const end = ta.selectionEnd ?? draft.length
          const replaceFrom = start > 0 && draft[start - 1] === '/' ? start - 1 : start
          const nextDraft = draft.slice(0, replaceFrom) + text + draft.slice(end)
          setDraft(nextDraft)
          setTabPickerOpen(false)
          setTimeout(() => {
            try {
              const caret = replaceFrom + text.length
              ta.focus()
              ta.setSelectionRange(caret, caret)
            } catch {}
          }, 0)
        }}
      />
      {/* Debug: log tabPickerOpen changes */}
      {selectedTabs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedTabs.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"
            >
              {t.favIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.favIconUrl} alt="" className="h-3 w-3" />
              ) : (
                <div className="h-3 w-3 rounded-sm bg-background" />
              )}
              <span className="max-w-[200px] truncate">
                {t.title ?? "Untitled"}
              </span>
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (t.id != null) removeSelectedTab(t.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex w-[70%] items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="border-none text-xs text-muted-foreground">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
              <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Thinking</span>
          <Switch
            checked={thinking}
            onCheckedChange={(v) => setThinking(Boolean(v))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Auto-run tools</span>
          <Switch
            checked={autoRunTools}
            onCheckedChange={(v) => setAutoRunTools(Boolean(v))}
          />
        </div>
      </div>
    </form>
  )
}
