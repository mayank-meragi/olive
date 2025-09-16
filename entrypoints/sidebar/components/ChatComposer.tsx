import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useMemo, type Dispatch, type SetStateAction } from "react"
import { ChatInput } from "./ChatInput"
import { TabPicker } from "./TabPicker"

type ChatComposerProps = {
  draft: string
  onDraftChange: (value: string) => void
  streaming: boolean
  onSubmit: (value: string) => void
  onStop: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  tabPickerOpen: boolean
  onTabPickerOpenChange: (open: boolean) => void
  allTabs: Array<Browser.tabs.Tab>
  setAllTabs: Dispatch<SetStateAction<Array<Browser.tabs.Tab>>>
  selectedTabIds: Set<number>
  onToggleTab: (id: number) => void
  onRemoveTab: (id: number) => void
  model: string
  onModelChange: (value: string) => void
  thinking: boolean
  onThinkingToggle: (value: boolean) => void
  autoRunTools: boolean
  onAutoRunToolsToggle: (value: boolean) => void
}

export function ChatComposer({
  draft,
  onDraftChange,
  streaming,
  onSubmit,
  onStop,
  textareaRef,
  tabPickerOpen,
  onTabPickerOpenChange,
  allTabs,
  setAllTabs,
  selectedTabIds,
  onToggleTab,
  onRemoveTab,
  model,
  onModelChange,
  thinking,
  onThinkingToggle,
  autoRunTools,
  onAutoRunToolsToggle,
}: ChatComposerProps) {
  const selectedTabs = useMemo(
    () => allTabs.filter((t) => (t.id ? selectedTabIds.has(t.id) : false)),
    [allTabs, selectedTabIds]
  )

  return (
    <form
      className="sticky bottom-0 m-2 rounded-lg border bg-background p-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft)
      }}
    >
      <TabPicker
        open={tabPickerOpen}
        onOpenChange={onTabPickerOpenChange}
        allTabs={allTabs}
        setAllTabs={setAllTabs}
        selectedTabIds={selectedTabIds}
        onToggle={onToggleTab}
        anchor={
          <ChatInput
            draft={draft}
            setDraft={onDraftChange}
            streaming={streaming}
            onSubmit={() => onSubmit(draft)}
            onStop={onStop}
            textareaRef={textareaRef}
            onAtTrigger={() => onTabPickerOpenChange(true)}
          />
        }
      />
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
                  if (t.id != null) onRemoveTab(t.id)
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
          <Select value={model} onValueChange={onModelChange}>
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
            onCheckedChange={(v) => onThinkingToggle(Boolean(v))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Auto-run tools</span>
          <Switch
            checked={autoRunTools}
            onCheckedChange={(v) => onAutoRunToolsToggle(Boolean(v))}
          />
        </div>
      </div>
    </form>
  )
}
